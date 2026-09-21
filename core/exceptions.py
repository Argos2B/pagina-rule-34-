import logging

from rest_framework.views import exception_handler as drf_exception_handler

logger = logging.getLogger("api.errors")


def custom_exception_handler(exc, context):
    """Wrap DRF's default handler to avoid leaking internals and to log server errors."""

    response = drf_exception_handler(exc, context)

    if response is None:
        # Unhandled exception: DRF would let Django return a 500 HTML page.
        # Log it with context and return a generic JSON error instead.
        request = context.get("request")
        logger.exception(
            "Unhandled exception on %s %s",
            getattr(request, "method", "?"),
            getattr(request, "path", "?"),
            exc_info=exc,
        )
        return None

    if response.status_code >= 500:
        logger.error("API server error: %s", response.data)

    return response
