from rest_framework.permissions import BasePermission


class IsModeratorOrAbove(BasePermission):
    """Grants access to moderators, admins and superadmins."""

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.is_moderator)


class IsAdminOrAbove(BasePermission):
    """Grants access to admins and superadmins only."""

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.is_admin_role)


class IsSuperAdmin(BasePermission):
    """Grants access to superadmins only."""

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.is_superadmin_role)
