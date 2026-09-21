from django.contrib.auth import get_user_model
from django.conf import settings
import logging
from rest_framework import generics, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView

from core.throttles import AuthRateThrottle, PasswordResetRateThrottle
from moderation.utils import log_action

from .emails import send_password_reset_email, send_verification_email
from .permissions import IsAdminOrAbove
from .serializers import (
    ChangePasswordSerializer,
    EmailVerificationConfirmSerializer,
    EmailOrUsernameTokenObtainPairSerializer,
    MeSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    RegisterSerializer,
    UserAdminSerializer,
    UserPublicSerializer,
)

User = get_user_model()
logger = logging.getLogger(__name__)


class RegisterView(generics.CreateAPIView):
    queryset = User.objects.all()
    serializer_class = RegisterSerializer
    permission_classes = [permissions.AllowAny]
    throttle_classes = [AuthRateThrottle]
    throttle_scope = "auth"

    def perform_create(self, serializer):
        user = serializer.save()
        send_verification_email(user)


class CustomTokenObtainPairView(TokenObtainPairView):
    """Standard SimpleJWT login, only adding brute-force throttling."""

    serializer_class = EmailOrUsernameTokenObtainPairSerializer
    throttle_classes = [AuthRateThrottle]
    throttle_scope = "auth"


class LogoutView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        refresh_token = request.data.get("refresh")
        if not refresh_token:
            return Response({"detail": "El campo 'refresh' es obligatorio."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            token = RefreshToken(refresh_token)
            token.blacklist()
        except TokenError:
            return Response({"detail": "Token inválido o ya invalidado."}, status=status.HTTP_400_BAD_REQUEST)
        return Response(status=status.HTTP_205_RESET_CONTENT)


class MeView(generics.RetrieveUpdateAPIView):
    serializer_class = MeSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        return self.request.user


class PublicUserProfileView(generics.RetrieveAPIView):
    """Public, safe-to-expose profile lookup by username.

    Required by the frontend's /profile/:username page: the frontend only
    ever knows a username (e.g. from a post's author_username), never the
    numeric id, and /api/users/ is restricted to admins. Only exposes the
    fields already defined on UserPublicSerializer (no email, no is_active).
    Suspended/inactive accounts are excluded to avoid confirming their status
    to anonymous visitors.
    """

    queryset = User.objects.filter(is_active=True)
    serializer_class = UserPublicSerializer
    permission_classes = [permissions.AllowAny]
    lookup_field = "username"


class ChangePasswordView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response({"detail": "Contraseña actualizada correctamente."})


class EmailVerificationRequestView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [PasswordResetRateThrottle]
    throttle_scope = "password_reset"

    def post(self, request):
        if request.user.is_email_verified:
            return Response({"detail": "El correo ya está verificado."})
        send_verification_email(request.user)
        return Response({"detail": "Correo de verificación enviado."})


class EmailVerificationConfirmView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = EmailVerificationConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response({"detail": "Correo verificado correctamente."})


class PasswordResetRequestView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_classes = [PasswordResetRateThrottle]
    throttle_scope = "password_reset"

    def get_success_detail(self) -> str:
        if settings.EMAIL_BACKEND == "django.core.mail.backends.console.EmailBackend":
            return (
                "Servidor en modo desarrollo: si el correo existe, las instrucciones se imprimieron "
                "en la consola del backend. Configura SMTP en .env para envío real."
            )
        return "Si el correo existe, se enviaron instrucciones de recuperación."

    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"]

        user = User.objects.filter(email__iexact=email).first()
        if user is not None:
            from django.contrib.auth.tokens import default_token_generator

            try:
                send_password_reset_email(user, default_token_generator)
            except Exception:
                logger.exception("Password reset email could not be sent.")

        # Always return the same response to avoid leaking which emails are registered.
        return Response({"detail": self.get_success_detail()})


class PasswordResetConfirmView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_classes = [PasswordResetRateThrottle]
    throttle_scope = "password_reset"

    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response({"detail": "Contraseña restablecida correctamente."})


class UserAdminViewSet(viewsets.ModelViewSet):
    """User administration for admins/superadmins.

    Role changes are guarded against privilege escalation: an admin cannot
    grant admin/superadmin roles, only a superadmin can.
    """

    queryset = User.objects.all().order_by("-date_joined")
    serializer_class = UserAdminSerializer
    permission_classes = [IsAdminOrAbove]
    filterset_fields = ["role", "is_active"]
    search_fields = ["username", "email"]
    http_method_names = ["get", "patch", "post", "head", "options"]

    def perform_update(self, serializer):
        new_role = serializer.validated_data.get("role")
        actor = self.request.user
        target = self.get_object()

        if new_role and new_role != target.role and not actor.can_assign_role(new_role):
            raise PermissionDenied("No tienes permisos para asignar este rol.")

        # Guard against bypassing the dedicated suspend/reactivate actions: a plain
        # PATCH must respect the same "cannot suspend a superadmin" rule they enforce.
        new_is_active = serializer.validated_data.get("is_active")
        if (
            new_is_active is not None
            and new_is_active != target.is_active
            and target.is_superadmin_role
            and not actor.is_superadmin_role
        ):
            raise PermissionDenied("No puedes modificar el estado de un superadministrador.")

        instance = serializer.save()
        log_action(actor, "user.update", target=instance, metadata={"changes": serializer.validated_data})

    def partial_update(self, request, *args, **kwargs):
        kwargs["partial"] = True
        return self.update(request, *args, **kwargs)

    @action(detail=True, methods=["post"])
    def suspend(self, request, pk=None):
        target = self.get_object()
        if target.is_superadmin_role and not request.user.is_superadmin_role:
            raise PermissionDenied("No puedes suspender a un superadministrador.")

        target.is_active = False
        target.save(update_fields=["is_active"])
        log_action(request.user, "user.suspend", target=target, reason=request.data.get("reason", ""))
        return Response(UserAdminSerializer(target).data)

    @action(detail=True, methods=["post"])
    def reactivate(self, request, pk=None):
        target = self.get_object()
        target.is_active = True
        target.save(update_fields=["is_active"])
        log_action(request.user, "user.reactivate", target=target)
        return Response(UserAdminSerializer(target).data)
