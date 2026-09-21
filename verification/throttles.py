"""
Rate throttles for verification endpoints.

Inherits the _SelfContainedScopedThrottle pattern from core.throttles
to guarantee that the scope is bound to the class, not the view.
"""

from core.throttles import _SelfContainedScopedThrottle


class VerificationStartThrottle(_SelfContainedScopedThrottle):
    """
    Throttle for POST /api/verification/start/.

    Strictly limited to prevent abuse of the provider's API and to
    complement the AntiFraudService time-based checks.
    Rate defined in settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]["verification_start"].
    """
    scope = "verification_start"


class WebhookThrottle(_SelfContainedScopedThrottle):
    """
    Throttle for POST /api/verification/webhook/.

    The webhook endpoint should only receive traffic from the provider,
    so a generous rate is acceptable here. The primary protection is the
    HMAC signature validation, not rate limiting.
    Rate defined in settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]["webhook"].
    """
    scope = "webhook"
