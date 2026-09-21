"""
Dormant DRF permission class for publication eligibility.

Identity/age verification is temporarily disabled. This class is retained as a
stable integration point for the future provider implementation.
"""

import logging

from rest_framework.permissions import BasePermission

from .services import can_user_publish, get_client_ip, log_security_event

logger = logging.getLogger("verification.security")


class IsVerifiedToPublish(BasePermission):
    """
    Allow authenticated users while the verification gate is paused.
    """

    message = "Debes iniciar sesión para publicar contenido."

    def has_permission(self, request, view) -> bool:
        user = request.user
        if not (user and user.is_authenticated):
            return False

        allowed, reason = can_user_publish(user)

        if not allowed:
            ip = get_client_ip(request)
            logger.warning(
                "publish_blocked reason=%s user_id=%s ip=%s path=%s",
                reason,
                user.pk,
                ip,
                request.path,
            )
            # Log IDOR attempts: if user tries to publish on behalf of another
            author_id = request.data.get("author")
            if author_id and str(author_id) != str(user.pk):
                log_security_event(
                    user.pk,
                    "idor_attempt",
                    {"attempted_author_id": str(author_id)},
                    ip,
                )

        return allowed
