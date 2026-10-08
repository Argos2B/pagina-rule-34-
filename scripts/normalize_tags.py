import os
import sys
import re
from django.utils.text import slugify
from django.db import transaction

sys.path.insert(0, r"C:\Users\USUARIO\Documents\RULE 34 PAGINA WEB")
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')

import django
django.setup()

from posts.models import Tag

print('Starting tag normalization...')

with transaction.atomic():
    tags = list(Tag.objects.all())
    for t in tags:
        raw = t.name or ""
        # Normalize: lower, remove stray '#' characters, strip
        normalized = raw.strip().lower().replace('#', ' ').strip()
        # Split potential multi-tag strings on commas or whitespace
        parts = [p.strip() for p in re.split(r"[,\s]+", normalized) if p.strip()]
        if len(parts) <= 1:
            # Single token - ensure slug and name normalized
            new_name = parts[0] if parts else ''
            if not new_name:
                # no valid name -> remove tag and detach
                for p in list(t.posts.all()):
                    p.tags.remove(t)
                t.delete()
                continue

            if new_name != t.name or (t.slug or '') != slugify(new_name):
                existing = Tag.objects.filter(name=new_name).exclude(pk=t.pk).first()
                if existing:
                    # reassign posts to existing and delete this tag
                    for p in list(t.posts.all()):
                        p.tags.remove(t)
                        p.tags.add(existing)
                    t.delete()
                else:
                    t.name = new_name
                    t.slug = slugify(new_name)
                    t.save()
        else:
            # This tag actually contains multiple tokens; split into separate tags
            # Create/get each individual tag, reassign posts, then delete original
            token_tags = []
            for token in parts:
                token_name = token
                if not token_name:
                    continue
                token_slug = slugify(token_name)
                # Prefer existing tag by slug to avoid unique constraint errors
                token_obj = Tag.objects.filter(slug=token_slug).first()
                if not token_obj:
                    # Fallback to name match (case-insensitive)
                    token_obj = Tag.objects.filter(name__iexact=token_name).first()
                if not token_obj:
                    token_obj = Tag.objects.create(name=token_name, slug=token_slug)
                token_tags.append(token_obj)

            for p in list(t.posts.all()):
                p.tags.remove(t)
                for tok in token_tags:
                    p.tags.add(tok)
            t.delete()

print('Tag normalization complete. Current tags:')
for t in Tag.objects.all().order_by('name'):
    print(t.id, t.name, t.slug)
