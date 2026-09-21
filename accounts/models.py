from django.contrib.auth.models import AbstractUser
from django.db import models

from core.storage import unique_upload_path
from core.validators import make_image_content_validator

MAX_AVATAR_SIZE_BYTES = 3 * 1024 * 1024  # 3 MB


class Role(models.TextChoices):
    USER = "user", "Usuario"
    MODERATOR = "moderator", "Moderador"
    ADMIN = "admin", "Administrador"
    SUPERADMIN = "superadmin", "Super administrador"


class User(AbstractUser):
    """Custom user model.

    Kept close to Django's ``AbstractUser`` (username/password/is_active/
    date_joined are reused as-is) but adds the platform-specific fields:
    unique email, role, avatar and biography.
    """

    email = models.EmailField("email address", unique=True)

    role = models.CharField(
        max_length=20,
        choices=Role.choices,
        default=Role.USER,
        db_index=True,
    )

    avatar = models.ImageField(
        upload_to=unique_upload_path("avatars"),
        blank=True,
        null=True,
        validators=[make_image_content_validator(max_size_bytes=MAX_AVATAR_SIZE_BYTES)],
    )

    biography = models.TextField(max_length=1000, blank=True)

    is_email_verified = models.BooleanField(default=False)

    class Meta:
        ordering = ["-date_joined"]

    def __str__(self):
        return self.username

    @property
    def is_moderator(self) -> bool:
        return self.role in (Role.MODERATOR, Role.ADMIN, Role.SUPERADMIN)

    @property
    def is_admin_role(self) -> bool:
        return self.role in (Role.ADMIN, Role.SUPERADMIN)

    @property
    def is_superadmin_role(self) -> bool:
        return self.role == Role.SUPERADMIN

    def can_assign_role(self, target_role: str) -> bool:
        """Prevent privilege escalation: only a superadmin can grant admin
        or superadmin roles; admins can only grant user/moderator roles.
        """
        if self.role == Role.SUPERADMIN:
            return True
        if self.role == Role.ADMIN:
            return target_role in (Role.USER, Role.MODERATOR)
        return False
