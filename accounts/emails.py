from django.conf import settings
from django.core.mail import send_mail
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode

from .tokens import email_verification_token_generator


def _uid_and_token_url(user, token_generator, frontend_path: str) -> str:
    uid = urlsafe_base64_encode(force_bytes(user.pk))
    token = token_generator.make_token(user)
    return f"{settings.FRONTEND_URL}{frontend_path}?uid={uid}&token={token}"


def send_verification_email(user) -> None:
    url = _uid_and_token_url(user, email_verification_token_generator, "/verify-email")
    send_mail(
        subject="Verifica tu correo",
        message=(
            f"Hola {user.username},\n\n"
            f"Confirma tu correo electrónico visitando el siguiente enlace:\n{url}\n\n"
            "Si no creaste esta cuenta, ignora este mensaje."
        ),
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[user.email],
        fail_silently=settings.EMAIL_FAIL_SILENTLY,
    )


def send_password_reset_email(user, token_generator) -> None:
    url = _uid_and_token_url(user, token_generator, "/reset-password")
    send_mail(
        subject="Recupera tu contraseña",
        message=(
            f"Hola {user.username},\n\n"
            f"Para restablecer tu contraseña visita el siguiente enlace:\n{url}\n\n"
            "Si no solicitaste este cambio, ignora este mensaje. Tu contraseña actual seguirá funcionando."
        ),
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[user.email],
        fail_silently=settings.EMAIL_FAIL_SILENTLY,
    )
