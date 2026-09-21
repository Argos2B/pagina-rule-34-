from django.conf import settings
from django.http import JsonResponse


class MaxBodySizeMiddleware:
    """Reject oversized request bodies early, based on the ``Content-Length``
    header, before Django buffers/reads them.

    Django's ``DATA_UPLOAD_MAX_MEMORY_SIZE`` does NOT apply to the file parts
    of a multipart request (only to non-file fields), so without this check a
    client could send an arbitrarily large upload and the server would fully
    receive it (spending memory/disk/CPU) before the field-level image
    validators get a chance to reject it. This middleware is a cheap
    defense-in-depth safety net; the authoritative limit for production
    should still be enforced by the reverse proxy (e.g. nginx
    ``client_max_body_size``).
    """

    # Small buffer above the largest validated upload (post image, 15 MB) to
    # account for the other multipart fields/boundaries in the same request.
    MAX_BODY_SIZE = getattr(settings, "MAX_UPLOAD_SIZE_BYTES", 15 * 1024 * 1024) + (2 * 1024 * 1024)

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        content_length = request.META.get("CONTENT_LENGTH")
        if content_length:
            try:
                length = int(content_length)
            except (TypeError, ValueError):
                length = None
            if length is not None and length > self.MAX_BODY_SIZE:
                return JsonResponse(
                    {"detail": "El cuerpo de la solicitud supera el tamaño máximo permitido."},
                    status=413,
                )
        return self.get_response(request)
