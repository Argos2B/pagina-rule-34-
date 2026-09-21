import uuid
from pathlib import Path

from django.utils.deconstruct import deconstructible


@deconstructible
class unique_upload_path:
    """Callable ``upload_to`` that stores files under ``folder`` with a
    random UUID filename, preventing path traversal and filename
    collisions/enumeration regardless of the original filename supplied
    by the client.

    Implemented as a deconstructible class (rather than a closure) so
    Django can serialize it into migration files.
    """

    def __init__(self, folder: str):
        self.folder = folder

    def __call__(self, instance, filename):
        ext = Path(filename).suffix.lower()
        return f"{self.folder}/{uuid.uuid4().hex}{ext}"
