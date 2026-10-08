from django.urls import path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView

from accounts.views import (
    ChangePasswordView,
    CustomTokenObtainPairView,
    EmailVerificationConfirmView,
    EmailVerificationRequestView,
    MeView,
    PasswordResetConfirmView,
    PasswordResetRequestView,
    PublicUserProfileView,
    RegisterView,
    UserAdminViewSet,
)

from .views import APIRootView, ExploreView, HealthCheckView, SearchContractView, SearchView

router = DefaultRouter()
router.register("users", UserAdminViewSet, basename="v1-user")

urlpatterns = [
    path("", APIRootView.as_view(), name="api-v1-root"),
    path("health/", HealthCheckView.as_view(), name="api-v1-health"),
    path("auth/register/", RegisterView.as_view(), name="api-v1-auth-register"),
    path("auth/login/", CustomTokenObtainPairView.as_view(), name="api-v1-auth-login"),
    path("auth/token/refresh/", TokenRefreshView.as_view(), name="api-v1-auth-token-refresh"),
    path("auth/me/", MeView.as_view(), name="api-v1-auth-me"),
    path("auth/me/change-password/", ChangePasswordView.as_view(), name="api-v1-auth-change-password"),
    path("auth/email/verify/request/", EmailVerificationRequestView.as_view(), name="api-v1-auth-email-verify-request"),
    path("auth/email/verify/confirm/", EmailVerificationConfirmView.as_view(), name="api-v1-auth-email-verify-confirm"),
    path("auth/password-reset/", PasswordResetRequestView.as_view(), name="api-v1-auth-password-reset"),
    path("auth/password-reset/confirm/", PasswordResetConfirmView.as_view(), name="api-v1-auth-password-reset-confirm"),
    path("users/by-username/<str:username>/", PublicUserProfileView.as_view(), name="api-v1-user-public-profile"),
    path("explore/", ExploreView.as_view(), name="api-v1-explore"),
    path("search/", SearchView.as_view(), name="api-v1-search"),
    path("search/contract/", SearchContractView.as_view(), name="api-v1-search-contract"),
] + router.urls
