from rest_framework.response import Response


class APIEnvelopeResponse(Response):
    """Standard response envelope for the v1 API."""

    def __init__(self, data=None, *, status=None, meta=None, errors=None):
        payload = {
            "data": data,
            "meta": meta or {},
            "errors": errors or [],
        }
        super().__init__(payload, status=status)
