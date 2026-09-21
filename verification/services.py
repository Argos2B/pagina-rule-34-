"""
Services for dormant age verification support and active content moderation.

The identity verification gate is intentionally disabled until a professional
provider is selected. Content moderation remains active for uploads.
"""

import logging

from .models import SecurityAuditLog

logger = logging.getLogger("verification.security")


# ---------------------------------------------------------------------------
# Core publish eligibility check
# ---------------------------------------------------------------------------

def can_user_publish(user) -> tuple[bool, str]:
    """
    Compatibility hook for the paused identity verification gate.

    Args:
        user: An authenticated Django user instance.

    Returns:
        (True, "") for authenticated users while identity verification is
        temporarily disabled. Keep the function so future provider work has a
        stable integration point.
    """
    if not user or not user.is_authenticated:
        return False, "unauthenticated"

    return True, ""


# ---------------------------------------------------------------------------
# Audit logging
# ---------------------------------------------------------------------------

def _log_security_event(user_id: int | None, event: str, metadata: dict, ip_address: str | None = None) -> None:
    """
    Persist a security audit event.

    IMPORTANT: metadata must NEVER contain:
    - Document images or selfies
    - Full document numbers
    - API keys or secrets
    - Biometric data
    """
    # Strip any accidentally included sensitive keys before persisting
    _FORBIDDEN_KEYS = {"image", "selfie", "document_scan", "api_key", "secret", "password", "token"}
    safe_metadata = {k: v for k, v in metadata.items() if k.lower() not in _FORBIDDEN_KEYS}

    SecurityAuditLog.objects.create(
        user_id=user_id,
        event=event,
        metadata=safe_metadata,
        ip_address=ip_address,
    )
    logger.info("security_event=%s user_id=%s", event, user_id)


def log_security_event(user_id: int | None, event: str, metadata: dict | None = None, ip_address: str | None = None) -> None:
    """Public wrapper for security audit logging."""
    _log_security_event(user_id, event, metadata or {}, ip_address)


def get_client_ip(request) -> str | None:
    """Extract the real client IP from the request (proxy-aware)."""
    x_forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR")
    if x_forwarded_for:
        # Take the first IP in the chain (the client's)
        return x_forwarded_for.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


# ---------------------------------------------------------------------------
# Anti-fraud service
# ---------------------------------------------------------------------------

class AntiFraudService:
    """
    Detects suspicious verification patterns.

    This is a stub with rule-based heuristics. It can be extended to call
    a dedicated anti-fraud provider (e.g., Sift, Sardine) in the future.

    Does NOT rely solely on IP address as an identifier.
    """

    # How many verification attempts are allowed before flagging
    MAX_ATTEMPTS_PER_USER = 5
    # Minimum seconds between consecutive start attempts
    MIN_SECONDS_BETWEEN_STARTS = 60

    @staticmethod
    def check_start_attempt(user, ip_address: str | None = None) -> tuple[bool, str]:
        """
        Check whether a verification start request is suspicious.

        Returns:
            (True, "") if the attempt seems legitimate.
            (False, reason) if it should be blocked.
        """
        from django.utils import timezone
        from datetime import timedelta

        # Count recent attempts by this user
        recent_cutoff = timezone.now() - timedelta(hours=24)
        recent_attempts = SecurityAuditLog.objects.filter(
            user_id=user.pk,
            event="verification_started",
            created_at__gte=recent_cutoff,
        ).count()

        if recent_attempts >= AntiFraudService.MAX_ATTEMPTS_PER_USER:
            log_security_event(
                user.pk,
                "suspicious_verification",
                {"reason": "too_many_attempts", "count": recent_attempts},
                ip_address,
            )
            return False, "too_many_attempts"

        # Check for suspiciously rapid consecutive attempts
        last_attempt = SecurityAuditLog.objects.filter(
            user_id=user.pk,
            event="verification_started",
        ).order_by("-created_at").first()

        if last_attempt:
            elapsed = (timezone.now() - last_attempt.created_at).total_seconds()
            if elapsed < AntiFraudService.MIN_SECONDS_BETWEEN_STARTS:
                log_security_event(
                    user.pk,
                    "suspicious_verification",
                    {"reason": "too_rapid", "elapsed_seconds": elapsed},
                    ip_address,
                )
                return False, "too_rapid"

        return True, ""


# ---------------------------------------------------------------------------
# Content moderation service (stub / interface)
# ---------------------------------------------------------------------------

