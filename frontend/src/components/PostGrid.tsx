import type { Post } from "../types/api";
import { PostCard } from "./PostCard";
import { EmptyState } from "./EmptyState";
import styles from "./PostGrid.module.css";

interface PostGridProps {
  posts: Post[];
  emptyTitle?: string;
  emptyDescription?: string;
}

export function PostGrid({
  posts,
  emptyTitle = "No hay publicaciones para mostrar",
  emptyDescription = "Intenta ajustar los filtros o vuelve más tarde.",
}: PostGridProps) {
  if (posts.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <div className={styles.grid}>
      {posts.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}
    </div>
  );
}
