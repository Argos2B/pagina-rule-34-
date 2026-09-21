"""
Abstract base class for Identity Verification providers.

This abstraction layer allows the platform to switch between providers
(Stripe Identity, Veriff, Onfido, IDnow, etc.) without rewriting the
core verification logic.

To add a new provider:
1. Create a new file in this package (e.g., `stripe_identity.py`).
2. Subclass `IdentityVerificationProvider`.
3. Implement all abstract methods.
4. Register the provider name in `factory.py`.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any


@dataclass
class SessionResult:
    """Returned by create_session(). Contains the data needed to redirect the user."""
    session_id: str          # Provider's session/verification ID
    redirect_url: str        # URL to send the user to complete the verification
    raw: dict = field(default_factory=dict)  # Raw provider response (not stored in DB)


@dataclass
class VerificationResult:
    """Parsed result from get_status() or process_webhook()."""
    session_id: str
    status: str              # Maps to VerificationStatus values
    age_verified: bool = False
    identity_verified: bool = False
    face_match_verified: bool = False
    liveness_verified: bool = False
    document_type: str = ""
    document_country: str = ""
    rejection_reason: str = ""
    raw: dict = field(default_factory=dict)  # Raw response — never persisted


class IdentityVerificationProvider(ABC):
    """
    Abstract base for identity verification / KYC providers.

    Implementations must NOT:
    - Store document images or selfies on our servers.
    - Return biometric templates or full document numbers.
    - Trust data sent directly from the browser.

    Implementations MUST:
    - Validate webhook signatures before processing.
    - Return only the parsed result, not raw sensitive data.
    """

    @abstractmethod
    def create_session(self, user_id: int, metadata: dict | None = None) -> SessionResult:
        """
        Create a new verification session for the given user.

        The provider allocates a session, returns a redirect URL where the
        user will complete the document scan + selfie. The actual biometric
        processing happens on the provider's infrastructure.

        Args:
            user_id: Internal platform user ID (used as correlation metadata).
            metadata: Optional extra metadata to include in the session.

        Returns:
            SessionResult with session_id and redirect_url.
        """
        ...

    @abstractmethod
    def get_status(self, session_id: str) -> VerificationResult:
        """
        Poll the provider for the current verification status.

        Used as a fallback when webhook delivery fails or for manual checks.

        Args:
            session_id: Provider's session ID.

        Returns:
            VerificationResult with current state.
        """
        ...

    @abstractmethod
    def process_webhook(self, payload: bytes, signature: str) -> VerificationResult:
        """
        Validate and parse an incoming webhook event from the provider.

        The implementation MUST verify the HMAC/signature before returning
        any result. Must raise ValueError if the signature is invalid.

        Args:
            payload: Raw request body bytes (used for signature verification).
            signature: Value from the provider's signature header.

        Returns:
            VerificationResult parsed from the validated payload.

        Raises:
            ValueError: If the signature is invalid.
            KeyError: If required fields are missing from the payload.
        """
        ...

    @abstractmethod
    def cancel_session(self, session_id: str) -> bool:
        """
        Cancel an in-progress verification session.

        Args:
            session_id: Provider's session ID.

        Returns:
            True if cancelled successfully.
        """
        ...

    @abstractmethod
    def delete_verification_data(self, session_id: str) -> bool:
        """
        Request deletion of all verification data from the provider's systems.

        Called on user account deletion or explicit data erasure request (GDPR).

        Args:
            session_id: Provider's session ID whose data should be erased.

        Returns:
            True if deletion was acknowledged by the provider.
        """
        ...
