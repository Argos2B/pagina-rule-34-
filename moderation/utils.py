import logging

logger = logging.getLogger("moderation.audit")


def log_action(actor, action: str, *, target=None, reason: str = "", metadata: dict | None = None) -> None:
    """Persist an audit trail entry for an administrative/moderation action.

    Imported lazily inside the function body to avoid a circular import
    between ``moderation`` and the apps that trigger these actions.
    """
    from .models import AuditLog

    target_type = target.__class__.__name__.lower() if target is not None else ""
    target_id = str(getattr(target, "pk", "")) if target is not None else ""

    AuditLog.objects.create(
        actor=actor if getattr(actor, "is_authenticated", False) else None,
        action=action,
        target_type=target_type,
        target_id=target_id,
        reason=reason,
        metadata=metadata or {},
    )
    logger.info("action=%s actor=%s target=%s:%s", action, actor, target_type, target_id)
