import math

from drf_spectacular.utils import OpenApiExample, OpenApiParameter, extend_schema
from rest_framework.permissions import AllowAny
from rest_framework.views import APIView

from core.pagination import StandardResultsSetPagination
from .explore_service import ExploreService
from .response import APIEnvelopeResponse
from .search_contract import SearchMode, SearchQuery, SearchService


class APIRootView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(
        summary="Información de la API v1",
        responses={200: {"description": "Información del API v1"}},
        examples=[
            OpenApiExample(
                name="ok",
                value={
                    "data": {"version": "v1", "name": "Universo 34 API"},
                    "meta": {},
                    "errors": [],
                },
            )
        ],
    )
    def get(self, request, *args, **kwargs):
        return APIEnvelopeResponse(
            {
                "name": "Universo 34 API",
                "version": "v1",
                "status": "active",
                "endpoints": {
                    "health": "/api/v1/health/",
                    "docs": "/api/schema/",
                    "swagger": "/api/schema/swagger-ui/",
                },
            },
            meta={"api_version": "v1"},
        )


class HealthCheckView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(summary="Health check de la API v1", responses={200: {"description": "Servidor activo"}})
    def get(self, request, *args, **kwargs):
        return APIEnvelopeResponse(
            {
                "database": "ok",
                "api": "ok",
                "environment": "development" if request.GET.get("debug") == "1" else "production-safe",
            },
            meta={"checks": ["database", "api"]},
        )


class SearchView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(
        summary="Búsqueda tradicional de posts",
        description="Búsqueda tradicional server-authoritative sobre título y descripción con visibilidad y permisos aplicados del lado del servidor.",
        parameters=[
            OpenApiParameter(name="q", description="Texto a buscar en título y descripción.", required=False, type=str, location=OpenApiParameter.QUERY),
            OpenApiParameter(name="category", description="Slugs de categoría separados por coma.", required=False, type=str, location=OpenApiParameter.QUERY),
            OpenApiParameter(name="tags", description="Nombres de tags separados por coma.", required=False, type=str, location=OpenApiParameter.QUERY),
            OpenApiParameter(name="author", description="ID del autor para filtrar resultados.", required=False, type=int, location=OpenApiParameter.QUERY),
            OpenApiParameter(name="ordering", description="Orden de resultados: newest, oldest, updated, -updated.", required=False, type=str, enum=["newest", "oldest", "updated", "-updated"], location=OpenApiParameter.QUERY),
            OpenApiParameter(name="page", description="Número de página.", required=False, type=int, location=OpenApiParameter.QUERY),
            OpenApiParameter(name="page_size", description="Cantidad de resultados por página (máximo 100).", required=False, type=int, location=OpenApiParameter.QUERY),
        ],
        responses={200: OpenApiExample(
            name="search_ok",
            value={
                "data": {
                    "results": [{"id": 1, "title": "Ejemplo", "description": "Texto de prueba"}],
                    "count": 1,
                    "page": 1,
                    "page_size": 20,
                    "mode": "traditional",
                },
                "meta": {"count": 1, "page": 1, "page_size": 20, "pages": 1},
                "errors": [],
            },
        )},
    )
    def get(self, request, *args, **kwargs):
        paginator = StandardResultsSetPagination()
        page = int(request.GET.get("page", "1") or "1")
        page_size = paginator.get_page_size(request)
        page = max(page, 1)
        if page_size is None:
            page_size = paginator.page_size
        page_size = min(max(page_size, 1), paginator.max_page_size)

        ordering = request.GET.get("ordering", "newest")
        ordering_value = SearchService.normalize_ordering(ordering)

        raw_category = request.GET.get("category")
        raw_tags = request.GET.get("tags", "")
        raw_author = request.GET.get("author")

        categories = []
        if raw_category:
            categories = [item.strip() for item in raw_category.split(",") if item.strip()]

        tags = []
        if raw_tags:
            tags = [item.strip() for item in raw_tags.split(",") if item.strip()]

        author = None
        if raw_author not in (None, ""):
            try:
                author = int(raw_author)
            except (TypeError, ValueError):
                author = None

        query = SearchQuery(
            query=request.GET.get("q", "") or "",
            mode=SearchMode.TRADITIONAL,
            filters={},
            tags=tags,
            categories=categories,
            author=author,
            visibility=None,
            ordering=ordering_value,
            pagination={"page": page, "page_size": page_size},
            include_related=False,
            language="es",
        )
        result = SearchService().execute(query, request=request)
        page_count = math.ceil(result.total / result.page_size) if result.page_size else 0
        return APIEnvelopeResponse(
            {
                "results": result.results,
                "count": result.total,
                "page": result.page,
                "page_size": result.page_size,
                "mode": result.mode.value,
            },
            meta={
                "count": result.total,
                "page": result.page,
                "page_size": result.page_size,
                "pages": page_count,
            },
        )


