from django.contrib import admin

from .models import SecurityAuditLog, UserVerification, WebhookEvent


@admin.register(UserVerification)
class UserVerificationAdmin(admin.ModelAdmin):
    list_display = ["user", "status", "provider", "age_verified", "identity_verified", "verified_at", "created_at"]
    list_filter = ["status", "provider", "document_type", "document_country"]
    search_fields = ["user__username", "user__email", "provider_reference"]
    readonly_fields = [
        "user", "status", "provider", "provider_reference", "document_type", "document_country",
        "age_verified", "identity_verified", "face_match_verified", "liveness_verified",
        "verification_started_at", "verified_at", "expires_at", "rejection_reason",
        "created_at", "updated_at",
    ]
    # Prevent accidental edits — verification data must only change via webhook
    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False


@admin.register(WebhookEvent)
class WebhookEventAdmin(admin.ModelAdmin):
    list_display = ["provider", "action_taken", "received_at"]
    readonly_fields = ["event_id_hash", "provider", "action_taken", "received_at"]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False


@admin.register(SecurityAuditLog)
class SecurityAuditLogAdmin(admin.ModelAdmin):
    list_display = ["event", "user_id", "ip_address", "created_at"]
    list_filter = ["event"]
    search_fields = ["user_id", "event"]
    readonly_fields = ["id", "user_id", "event", "metadata", "ip_address", "created_at"]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False  # Audit logs are immutable
