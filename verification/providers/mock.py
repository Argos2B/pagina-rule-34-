"""
Mock Identity Verification Provider.

ONLY available in development (DEBUG=True) and test environments.
NEVER enabled in production.

This mock simulates the complete verification flow without making any
external API calls. It is designed for:
- Local development without a paid provider account.
- Automated test suites.
- CI/CD pipelines.

The mock uses a deterministic outcome based on the metadata passed to
create_session(), making it easy to test all verification states.

Outcome triggers (via metadata["mock_outcome"]):
    "verified"       → All flags True, status VERIFIED
    "rejected"       → status REJECTED, no flags set
    "manual_review"  → status MANUAL_REVIEW
    "expired"        → status EXPIRED
    (default)        → status PENDING (webhook must be sent to advance)
"""

import hashlib
import hmac
import json
import logging
import time
import uuid

from django.conf import settings

from .base import IdentityVerificationProvider, SessionResult, VerificationResult
from ..models import VerificationStatus

logger = logging.getLogger("verification.security")

_MOCK_SESSIONS: dict[str, dict] = {}  # In-memory store — cleared on server restart


class MockIdentityVerificationProvider(IdentityVerificationProvider):
    """
    Development-only mock provider.

    Warning: This provider performs NO real identity checks. It must
    NEVER be enabled in a production environment. The factory enforces this.
    """

    PROVIDER_NAME = "mock"
    _MOCK_WEBHOOK_SECRET = "mock-webhook-secret-dev-only"

    def __init__(self):
        if not settings.DEBUG:
            raise RuntimeError(
                "MockIdentityVerificationProvider cannot be used outside DEBUG mode. "
                "Set VERIFICATION_PROVIDER to a real provider in production."
            )

    def create_session(self, user_id: int, metadata: dict | None = None) -> SessionResult:
        meta = metadata or {}
        session_id = f"mock_{uuid.uuid4().hex}"
        outcome = meta.get("mock_outcome", "pending")

        _MOCK_SESSIONS[session_id] = {
            "user_id": user_id,
            "outcome": outcome,
            "created_at": time.time(),
        }

        # Identity verification is paused, so the mock no longer redirects to a
        # frontend completion screen. Keep a harmless URL for dormant tests/tools.
        frontend_url = getattr(settings, "FRONTEND_URL", "http://localhost:5173")
        redirect_url = frontend_url

        logger.info("mock_provider: session_created user_id=%s session=%s outcome=%s", user_id, session_id, outcome)

        return SessionResult(
            session_id=session_id,
            redirect_url=redirect_url,
        )

    def get_status(self, session_id: str) -> VerificationResult:
        session = _MOCK_SESSIONS.get(session_id)
        if not session:
            return VerificationResult(session_id=session_id, status=VerificationStatus.REJECTED, rejection_reason="Session not found")

        outcome = session.get("outcome", "pending")
        return self._build_result(session_id, outcome)

    def process_webhook(self, payload: bytes, signature: str) -> VerificationResult:
        """Validate mock HMAC signature and return the parsed result."""
        expected = hmac.new(
            self._MOCK_WEBHOOK_SECRET.encode(),
            payload,
            hashlib.sha256,
        ).hexdigest()

        if not hmac.compare_digest(expected, signature):
            raise ValueError("Invalid mock webhook signature")

        try:
            data = json.loads(payload)
        except json.JSONDecodeError as exc:
            raise ValueError("Invalid webhook payload") from exc

        session_id = data.get("session_id", "")
        outcome = data.get("outcome", "pending")

        # Update in-memory state
        if session_id in _MOCK_SESSIONS:
            _MOCK_SESSIONS[session_id]["outcome"] = outcome

        return self._build_result(session_id, outcome)

    def cancel_session(self, session_id: str) -> bool:
        _MOCK_SESSIONS.pop(session_id, None)
        return True

    def delete_verification_data(self, session_id: str) -> bool:
        _MOCK_SESSIONS.pop(session_id, None)
        return True

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _build_result(session_id: str, outcome: str) -> VerificationResult:
        status_map = {
            "verified": VerificationStatus.VERIFIED,
            "rejected": VerificationStatus.REJECTED,
            "manual_review": VerificationStatus.MANUAL_REVIEW,
            "expired": VerificationStatus.EXPIRED,
        }
        status = status_map.get(outcome, VerificationStatus.PENDING)

        if status == VerificationStatus.VERIFIED:
            return VerificationResult(
                session_id=session_id,
                status=status,
                age_verified=True,
                identity_verified=True,
                face_match_verified=True,
                liveness_verified=True,
                document_type="passport",
                document_country="CR",
            )
        elif status == VerificationStatus.REJECTED:
            return VerificationResult(
                session_id=session_id,
                status=status,
                rejection_reason="Mock rejection — document could not be verified",
            )
        elif status == VerificationStatus.MANUAL_REVIEW:
            return VerificationResult(
                session_id=session_id,
                status=status,
                rejection_reason="Flagged for manual review",
            )
        else:
            return VerificationResult(session_id=session_id, status=status)

    @staticmethod
    def build_mock_webhook_payload(session_id: str, outcome: str) -> tuple[bytes, str]:
        """
        Helper for tests: build a properly signed mock webhook payload.

        Returns:
            (payload_bytes, signature_hex)
        """
        payload = json.dumps({"session_id": session_id, "outcome": outcome}).encode()
        secret = MockIdentityVerificationProvider._MOCK_WEBHOOK_SECRET
        signature = hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()
        return payload, signature
