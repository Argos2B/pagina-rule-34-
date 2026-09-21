import io

from django.core.exceptions import ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import SimpleTestCase
from PIL import Image

from core.validators import make_image_content_validator


def _png_file(name="test.png", size=(20, 20)):
    buffer = io.BytesIO()
    Image.new("RGB", size, color="purple").save(buffer, format="PNG")
    buffer.seek(0)
    return SimpleUploadedFile(name, buffer.read(), content_type="image/png")


class ImageContentValidatorTests(SimpleTestCase):
    """Unit tests for the real-content image validator, isolated from the
    API layer so oversized/edge-case files don't need to be uploaded through
    a full request/response cycle.
    """

    def test_rejects_file_over_max_size(self):
        validator = make_image_content_validator(max_size_bytes=10)  # unrealistically small on purpose
        with self.assertRaises(ValidationError):
            validator(_png_file())

    def test_accepts_file_within_size_and_dimension_limits(self):
        validator = make_image_content_validator(max_size_bytes=5 * 1024 * 1024, max_dimension_px=100)
        # Should not raise.
        validator(_png_file())

    def test_rejects_dimensions_over_limit(self):
        validator = make_image_content_validator(max_size_bytes=5 * 1024 * 1024, max_dimension_px=10)
        with self.assertRaises(ValidationError):
            validator(_png_file(size=(50, 50)))

    def test_rejects_disallowed_extension(self):
        validator = make_image_content_validator(max_size_bytes=5 * 1024 * 1024)
        fake_bmp = SimpleUploadedFile("image.bmp", b"BM not a real bmp header but irrelevant", content_type="image/bmp")
        with self.assertRaises(ValidationError):
            validator(fake_bmp)

    def test_rejects_non_image_content_with_image_extension(self):
        validator = make_image_content_validator(max_size_bytes=5 * 1024 * 1024)
        fake = SimpleUploadedFile("image.png", b"not actually a png", content_type="image/png")
        with self.assertRaises(ValidationError):
            validator(fake)
