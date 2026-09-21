from rest_framework.routers import DefaultRouter

from .views import CategoryViewSet, PostViewSet, TagViewSet


router = DefaultRouter()

router.register("posts", PostViewSet, basename="post")
router.register("categories", CategoryViewSet, basename="category")
router.register("tags", TagViewSet, basename="tag")


urlpatterns = router.urls
