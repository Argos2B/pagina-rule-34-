import { useState } from "react";
import { Link } from "react-router-dom";

import type { Post } from "../types/api";
import { Tag } from "./Tag";
import styles from "./PostCard.module.css";

interface PostCardProps {
  post: Post;
}

export function PostCard({ post }: PostCardProps) {
  const [imageFailed, setImageFailed] = useState(false);

  return (
    <article className={styles.card}>
      <Link to={`/posts/${post.id}`} className={styles.imageLink}>
        {imageFailed ? (
          <div className={styles.imageFallback}>Imagen no disponible</div>
        ) : (
          <img
            src={post.image}
            alt={post.title || `Publicación de ${post.author_username}`}
            className={styles.image}
            loading="lazy"
            onError={() => setImageFailed(true)}
          />
        )}
        {post.visibility === "unlisted" && <span className={styles.badge}>No listado</span>}
      </Link>
      <div className={styles.info}>
        {post.title && <h3 className={styles.title}>{post.title}</h3>}
        <Link to={`/profile/${post.author_username}`} className={styles.author}>
          @{post.author_username}
        </Link>
        {post.tags.length > 0 && (
          <div className={styles.tags}>
            {post.tags.slice(0, 4).map((tag) => (
              <Tag key={tag} name={tag} />
            ))}
          </div>
        )}
      </div>
    </article>
  );
}
