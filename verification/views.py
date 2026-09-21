"""
Verification views.

Security properties:
- All state reads come from the database, never from request data.
- User A cannot see or modify User B's verification (IDOR protection).
- The webhook endpoint validates HMAC signatures before processing.
- Replay attacks are blocked via WebhookEvent idempotency table.
- The mock completion endpoint is only available when DEBUG=True.
- Error messages never reveal internal state that would help bypass the system.
"""

import hashlib
import hmac
import logging

from django.conf import settings
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import UserVerification, VerificationStatus, WebhookEvent
from .providers.factory import get_provider
from .serializers import MockCompleteSerializer, StartVerificationSerializer, VerificationStatusSerializer
from .services import AntiFraudService, get_client_ip, log_security_event
from .throttles import VerificationStartThrottle, WebhookThrottle

logger = logging.getLogger("verification.security")


class VerificationStatusView(APIView):
    """
    GET /api/verification/status/

    Returns the current verification status for the authenticated user.
    IDOR protection: always reads the requesting user's own record.
    """

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        try:
            verification = request.user.verification
        except UserVerification.DoesNotExist:
            # Return a synthetic "not started" response without creating a DB record
            return Response(
                {"status": VerificationStatus.NOT_STARTED},
                status=status.HTTP_200_OK,
            )

        serializer = VerificationStatusSerializer(verification)
        return Response(serializer.data)


