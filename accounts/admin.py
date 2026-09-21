from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import User


@admin.register(User)
class CustomUserAdmin(UserAdmin):
    list_display = (
        "username",
        "email",
        "role",
        "is_active",
        "is_email_verified",
        "date_joined",
    )
    list_filter = ("role", "is_active", "is_email_verified")
    search_fields = ("username", "email")
    readonly_fields = ("date_joined", "last_login")

    fieldsets = UserAdmin.fieldsets + (
        ("Plataforma", {"fields": ("role", "avatar", "biography", "is_email_verified")}),
    )
