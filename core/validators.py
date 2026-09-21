from pathlib import Path

from django.core.exceptions import ValidationError
from django.utils.deconstruct import deconstructible
from django.utils.translation import gettext_lazy as _
from PIL import Image

ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
ALLOWED_IMAGE_FORMATS = {"JPEG", "PNG", "WEBP", "GIF"}
MAX_DIMENSION_PX = 8000


def validate_image_extension(filename: str) -> None:
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_IMAGE_EXTENSIONS:
        raise ValidationError(
            _("Extensión de archivo no permitida: %(ext)s"),
            params={"ext": ext},
        )


@deconstructible
class make_image_content_validator:
    """Validator that checks real file size, actual image content (not
    just the extension) and pixel dimensions using Pillow.

    Implemented as a deconstructible class (rather than a closure) so
    Django can serialize it into migration files.
    """

    def __init__(self, *, max_size_bytes: int, max_dimension_px: int = MAX_DIMENSION_PX):
        self.max_size_bytes = max_size_bytes
        self.max_dimension_px = max_dimension_px

    def __call__(self, file) -> None:
        validate_image_extension(getattr(file, "name", ""))

        if file.size > self.max_size_bytes:
            raise ValidationError(
                _("El archivo supera el tamaño máximo permitido de %(mb)s MB."),
                params={"mb": self.max_size_bytes // (1024 * 1024)},
            )

        try:
            file.seek(0)
            image = Image.open(file)
            image.verify()
        except Exception as exc:
            raise ValidationError(_("El archivo no es una imagen válida o está corrupto.")) from exc
        finally:
            file.seek(0)

        # Re-open after verify(): verify() leaves the Image object unusable for further access.
        image = Image.open(file)
        if image.format not in ALLOWED_IMAGE_FORMATS:
            raise ValidationError(_("Tipo de imagen no permitido."))

        width, height = image.size
        if width > self.max_dimension_px or height > self.max_dimension_px:
            raise ValidationError(_("Las dimensiones de la imagen son demasiado grandes."))

        file.seek(0)

    def __eq__(self, other):
        return (
            isinstance(other, make_image_content_validator)
            and self.max_size_bytes == other.max_size_bytes
            and self.max_dimension_px == other.max_dimension_px
        )
