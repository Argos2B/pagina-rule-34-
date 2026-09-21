"""
Provider factory.

Reads VERIFICATION_PROVIDER from environment and returns the appropriate
IdentityVerificationProvider instance.

Supported values:
    mock          → MockIdentityVerificationProvider (DEBUG/test only)
    <future>      → Add new adapters here when integrating a real provider

Production safety:
    If DEBUG=False and VERIFICATION_PROVIDER is not set or is "mock",
    the factory raises ImproperlyConfigured to prevent the platform from
    accepting uploads without real age verification.
"""

import logging

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured

from .base import IdentityVerificationProvider

logger = logging.getLogger("verification.security")


def get_provider() -> IdentityVerificationProvider:
    """
    Instantiate and return the configured identity verification provider.

    Raises:
        ImproperlyConfigured: In production if VERIFICATION_PROVIDER is
            missing, empty, or set to "mock".
    """
    provider_name = getattr(settings, "VERIFICATION_PROVIDER", "").lower().strip()

    # ------------------------------------------------------------------ #
    # Production safety guard                                              #
    # ------------------------------------------------------------------ #
    if not settings.DEBUG:
        if not provider_name or provider_name == "mock":
            raise ImproperlyConfigured(
                "VERIFICATION_PROVIDER must be set to a real provider in production. "
                "The mock provider is not allowed when DEBUG=False. "
                "Set VERIFICATION_PROVIDER to your identity verification provider name."
            )

    # ------------------------------------------------------------------ #
    # Mock (development / test)                                            #
    # ------------------------------------------------------------------ #
    if provider_name == "mock" or (not provider_name and settings.DEBUG):
        from .mock import MockIdentityVerificationProvider
        logger.warning(
            "Using MOCK identity verification provider. "
            "This provider performs NO real identity checks. "
            "Do NOT use in production."
        )
        return MockIdentityVerificationProvider()

    # ------------------------------------------------------------------ #
    # Future real providers — add cases here                              #
    # ------------------------------------------------------------------ #
    # Example (not yet implemented — adapter skeleton only):
    # if provider_name == "stripe_identity":
    #     from .stripe_identity import StripeIdentityProvider
    #     return StripeIdentityProvider(
    #         api_key=settings.VERIFICATION_API_KEY,
    #         webhook_secret=settings.VERIFICATION_WEBHOOK_SECRET,
    #     )
    #
    # if provider_name == "veriff":
    #     from .veriff import VeriffProvider
    #     return VeriffProvider(
    #         api_key=settings.VERIFICATION_API_KEY,
    #         webhook_secret=settings.VERIFICATION_WEBHOOK_SECRET,
    #     )

    raise ImproperlyConfigured(
        f"Unknown VERIFICATION_PROVIDER: '{provider_name}'. "
        "See verification/providers/factory.py for supported values."
    )
