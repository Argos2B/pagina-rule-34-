import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
os.chdir(ROOT)
sys.path.insert(0, str(ROOT))

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backend.settings")

import django

django.setup()

from posts.models import Tag

deleted_total, _ = Tag.objects.all().delete()
print(f"TOTAL_DELETED={deleted_total}")
print(f"REMAINING_TAGS={Tag.objects.count()}")
