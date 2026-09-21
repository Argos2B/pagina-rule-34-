from rest_framework.routers import DefaultRouter

from .views import CommentViewSet, FavoriteViewSet, ReportViewSet

router = DefaultRouter()
router.register("favorites", FavoriteViewSet, basename="favorite")
router.register("comments", CommentViewSet, basename="comment")
router.register("reports", ReportViewSet, basename="report")

urlpatterns = router.urls
