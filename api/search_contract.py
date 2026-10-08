from __future__ import annotations

from dataclasses import asdict, dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional

from django.db.models import Q

from posts.models import Post


class SearchMode(str, Enum):
    TRADITIONAL = "traditional"
    SEMANTIC = "semantic"
    HYBRID = "hybrid"
    AI = "ai"


@dataclass
class SearchQuery:
    query: str = ""
    mode: SearchMode = SearchMode.TRADITIONAL
    filters: Dict[str, Any] = field(default_factory=dict)
    tags: List[str] = field(default_factory=list)
    categories: List[str] = field(default_factory=list)
    author: Optional[int] = None
    visibility: Optional[str] = None
    ordering: str = "-created_at"
    pagination: Dict[str, int] = field(default_factory=lambda: {"page": 1, "page_size": 20})
    include_related: bool = False
    language: str = "es"

    def __post_init__(self):
        if self.mode not in SearchMode:
            raise ValueError(f"Invalid search mode: {self.mode}")
        if not isinstance(self.mode, SearchMode):
            self.mode = SearchMode(self.mode)


@dataclass
class SearchResult:
    results: List[Dict[str, Any]] = field(default_factory=list)
    total: int = 0
    page: int = 1
    page_size: int = 20
    mode: SearchMode = SearchMode.TRADITIONAL

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


class SearchService:
    """Minimal server-authoritative search abstraction for the v1 API."""

    @staticmethod
    def normalize_ordering(ordering: Optional[str]) -> str:
        if ordering is None:
            return "-created_at"

        mapping = {
            "newest": "-created_at",
            "oldest": "created_at",
            "updated": "-updated_at",
            "-updated": "updated_at",
            "-created_at": "-created_at",
            "created_at": "created_at",
            "-updated_at": "-updated_at",
            "updated_at": "updated_at",
        }
        return mapping.get(ordering, "-created_at")

    def execute(self, query: SearchQuery, request=None) -> SearchResult:
        if not isinstance(query, SearchQuery):
            raise TypeError("query must be a SearchQuery instance")

        if query.mode != SearchMode.TRADITIONAL:
            raise ValueError(f"Search mode '{query.mode.value}' is not implemented in this phase.")

        query.ordering = self.normalize_ordering(query.ordering)

        user = getattr(request, "user", None) if request is not None else None
        queryset = Post.objects.select_related("author", "category").prefetch_related("tags").filter(is_deleted=False)

        if user is not None and getattr(user, "is_authenticated", False):
            if getattr(user, "is_moderator", False):
                queryset = queryset
            else:
                queryset = queryset.filter(Q(author=user) | Q(status=Post.Status.PUBLISHED, visibility=Post.Visibility.PUBLIC))
        else:
            queryset = queryset.filter(status=Post.Status.PUBLISHED, visibility=Post.Visibility.PUBLIC)

        if query.query:
            queryset = queryset.filter(Q(title__icontains=query.query) | Q(description__icontains=query.query))

        if query.tags:
            queryset = queryset.filter(tags__name__in=query.tags).distinct()

        if query.categories:
            queryset = queryset.filter(category__slug__in=query.categories).distinct()

        if query.author is not None:
            queryset = queryset.filter(author_id=query.author)

        if query.visibility is not None:
            queryset = queryset.filter(visibility=query.visibility)

        queryset = queryset.order_by(query.ordering or "-created_at")

        page = int(query.pagination.get("page", 1))
        page_size = int(query.pagination.get("page_size", 20))
        if page < 1:
            page = 1
        if page_size < 1:
            page_size = 20
        if page_size > 100:
            page_size = 100

        total = queryset.count()
        page_obj = queryset[(page - 1) * page_size : page * page_size]
        results = [
            {
                "id": post.id,
                "title": post.title,
                "description": post.description,
                "author_id": post.author_id,
                "author_username": post.author.username,
                "category_id": post.category_id,
                "category_name": post.category.name if post.category else None,
                "visibility": post.visibility,
                "status": post.status,
                "created_at": post.created_at.isoformat() if post.created_at else None,
                "updated_at": post.updated_at.isoformat() if post.updated_at else None,
                "tags": [tag.name for tag in post.tags.all()],
            }
            for post in page_obj
        ]

        return SearchResult(
            results=results,
            total=total,
            page=page,
            page_size=page_size,
            mode=query.mode,
        )