class ContentModerationService:
    """
    Interface for post-upload content moderation.

    This is a stub that acts as a pass-through in development. In production,
    connect it to a specialized provider such as:
    - Amazon Rekognition (for general NSFW detection)
    - Microsoft Azure Content Moderator
    - NCMEC CyberTipline API (for CSAM reporting — mandatory for platforms
      with user-generated adult content in many jurisdictions)
    - Google Cloud Vision SafeSearch

    Do NOT build your own CSAM classifier. Use specialized providers.

    Pipeline: UPLOAD → FILE_VALIDATION → CONTENT_MODERATION → SAFETY → PUBLISH
    """

    class ModerationDecision:
        ALLOW = "allow"
        BLOCK = "block"
        REVIEW = "review"

    @staticmethod
    def moderate(file, user_id: int | None = None) -> tuple[str, str]:
        """
        Run content moderation on an uploaded file.

        Args:
            file: The uploaded file object (already validated by upload validators).
            user_id: The uploader's ID for audit purposes.

        Returns:
            (decision, reason) where decision is one of ModerationDecision.*
            - ALLOW: Content is safe to publish
            - BLOCK: Content violates policies; reject immediately (403)
            - REVIEW: Content flagged for manual review; hide until moderator approves
        """
        if not file:
            return ContentModerationService.ModerationDecision.BLOCK, "File missing"

        try:
            filename = getattr(file, "name", "unknown")
        except Exception:
            filename = "unknown"

        logger.debug(f"ContentModerationService.moderate: file={filename} user_id={user_id}")

        if not ContentModerationService._validate_file_basics(file):
            return ContentModerationService.ModerationDecision.BLOCK, "File validation failed"

        decision, reason = ContentModerationService._check_content(file, user_id)

        if decision != ContentModerationService.ModerationDecision.ALLOW:
            logger.warning(f"moderation_decision={decision} user_id={user_id} reason={reason}")
            _log_security_event(
                user_id,
                "moderation_" + ("block" if decision == ContentModerationService.ModerationDecision.BLOCK else "review"),
                {"reason": reason, "filename": filename},
            )

        return decision, reason

    @staticmethod
    def _validate_file_basics(file) -> bool:
        """Ensure file is already validated (size, format)."""
        if not hasattr(file, "size"):
            return False
        from django.conf import settings

        max_size = settings.MAX_UPLOAD_SIZE_BYTES
        if file.size > max_size:
            return False

        return True

    @staticmethod
    def _check_content(file, user_id: int | None = None) -> tuple[str, str]:
        """
        Check file content for policy violations.

        In development: pass-through.
        In production: call real provider (Amazon Rekognition, Azure, etc.).
        """
        if not ContentModerationService._is_real_provider_configured():
            logger.debug("ContentModerationService: no real provider configured, pass-through")
            return ContentModerationService.ModerationDecision.ALLOW, ""

        try:
            decision, reason = ContentModerationService._call_real_provider(file)
            return decision, reason
        except Exception as exc:
            logger.error(f"ContentModerationService provider error: {exc}")
            return ContentModerationService.ModerationDecision.REVIEW, f"Moderation service error: {str(exc)}"

    @staticmethod
    def _is_real_provider_configured() -> bool:
        """Check if a real content moderation provider is configured."""
        from django.conf import settings
        return getattr(settings, "CONTENT_MODERATION_PROVIDER", None) is not None

    @staticmethod
    def _call_real_provider(file) -> tuple[str, str]:
        """
        Call the configured content moderation provider.

        Placeholder for future integration with:
        - AWS Rekognition
        - Azure Content Moderator
        - Google Cloud Vision SafeSearch
        - NCMEC CyberTipline (for mandatory CSAM reporting)

        Returns: (decision, reason)
        """
        from django.conf import settings

        provider_name = getattr(settings, "CONTENT_MODERATION_PROVIDER", None)

        if provider_name == "aws_rekognition":
            return ContentModerationService._aws_rekognition(file)
        if provider_name == "azure":
            return ContentModerationService._azure_moderator(file)

        logger.warning(f"Unknown content moderation provider: {provider_name}")
        return ContentModerationService.ModerationDecision.REVIEW, "Unknown provider"

    @staticmethod
    def _aws_rekognition(file) -> tuple[str, str]:
        """
        AWS Rekognition integration (placeholder).

        TODO: Implement actual AWS SDK calls:
        1. Upload to S3 (temporary)
        2. Call detect_explicit_content()
        3. Parse ModerationLabels
        4. Return decision based on confidence thresholds
        5. Clean up temporary S3 object
        """
        logger.debug("AWS Rekognition: not yet implemented")
        return ContentModerationService.ModerationDecision.ALLOW, ""

    @staticmethod
    def _azure_moderator(file) -> tuple[str, str]:
        """
        Azure Content Moderator integration (placeholder).

        TODO: Implement actual Azure SDK calls:
        1. Call evaluate_file_data()
        2. Check isImageAdultClassified, isImageRacyClassified
        3. Return decision based on confidence thresholds
        """
        logger.debug("Azure Content Moderator: not yet implemented")
        return ContentModerationService.ModerationDecision.ALLOW, ""
