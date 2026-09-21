from django.db.models import Q
from django.utils import timezone
from rest_framework import mixins, permissions, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response

from accounts.permissions import IsModeratorOrAbove
from core.throttles import ContentWriteRateThrottle
from moderation.utils import log_action

from .models import Comment, Favorite, Report
from .permissions import IsCommentAuthorOrModerator
from .serializers import (
    CommentSerializer,
    FavoriteSerializer,
    ReportResolveSerializer,
    ReportSerializer,
)


class FavoriteViewSet(mixins.ListModelMixin, mixins.CreateModelMixin, mixins.DestroyModelMixin, viewsets.GenericViewSet):
    serializer_class = FavoriteSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Favorite.objects.filter(user=self.request.user).select_related("post")

    def perform_destroy(self, instance):
        if instance.user_id != self.request.user.id:
            raise PermissionDenied("Solo puedes eliminar tus propios favoritos.")
        instance.delete()


class CommentViewSet(viewsets.ModelViewSet):
    serializer_class = CommentSerializer
    filterset_fields = ["post"]

    def get_queryset(self):
        user = self.request.user
        base = Comment.objects.select_related("author", "post")

        if self.action in ("list", "retrieve"):
            if user.is_authenticated and user.is_moderator:
                return base
            if user.is_authenticated:
                return base.filter(Q(is_hidden=False) | Q(author=user))
            return base.filter(is_hidden=False)

        if user.is_authenticated and user.is_moderator:
            return base
        return base.filter(author=user)

    def get_permissions(self):
        if self.action in ["list", "retrieve"]:
            return [permissions.AllowAny()]
        if self.action in ["hide", "unhide"]:
            return [IsModeratorOrAbove()]
        if self.action == "create":
            return [permissions.IsAuthenticated(), IsCommentAuthorOrModerator()]
        return [permissions.IsAuthenticated(), IsCommentAuthorOrModerator()]

    def get_throttles(self):
        throttles = super().get_throttles()
        if self.action == "create":
            throttles = throttles + [ContentWriteRateThrottle()]
        return throttles

    def perform_create(self, serializer):
        serializer.save(author=self.request.user)

    @action(detail=True, methods=["post"])
    def hide(self, request, pk=None):
        comment = self.get_object()
        comment.is_hidden = True
        comment.save(update_fields=["is_hidden"])
        log_action(request.user, "comment.hide", target=comment, reason=request.data.get("reason", ""))
        return Response(CommentSerializer(comment).data)

    @action(detail=True, methods=["post"])
    def unhide(self, request, pk=None):
        comment = self.get_object()
        comment.is_hidden = False
        comment.save(update_fields=["is_hidden"])
        log_action(request.user, "comment.unhide", target=comment)
        return Response(CommentSerializer(comment).data)


class ReportViewSet(viewsets.ModelViewSet):
    serializer_class = ReportSerializer
    http_method_names = ["get", "post", "head", "options"]
    filterset_fields = ["status", "target_type"]

    def get_queryset(self):
        user = self.request.user
        base = Report.objects.select_related("reporter", "post", "comment", "reported_user", "reviewed_by")
        if user.is_authenticated and user.is_moderator:
            return base
        return base.filter(reporter=user)

    def get_permissions(self):
        if self.action == "resolve":
            return [IsModeratorOrAbove()]
        if self.action in ["list", "retrieve"]:
            return [permissions.IsAuthenticated()]
        return [permissions.IsAuthenticated()]

    def get_throttles(self):
        throttles = super().get_throttles()
        if self.action == "create":
            throttles = throttles + [ContentWriteRateThrottle()]
        return throttles

    def perform_create(self, serializer):
        serializer.save(reporter=self.request.user)

    @action(detail=True, methods=["post"])
    def resolve(self, request, pk=None):
        report = self.get_object()
        serializer = ReportResolveSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        report.status = serializer.validated_data["status"]
        report.reviewed_by = request.user
        report.reviewed_at = timezone.now()
        report.save(update_fields=["status", "reviewed_by", "reviewed_at"])

        log_action(
            request.user,
            "report.resolve",
            target=report,
            reason=serializer.validated_data.get("note", ""),
            metadata={"new_status": report.status},
        )
        return Response(ReportSerializer(report).data)
