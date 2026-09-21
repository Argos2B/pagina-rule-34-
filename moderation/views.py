from django.apps import apps
from rest_framework import mixins, viewsets
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsAdminOrAbove, IsModeratorOrAbove

from .models import AuditLog
from .serializers import AuditLogSerializer


class AuditLogViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """Read-only audit trail, restricted to admins/superadmins."""

    queryset = AuditLog.objects.select_related("actor")
    serializer_class = AuditLogSerializer
    permission_classes = [IsAdminOrAbove]
    filterset_fields = ["action", "target_type", "actor"]


class StatsView(APIView):
    """Lightweight platform statistics for the moderation dashboard."""

    permission_classes = [IsModeratorOrAbove]

    def get(self, request):
        User = apps.get_model("accounts", "User")
        Post = apps.get_model("posts", "Post")
        Comment = apps.get_model("interactions", "Comment")
        Report = apps.get_model("interactions", "Report")

        data = {
            "users_total": User.objects.count(),
            "users_active": User.objects.filter(is_active=True).count(),
            "posts_total": Post.objects.filter(is_deleted=False).count(),
            "posts_published": Post.objects.filter(is_deleted=False, status=Post.Status.PUBLISHED).count(),
            "posts_hidden": Post.objects.filter(is_deleted=False, status=Post.Status.HIDDEN).count(),
            "comments_total": Comment.objects.count(),
            "reports_pending": Report.objects.filter(status=Report.Status.PENDING).count(),
        }
        return Response(data)
