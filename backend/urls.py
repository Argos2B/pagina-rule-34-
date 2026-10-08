from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView


def api_v1_404(request, exception=None):
    if request.path.startswith("/api/v1/"):
        return JsonResponse(
            {
                "data": None,
                "meta": {"status_code": 404},
                "errors": [{"code": "not_found", "message": "Recurso no encontrado"}],
            },
            status=404,
        )
    return JsonResponse({"detail": "Not found."}, status=404)


def api_v1_500(request):
    if request.path.startswith("/api/v1/"):
        return JsonResponse(
            {
                "data": None,
                "meta": {"status_code": 500},
                "errors": [{"code": "server_error", "message": "Error interno del servidor"}],
            },
            status=500,
        )
    return JsonResponse({"detail": "Internal server error."}, status=500)


handler404 = api_v1_404
handler500 = api_v1_500


urlpatterns = [
    path("admin/", admin.site.urls),

    path("api/", include("accounts.urls")),
    path("api/", include("posts.urls")),
    path("api/", include("interactions.urls")),
    path("api/", include("moderation.urls")),
    path("api/", include("verification.urls")),
    path("api/v1/", include("api.urls")),
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/schema/swagger-ui/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),
]


if settings.DEBUG:
    urlpatterns += static(
        settings.MEDIA_URL,
        document_root=settings.MEDIA_ROOT,
    )