class VerificationStartView(APIView):
    """
    POST /api/verification/start/

    Creates (or restarts) a verification session for the authenticated user.

    Returns:
        { "session_id": "...", "redirect_url": "...", "status": "pending" }

    The frontend should redirect the user to redirect_url to complete
    the verification on the provider's hosted UI.
    """

    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [VerificationStartThrottle]

    def post(self, request):
        serializer = StartVerificationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        ip = get_client_ip(request)
        user = request.user

        # Anti-fraud check
        fraud_ok, fraud_reason = AntiFraudService.check_start_attempt(user, ip)
        if not fraud_ok:
            logger.warning("fraud_block user_id=%s reason=%s ip=%s", user.pk, fraud_reason, ip)
            # Return a generic error — don't reveal the specific fraud reason
            return Response(
                {"detail": "No es posible iniciar la verificación en este momento. Inténtalo más tarde."},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        # Block if already verified
        try:
            existing = user.verification
            if existing.is_fully_verified:
                return Response(
                    {"detail": "Tu identidad ya ha sido verificada.", "status": existing.status},
                    status=status.HTTP_200_OK,
                )
            # Allow restart if rejected/expired/blocked
            if existing.status == VerificationStatus.PENDING:
                return Response(
                    {
                        "detail": "Ya tienes una verificación en curso.",
                        "status": existing.status,
                        "provider_reference": existing.provider_reference,
                    },
                    status=status.HTTP_200_OK,
                )
        except UserVerification.DoesNotExist:
            existing = None

        # Create session with provider
        try:
            provider = get_provider()
            doc_type = serializer.validated_data.get("document_type", "")
            session = provider.create_session(
                user_id=user.pk,
                metadata={"document_type": doc_type},
            )
        except Exception as exc:
            logger.error("provider_error user_id=%s: %s", user.pk, exc)
            return Response(
                {"detail": "No se pudo iniciar la verificación. Inténtalo más tarde."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        # Persist or update the UserVerification record
        verification, _ = UserVerification.objects.get_or_create(user=user)
        verification.status = VerificationStatus.PENDING
        verification.provider = getattr(provider, "PROVIDER_NAME", "unknown")
        verification.provider_reference = session.session_id
        verification.verification_started_at = timezone.now()
        if doc_type:
            verification.document_type = doc_type
        verification.save()

        log_security_event(user.pk, "verification_started", {"provider": verification.provider}, ip)

        return Response(
            {
                "session_id": session.session_id,
                "redirect_url": session.redirect_url,
                "status": verification.status,
            },
            status=status.HTTP_201_CREATED,
        )


class VerificationWebhookView(APIView):
    """
    POST /api/verification/webhook/

    Receives webhook events from the identity verification provider.

    Security:
    - HMAC signature validation (rejects unauthenticated payloads).
    - Timestamp validation to prevent replay attacks.
    - WebhookEvent idempotency table to detect duplicate deliveries.
    - Never trusts user_id from the webhook payload — always looks up
      the session reference in our own database.
    - Does not store document images or selfie data.
    """

    permission_classes = []  # Auth is done via HMAC signature, not JWT
    authentication_classes = []
    throttle_classes = [WebhookThrottle]

    def post(self, request):
        payload = request.body
        signature = request.headers.get("X-Verification-Signature", "")

        if not signature:
            log_security_event(None, "webhook_invalid_signature", {"reason": "missing_header"})
            return Response({"detail": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)

        # Idempotency check — hash signature to avoid storing raw secrets
        event_hash = hashlib.sha256(signature.encode()).hexdigest()
        if WebhookEvent.objects.filter(event_id_hash=event_hash).exists():
            logger.info("webhook_duplicate event_hash=%s", event_hash[:16])
            return Response({"detail": "Already processed"}, status=status.HTTP_200_OK)

        # Validate signature and parse payload
        try:
            provider = get_provider()
            result = provider.process_webhook(payload, signature)
        except ValueError as exc:
            log_security_event(None, "webhook_invalid_signature", {"reason": str(exc)})
            logger.warning("webhook_invalid_sig: %s", exc)
            return Response({"detail": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)
        except Exception as exc:
            logger.error("webhook_parse_error: %s", exc)
            return Response({"detail": "Bad Request"}, status=status.HTTP_400_BAD_REQUEST)

        # Record idempotency (after successful parse, before DB updates)
        WebhookEvent.objects.create(
            event_id_hash=event_hash,
            provider=getattr(provider, "PROVIDER_NAME", "unknown"),
            action_taken=result.status,
        )

        # Look up our own record by provider_reference — NEVER trust user_id from payload
        try:
            verification = UserVerification.objects.select_related("user").get(
                provider_reference=result.session_id
            )
        except UserVerification.DoesNotExist:
            logger.warning("webhook_unknown_session session_id=%s", result.session_id)
            return Response({"detail": "OK"}, status=status.HTTP_200_OK)

        # Update verification state
        old_status = verification.status
        verification.status = result.status
        verification.age_verified = result.age_verified
        verification.identity_verified = result.identity_verified
        verification.face_match_verified = result.face_match_verified
        verification.liveness_verified = result.liveness_verified
        if result.document_type:
            verification.document_type = result.document_type
        if result.document_country:
            verification.document_country = result.document_country
        if result.rejection_reason:
            verification.rejection_reason = result.rejection_reason

        if result.status == VerificationStatus.VERIFIED:
            verification.verified_at = timezone.now()

        verification.save()

        # Security audit
        event_name = {
            VerificationStatus.VERIFIED: "verification_completed",
            VerificationStatus.REJECTED: "verification_rejected",
            VerificationStatus.MANUAL_REVIEW: "verification_manual_review",
            VerificationStatus.EXPIRED: "verification_expired",
        }.get(result.status, "verification_started")

        log_security_event(
            verification.user_id,
            event_name,
            {
                "provider": verification.provider,
                "old_status": old_status,
                "new_status": result.status,
                # Document type/country only — no images or numbers
                "document_type": result.document_type,
                "document_country": result.document_country,
            },
        )

        logger.info(
            "webhook_processed session=%s user_id=%s status=%s->%s",
            result.session_id,
            verification.user_id,
            old_status,
            result.status,
        )

        return Response({"detail": "OK"}, status=status.HTTP_200_OK)


class MockCompleteView(APIView):
    """
    POST /api/verification/mock/complete/

    DEV/TEST ONLY — not registered in production URLs.

    Allows tests and the development UI to advance a mock session to
    a specific outcome without a real provider sending a webhook.
    """

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        if not settings.DEBUG:
            return Response({"detail": "Not found"}, status=status.HTTP_404_NOT_FOUND)

        serializer = MockCompleteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        from .providers.mock import MockIdentityVerificationProvider

        session_id = serializer.validated_data["session_id"]
        outcome = serializer.validated_data["outcome"]

        payload, signature = MockIdentityVerificationProvider.build_mock_webhook_payload(session_id, outcome)

        # Reuse the webhook view logic
        webhook_view = VerificationWebhookView.as_view()
        from django.test import RequestFactory
        factory = RequestFactory()
        fake_request = factory.post(
            "/api/verification/webhook/",
            data=payload,
            content_type="application/json",
            HTTP_X_VERIFICATION_SIGNATURE=signature,
        )
        response = webhook_view(fake_request)

        # Re-read the result from DB to return fresh state
        try:
            verification = request.user.verification
            return Response(
                {
                    "detail": "Mock verification advanced.",
                    "status": verification.status,
                    "is_fully_verified": verification.is_fully_verified,
                },
                status=status.HTTP_200_OK,
            )
        except UserVerification.DoesNotExist:
            return Response({"detail": "Verification record not found."}, status=status.HTTP_404_NOT_FOUND)
