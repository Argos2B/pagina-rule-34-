from django.contrib import admin

from .models import Comment, Favorite, Report


@admin.register(Favorite)
class FavoriteAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "post", "created_at")
    search_fields = ("user__username", "post__title")
    autocomplete_fields = ("user", "post")


@admin.register(Comment)
class CommentAdmin(admin.ModelAdmin):
    list_display = ("id", "post", "author", "is_hidden", "created_at")
    list_filter = ("is_hidden", "created_at")
    search_fields = ("content", "author__username")
    autocomplete_fields = ("post", "author")
    readonly_fields = ("created_at", "updated_at")


@admin.register(Report)
class ReportAdmin(admin.ModelAdmin):
    list_display = ("id", "target_type", "reporter", "status", "created_at", "reviewed_by")
    list_filter = ("target_type", "status", "created_at")
    search_fields = ("reason", "details", "reporter__username")
    readonly_fields = ("created_at", "reviewed_at")
