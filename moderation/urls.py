from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import AuditLogViewSet, StatsView

router = DefaultRouter()
router.register("moderation/audit-logs", AuditLogViewSet, basename="audit-log")

urlpatterns = [
    path("moderation/stats/", StatsView.as_view(), name="moderation-stats"),
] + router.urls
