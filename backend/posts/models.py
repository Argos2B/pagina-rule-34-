from django.conf import settings
from django.db import models


class Post(models.Model):
    title = models.CharField(max_length=200, blank=True)

    description = models.TextField(blank=True)

    image = models.ImageField(
        upload_to="posts/"
    )

    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="posts",
    )

    created_at = models.DateTimeField(auto_now_add=True)

    updated_at = models.DateTimeField(auto_now=True)

    is_public = models.BooleanField(default=True)

    is_deleted = models.BooleanField(default=False)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        if self.title:
            return self.title

        return f"Post #{self.id}"