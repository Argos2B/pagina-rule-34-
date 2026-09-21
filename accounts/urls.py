from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView

from django.urls import path

from .views import (
    ChangePasswordView,
    CustomTokenObtainPairView,
    EmailVerificationConfirmView,
    EmailVerificationRequestView,
    LogoutView,
    MeView,
    PasswordResetConfirmView,
    PasswordResetRequestView,
    PublicUserProfileView,
    RegisterView,
    UserAdminViewSet,
)

router = DefaultRouter()
router.register("users", UserAdminViewSet, basename="user")

urlpatterns = [
    path("auth/register/", RegisterView.as_view(), name="auth-register"),
    path("auth/login/", CustomTokenObtainPairView.as_view(), name="auth-login"),
    path("auth/logout/", LogoutView.as_view(), name="auth-logout"),
    path("auth/token/refresh/", TokenRefreshView.as_view(), name="auth-token-refresh"),
    path("auth/me/", MeView.as_view(), name="auth-me"),
    path("auth/me/change-password/", ChangePasswordView.as_view(), name="auth-change-password"),
    path("auth/email/verify/request/", EmailVerificationRequestView.as_view(), name="auth-email-verify-request"),
    path("auth/email/verify/confirm/", EmailVerificationConfirmView.as_view(), name="auth-email-verify-confirm"),
    path("auth/password-reset/", PasswordResetRequestView.as_view(), name="auth-password-reset"),
    path("auth/password-reset/confirm/", PasswordResetConfirmView.as_view(), name="auth-password-reset-confirm"),
    path("users/by-username/<str:username>/", PublicUserProfileView.as_view(), name="user-public-profile"),
] + router.urls
