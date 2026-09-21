from django.conf import settings
from django.db import models
from django.utils import timezone
from django.utils.text import slugify

from core.storage import unique_upload_path
from core.validators import make_image_content_validator

MAX_POST_IMAGE_SIZE_BYTES = 15 * 1024 * 1024  # 15 MB


class Category(models.Model):
    name = models.CharField(max_length=100, unique=True)
    slug = models.SlugField(max_length=120, unique=True, blank=True)
    description = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]
        verbose_name_plural = "categories"

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(self.name)
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name


class Tag(models.Model):
    name = models.CharField(max_length=60, unique=True)
    slug = models.SlugField(max_length=80, unique=True, blank=True)

    class Meta:
        ordering = ["name"]

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(self.name)
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name


class Post(models.Model):
    class Status(models.TextChoices):
        DRAFT = "draft", "Borrador"
        PUBLISHED = "published", "Publicado"
        HIDDEN = "hidden", "Oculto por moderación"

    class Visibility(models.TextChoices):
        PUBLIC = "public", "Público"
        UNLISTED = "unlisted", "No listado"
        PRIVATE = "private", "Privado"

    title = models.CharField(max_length=200, blank=True)

    description = models.TextField(blank=True)

    image = models.ImageField(
        upload_to=unique_upload_path("posts"),
        validators=[make_image_content_validator(max_size_bytes=MAX_POST_IMAGE_SIZE_BYTES)],
    )

    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="posts",
    )

    category = models.ForeignKey(
        Category,
        on_delete=models.SET_NULL,
        related_name="posts",
        null=True,
        blank=True,
    )

    tags = models.ManyToManyField(Tag, related_name="posts", blank=True)

    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PUBLISHED,
        db_index=True,
    )

    visibility = models.CharField(
        max_length=20,
        choices=Visibility.choices,
        default=Visibility.PUBLIC,
        db_index=True,
    )

    created_at = models.DateTimeField(auto_now_add=True)

    updated_at = models.DateTimeField(auto_now=True)

    is_deleted = models.BooleanField(default=False)

    deleted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["status", "visibility"]),
            models.Index(fields=["created_at"]),
        ]

    def __str__(self):
        if self.title:
            return self.title

        return f"Post #{self.id}"

    def soft_delete(self):
        self.is_deleted = True
        self.deleted_at = timezone.now()
        self.save(update_fields=["is_deleted", "deleted_at"])

    @property
    def is_public_and_visible(self) -> bool:
        return (
            not self.is_deleted
            and self.status == self.Status.PUBLISHED
            and self.visibility == self.Visibility.PUBLIC
        )
