"""
Management command: cleanup_expired_verification

Cleans up old/expired verification records and requests data deletion from the provider.

Usage:
    python manage.py cleanup_expired_verification --days 90

This command:
1. Finds UserVerification records that are older than --days and not VERIFIED
2. Calls provider.delete_verification_data() for each
3. Logs the action in SecurityAuditLog
4. Optionally deletes the record from DB (use --delete flag)
"""

import logging
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from verification.models import SecurityAuditLog, UserVerification, VerificationStatus
from verification.providers.factory import get_provider
from verification.services import log_security_event

logger = logging.getLogger("verification.security")


class Command(BaseCommand):
    help = "Clean up expired/old verification records and request data deletion from provider."

    def add_arguments(self, parser):
        parser.add_argument(
            "--days",
            type=int,
            default=90,
            help="Delete verification records older than this many days (default: 90)",
        )
        parser.add_argument(
            "--delete",
            action="store_true",
            help="Actually delete records from DB (default: dry-run)",
        )
        parser.add_argument(
            "--status",
            type=str,
            default="rejected,blocked,expired",
            help="Comma-separated list of statuses to clean (default: rejected,blocked,expired)",
        )

    def handle(self, *args, **options):
        days = options["days"]
        delete = options["delete"]
        status_filter = [s.strip() for s in options["status"].split(",")]

        cutoff_date = timezone.now() - timedelta(days=days)

        self.stdout.write(f"Searching for verification records older than {days} days ({cutoff_date})...")
        self.stdout.write(f"Status filter: {status_filter}")
        self.stdout.write(f"Mode: {'DELETE' if delete else 'DRY-RUN'}")

        queryset = UserVerification.objects.filter(
            created_at__lt=cutoff_date,
            status__in=status_filter,
        )

        count = queryset.count()
        self.stdout.write(f"Found {count} record(s) to process.")

        if count == 0:
            self.stdout.write(self.style.SUCCESS("No records to clean."))
            return

        provider = get_provider()
        deleted_count = 0
        error_count = 0

        for verification in queryset:
            try:
                self.stdout.write(f"Processing user_id={verification.user_id}, status={verification.status}...")

                if verification.provider_reference:
                    try:
                        provider.delete_verification_data(verification.provider_reference)
                        self.stdout.write(
                            self.style.SUCCESS(f"  ✓ Provider deletion requested for {verification.provider_reference}")
                        )
                    except Exception as exc:
                        self.stdout.write(self.style.WARNING(f"  ⚠ Provider deletion failed: {exc}"))
                        error_count += 1

                log_security_event(
                    verification.user_id,
                    "verification_data_cleanup",
                    {"reason": "automated_cleanup", "days": days},
                )

                if delete:
                    verification.delete()
                    deleted_count += 1
                    self.stdout.write(self.style.SUCCESS(f"  ✓ Deleted from DB"))
                else:
                    self.stdout.write(f"  [DRY-RUN] Would delete from DB")

            except Exception as exc:
                self.stdout.write(self.style.ERROR(f"  ✗ Error: {exc}"))
                logger.error(f"cleanup_expired_verification error user_id={verification.user_id}: {exc}")
                error_count += 1

        summary = f"\nCleanup complete: {deleted_count} deleted, {error_count} errors"
        if not delete:
            summary += " (DRY-RUN — no deletions)"

        if error_count == 0:
            self.stdout.write(self.style.SUCCESS(summary))
        else:
            self.stdout.write(self.style.WARNING(summary))
