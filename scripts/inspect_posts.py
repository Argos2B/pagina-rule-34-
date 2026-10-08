from posts.models import Post
from django.utils import timezone

print('Post model module:', Post.__module__)
print('Total posts:', Post.objects.count())
for p in Post.objects.all().order_by('-created_at')[:20]:
    print('ID:', p.id, 'title:', getattr(p,'title',None), 'status:', getattr(p,'status',None), 'visibility:', getattr(p,'visibility',None), 'is_deleted:', p.is_deleted, 'tags:', [t.name for t in p.tags.all()], 'image:', getattr(p,'image',''))
