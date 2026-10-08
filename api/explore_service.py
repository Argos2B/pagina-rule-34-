from __future__ import annotations

from typing import Any, Iterable, Optional

from django.db.models import Q, QuerySet

from posts.models import Post


class ExploreService:
    """Minimal read-only discovery feed for public content and owner-visible entries."""

    @staticmethod
    def normalize_ordering(ordering: Optional[str]) -> str:
        if ordering is None:
            return "-created_at"

        mapping = {
            "newest": "-created_at",
            "oldest": "created_at",
            "updated": "-updated_at",
            "-created_at": "-created_at",
            "created_at": "created_at",
            "-updated_at": "-updated_at",
            "updated_at": "updated_at",
        }
        return mapping.get(ordering, "-created_at")

    @staticmethod
    def build_queryset(request, category: Optional[Any] = None, tags: Optional[Iterable[str]] = None, ordering: Optional[str] = None) -> QuerySet[Post]:
        user = getattr(request, "user", None)
        queryset = Post.objects.select_related("author", "category").prefetch_related("tags").filter(is_deleted=False)
        category_value = str(category).strip() if category is not None else ""
        tag_names = [item.strip() for item in (tags or []) if str(item).strip()]
        has_filter = bool(category_value) or bool(tag_names)

        if user is not None and getattr(user, "is_authenticated", False):
            if getattr(user, "is_moderator", False):
                queryset = queryset
            else:
                queryset = queryset.filter(
                    Q(status=Post.Status.PUBLISHED, visibility=Post.Visibility.PUBLIC)
                    | (Q(author=user) & Q(status=Post.Status.PUBLISHED, visibility=Post.Visibility.UNLISTED))
                )
        else:
            if has_filter:
                queryset = queryset.filter(status=Post.Status.PUBLISHED, visibility__in=[Post.Visibility.PUBLIC, Post.Visibility.UNLISTED])
            else:
                queryset = queryset.filter(status=Post.Status.PUBLISHED, visibility=Post.Visibility.PUBLIC)

        if category_value:
            if category_value.isdigit():
                queryset = queryset.filter(category_id=int(category_value))
            else:
                queryset = queryset.filter(category__slug=category_value)

        if tag_names:
            queryset = queryset.filter(tags__name__in=tag_names).distinct()

        queryset = queryset.order_by(ExploreService.normalize_ordering(ordering))
        return queryset

    @staticmethod
    def execute(request, *, category: Optional[Any] = None, tags: Optional[Iterable[str]] = None, ordering: Optional[str] = None, page: int = 1, page_size: int = 20):
        queryset = ExploreService.build_queryset(request, category=category, tags=tags, ordering=ordering)

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

        return {
            "results": results,
            "count": total,
            "page": page,
            "page_size": page_size,
        }
