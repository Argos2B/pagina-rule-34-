from django.contrib import admin

from .models import Category, Post, Tag


@admin.register(Post)
class PostAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "title",
        "author",
        "status",
        "visibility",
        "is_deleted",
        "created_at",
    )

    list_filter = (
        "status",
        "visibility",
        "is_deleted",
        "category",
        "created_at",
    )

    search_fields = (
        "title",
        "description",
        "author__username",
    )

    readonly_fields = (
        "created_at",
        "updated_at",
        "deleted_at",
    )

    autocomplete_fields = ("author", "category")
    filter_horizontal = ("tags",)


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "slug", "created_at")
    search_fields = ("name",)
    prepopulated_fields = {"slug": ("name",)}


@admin.register(Tag)
class TagAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "slug")
    search_fields = ("name",)
    prepopulated_fields = {"slug": ("name",)}
