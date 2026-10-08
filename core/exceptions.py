import logging

from rest_framework.views import exception_handler as drf_exception_handler

logger = logging.getLogger("api.errors")


def _v1_error_code(status_code):
    if status_code == 400:
        return "validation_error"
    if status_code == 401:
        return "authentication_required"
    if status_code == 403:
        return "permission_denied"
    if status_code == 404:
        return "not_found"
    return "server_error"


def _v1_error_message(error_detail):
    if isinstance(error_detail, dict):
        detail = error_detail.get("detail") or error_detail.get("non_field_errors")
        if detail:
            if isinstance(detail, list):
                return str(detail[0])
            return str(detail)
        for value in error_detail.values():
            if isinstance(value, list) and value:
                return str(value[0])
            if value and not isinstance(value, dict):
                return str(value)
        return "Error de validación"
    if isinstance(error_detail, list):
        return str(error_detail[0]) if error_detail else "Error de validación"
    return str(error_detail) if error_detail else "Error de validación"


def custom_exception_handler(exc, context):
    """Wrap DRF's default handler to avoid leaking internals and to log server errors."""

    response = drf_exception_handler(exc, context)
    request = context.get("request")

    if response is not None and response.status_code == 401:
        if isinstance(response.data, dict) and response.data.get("detail") == "No active account found with the given credentials":
            response.data["detail"] = "Correo o contraseña incorrectos."

    if response is None:
        logger.exception(
            "Unhandled exception on %s %s",
            getattr(request, "method", "?"),
            getattr(request, "path", "?"),
            exc_info=exc,
        )
        return None

    if response.status_code >= 500:
        logger.error("API server error: %s", response.data)

    if request is not None and getattr(request, "path", "").startswith("/api/v1/"):
        error_detail = response.data
        message = _v1_error_message(error_detail)
        response.data = {
            "data": None,
            "meta": {"status_code": response.status_code},
            "errors": [{"code": _v1_error_code(response.status_code), "message": str(message)}],
        }

    return response
