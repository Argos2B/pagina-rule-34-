import { Link } from "react-router-dom";

import type { Comment as CommentType } from "../types/api";
import { Avatar } from "./Avatar";
import styles from "./Comment.module.css";

interface CommentProps {
  comment: CommentType;
  canModerate?: boolean;
  onHide?: (id: number) => void;
  onUnhide?: (id: number) => void;
  onDelete?: (id: number) => void;
  isOwn?: boolean;
}

export function Comment({ comment, canModerate, onHide, onUnhide, onDelete, isOwn }: CommentProps) {
  return (
    <div className={styles.comment}>
      <Avatar username={comment.author_username} size="sm" />
      <div className={styles.body}>
        <div className={styles.meta}>
          <Link to={`/profile/${comment.author_username}`} className={styles.author}>
            @{comment.author_username}
          </Link>
          <time className={styles.date} dateTime={comment.created_at}>
            {new Date(comment.created_at).toLocaleDateString()}
          </time>
          {comment.is_hidden && <span className={styles.hiddenBadge}>Oculto</span>}
        </div>
        <p className={styles.content}>{comment.content}</p>
        <div className={styles.actions}>
          {(isOwn || canModerate) && onDelete && (
            <button type="button" className={styles.actionButton} onClick={() => onDelete(comment.id)}>
              Eliminar
            </button>
          )}
          {canModerate && !comment.is_hidden && onHide && (
            <button type="button" className={styles.actionButton} onClick={() => onHide(comment.id)}>
              Ocultar
            </button>
          )}
          {canModerate && comment.is_hidden && onUnhide && (
            <button type="button" className={styles.actionButton} onClick={() => onUnhide(comment.id)}>
              Mostrar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
