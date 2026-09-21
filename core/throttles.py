from rest_framework.throttling import SimpleRateThrottle


class _SelfContainedScopedThrottle(SimpleRateThrottle):
    """Like DRF's ``ScopedRateThrottle``, but the scope lives on the throttle
    class itself instead of being read from ``view.throttle_scope`` at request
    time. ``ScopedRateThrottle.allow_request`` always overwrites ``self.scope``
    from the view attribute (and silently disables throttling entirely if a
    view forgets to set it), which is a footgun for future endpoints. Making
    the scope a first-class attribute of the throttle class removes that
    failure mode: attaching the throttle class is enough on its own.
    """

    def get_cache_key(self, request, view):
        if request.user and request.user.is_authenticated:
            ident = request.user.pk
        else:
            ident = self.get_ident(request)
        return self.cache_format % {"scope": self.scope, "ident": ident}


class AuthRateThrottle(_SelfContainedScopedThrottle):
    """Throttle for register/login attempts to slow down brute force / abuse."""

    scope = "auth"


class PasswordResetRateThrottle(_SelfContainedScopedThrottle):
    """Throttle for password reset / email verification requests to prevent email-bombing abuse."""

    scope = "password_reset"


class ContentWriteRateThrottle(_SelfContainedScopedThrottle):
    """Throttle for creating user-generated content (posts, comments, reports)
    to limit spam/abuse beyond the generic per-user hourly rate.
    """

    scope = "content_write"