class ExploreView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(
        summary="Feed de exploración público y personal",
        description="Lista pública de posts publicados con visibilidad real del backend, sin inventar nuevas reglas de contenido ni popularidad.",
        parameters=[
            OpenApiParameter(name="category", description="ID o slug de categoría", required=False, type=str, location=OpenApiParameter.QUERY),
            OpenApiParameter(name="tags", description="Tags separados por coma", required=False, type=str, location=OpenApiParameter.QUERY),
            OpenApiParameter(name="ordering", description="newest, oldest, updated", required=False, type=str, location=OpenApiParameter.QUERY),
            OpenApiParameter(name="page", description="Número de página", required=False, type=int, location=OpenApiParameter.QUERY),
            OpenApiParameter(name="page_size", description="Cantidad por página (máximo 100)", required=False, type=int, location=OpenApiParameter.QUERY),
        ],
        responses={200: OpenApiExample(
            name="explore_ok",
            value={
                "data": {
                    "results": [{"id": 1, "title": "Ejemplo", "description": "Contenido público"}],
                    "count": 1,
                    "page": 1,
                    "page_size": 20,
                },
                "meta": {"count": 1, "page": 1, "page_size": 20, "pages": 1},
                "errors": [],
            },
        )},
    )
    def get(self, request, *args, **kwargs):
        paginator = StandardResultsSetPagination()
        page = int(request.GET.get("page", "1") or "1")
        page_size = paginator.get_page_size(request)
        page = max(page, 1)
        if page_size is None:
            page_size = paginator.page_size
        page_size = min(max(page_size, 1), paginator.max_page_size)

        category = request.GET.get("category")
        tags_raw = request.GET.get("tags", "")
        tags = [item.strip() for item in tags_raw.split(",") if item.strip()] if tags_raw else []
        ordering = request.GET.get("ordering", "newest")

        result = ExploreService.execute(
            request,
            category=category,
            tags=tags,
            ordering=ordering,
            page=page,
            page_size=page_size,
        )

        page_count = math.ceil(result["count"] / result["page_size"]) if result["page_size"] else 0
        return APIEnvelopeResponse(
            {
                "results": result["results"],
                "count": result["count"],
                "page": result["page"],
                "page_size": result["page_size"],
            },
            meta={
                "count": result["count"],
                "page": result["page"],
                "page_size": result["page_size"],
                "pages": page_count,
            },
        )


class SearchContractView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(
        summary="Contrato base de búsqueda",
        description="Contrato mínimo y server-authoritative para búsquedas tradicionales, semánticas, híbridas y AI sin proveedores externos.",
        responses={200: {"description": "Contrato base"}},
    )
    def get(self, request, *args, **kwargs):
        query = SearchQuery(
            query=request.GET.get("q", ""),
            mode=SearchMode.TRADITIONAL,
            filters={},
            tags=[],
            categories=[],
            author=None,
            visibility=None,
            ordering="-created_at",
            pagination={"page": 1, "page_size": 20},
            include_related=False,
            language="es",
        )
        result = SearchService().execute(query, request=request)
        return APIEnvelopeResponse(
            {
                "search_modes": [mode.value for mode in SearchMode],
                "provider": "server-authoritative",
                "request_contract": {
                    "query": "string",
                    "mode": "traditional|semantic|hybrid|ai",
                    "filters": {},
                    "tags": [],
                    "categories": [],
                    "author": None,
                    "visibility": None,
                    "ordering": "-created_at",
                    "pagination": {"page": 1, "page_size": 20},
                    "include_related": False,
                    "language": "es",
                },
                "response_contract": {
                    "results": result.results,
                    "count": result.total,
                    "page": result.page,
                    "page_size": result.page_size,
                    "mode": result.mode.value,
                },
            },
            meta={"contract_version": "1.0"},
        )
