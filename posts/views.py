from django.db.models import Q
from rest_framework import mixins, permissions, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from accounts.permissions import IsModeratorOrAbove
from core.throttles import ContentWriteRateThrottle
from moderation.utils import log_action

from .models import Category, Post, Tag
from .permissions import IsAuthorOrModerator
from .serializers import CategorySerializer, PostSerializer, TagSerializer


class CategoryViewSet(viewsets.ModelViewSet):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer
    search_fields = ["name"]

    def get_permissions(self):
        if self.action in ["list", "retrieve"]:
            return [permissions.AllowAny()]
        return [IsModeratorOrAbove()]


class TagViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    queryset = Tag.objects.all()
    serializer_class = TagSerializer
    permission_classes = [permissions.AllowAny]
    search_fields = ["name"]


class PostViewSet(viewsets.ModelViewSet):
    serializer_class = PostSerializer
    filterset_fields = ["category", "tags", "status", "visibility", "author"]
    search_fields = ["title", "description", "tags__name"]
    ordering_fields = ["created_at", "updated_at"]

    def get_queryset(self):
        user = self.request.user
        base = Post.objects.select_related("author", "category").prefetch_related("tags").filter(is_deleted=False)

        if self.action in ("list", "retrieve"):
            # "unlisted" posts are reachable by direct link (retrieve) but must
            # never appear in the public feed/listing, otherwise the visibility
            # value would be indistinguishable from "public".
            visible_statuses = [Post.Visibility.PUBLIC, Post.Visibility.UNLISTED] if self.action == "retrieve" else [Post.Visibility.PUBLIC]
            public = Q(status=Post.Status.PUBLISHED, visibility__in=visible_statuses)
            if user.is_authenticated:
                if user.is_moderator:
                    return base
                return base.filter(public | Q(author=user))
            return base.filter(public)

        # write actions (update/destroy/hide/restore): moderators can reach any
        # non-deleted post, everyone else only their own.
        if user.is_authenticated and user.is_moderator:
            return base
        return base.filter(author=user)

    def get_permissions(self):
        if self.action in ["list", "retrieve"]:
            return [permissions.AllowAny()]
        if self.action in ["hide", "restore"]:
            return [IsModeratorOrAbove()]
        if self.action == "create":
            return [permissions.IsAuthenticated()]
        return [permissions.IsAuthenticated(), IsAuthorOrModerator()]

    def get_throttles(self):
        throttles = super().get_throttles()
        if self.action == "create":
            throttles = throttles + [ContentWriteRateThrottle()]
        return throttles

    def perform_create(self, serializer):
        from rest_framework.exceptions import PermissionDenied

        user = self.request.user

        from verification.services import ContentModerationService

        file_obj = serializer.validated_data.get("image")
        decision, mod_reason = ContentModerationService.moderate(file_obj, user.pk)

        if decision == ContentModerationService.ModerationDecision.BLOCK:
            from verification.services import log_security_event

            log_security_event(user.pk, "moderation_block", {"reason": mod_reason})
            raise PermissionDenied("El contenido fue bloqueado por moderación.")

        if decision == ContentModerationService.ModerationDecision.REVIEW:
            from verification.services import log_security_event

            log_security_event(user.pk, "moderation_review", {"reason": mod_reason})
            serializer.save(author=user, status=Post.Status.HIDDEN)
            return

        serializer.save(author=user)

    def perform_destroy(self, instance):
        instance.soft_delete()
        log_action(self.request.user, "post.delete", target=instance)

    @action(detail=True, methods=["post"])
    def hide(self, request, pk=None):
        post = self.get_object()
        post.status = Post.Status.HIDDEN
        post.save(update_fields=["status"])
        log_action(request.user, "post.hide", target=post, reason=request.data.get("reason", ""))
        return Response(PostSerializer(post, context={"request": request}).data)

    @action(detail=True, methods=["post"])
    def restore(self, request, pk=None):
        post = self.get_object()
        post.status = Post.Status.PUBLISHED
        post.save(update_fields=["status"])
        log_action(request.user, "post.restore", target=post)
        return Response(PostSerializer(post, context={"request": request}).data)
