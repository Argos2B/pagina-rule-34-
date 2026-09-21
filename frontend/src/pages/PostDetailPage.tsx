import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { deletePost, getPost, hidePost, restorePost } from "../api/posts";
import {
  addFavorite,
  createComment,
  createReport,
  deleteComment,
  hideComment,
  listComments,
  listFavorites,
  removeFavorite,
  unhideComment,
} from "../api/interactions";
import { useAuth } from "../auth/useAuth";
import { isModeratorOrAbove } from "../utils/roles";
import { ApiError } from "../utils/apiError";
import type { Comment as CommentType, Favorite, Post } from "../types/api";
import { LoadingState } from "../components/LoadingState";
import { ErrorState } from "../components/ErrorState";
import { Tag } from "../components/Tag";
import { Comment } from "../components/Comment";
import { Modal } from "../components/Modal";
import styles from "./PostDetailPage.module.css";

export function PostDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();

  const [post, setPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<CommentType[]>([]);
  const [favorite, setFavorite] = useState<Favorite | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [imageFailed, setImageFailed] = useState(false);

  const [commentText, setCommentText] = useState("");
  const [commentError, setCommentError] = useState<string | null>(null);
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);

  const [isReportOpen, setIsReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reportError, setReportError] = useState<string | null>(null);
  const [reportSent, setReportSent] = useState(false);

  const canModerate = isModeratorOrAbove(user?.role);
  const isOwnPost = post != null && user != null && post.author === user.id;

  const load = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    setError(null);
    try {
      const [postData, commentsData] = await Promise.all([getPost(id), listComments(Number(id))]);
      setPost(postData);
      setComments(commentsData.results);

      if (isAuthenticated) {
        const favoritesData = await listFavorites(1);
        const match = favoritesData.results.find((fav) => fav.post === postData.id);
        setFavorite(match ?? null);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.displayMessage : "No se pudo cargar la publicación.");
    } finally {
      setIsLoading(false);
    }
  }, [id, isAuthenticated]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleFavorite() {
    if (!post) return;
    try {
      if (favorite) {
        await removeFavorite(favorite.id);
        setFavorite(null);
      } else {
        const created = await addFavorite(post.id);
        setFavorite(created);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.displayMessage : "No se pudo actualizar el favorito.");
    }
  }

  async function handleAddComment(event: FormEvent) {
    event.preventDefault();
    if (!post) return;
    setCommentError(null);
    setIsSubmittingComment(true);
    try {
      const created = await createComment(post.id, commentText);
      setComments((prev) => [...prev, created]);
      setCommentText("");
    } catch (err) {
      setCommentError(err instanceof ApiError ? err.displayMessage : "No se pudo publicar el comentario.");
    } finally {
      setIsSubmittingComment(false);
    }
  }

  async function handleDeleteComment(commentId: number) {
    try {
      await deleteComment(commentId);
      setComments((prev) => prev.filter((comment) => comment.id !== commentId));
    } catch (err) {
      setError(err instanceof ApiError ? err.displayMessage : "No se pudo eliminar el comentario.");
    }
  }

  async function handleHideComment(commentId: number) {
    const updated = await hideComment(commentId);
    setComments((prev) => prev.map((comment) => (comment.id === commentId ? updated : comment)));
  }

  async function handleUnhideComment(commentId: number) {
    const updated = await unhideComment(commentId);
    setComments((prev) => prev.map((comment) => (comment.id === commentId ? updated : comment)));
  }

  async function handleHidePost() {
    if (!post) return;
    const updated = await hidePost(post.id);
    setPost(updated);
  }

  async function handleRestorePost() {
    if (!post) return;
    const updated = await restorePost(post.id);
    setPost(updated);
  }

  async function handleDeletePost() {
    if (!post) return;
    if (!window.confirm("¿Eliminar esta publicación? Esta acción no se puede deshacer desde la interfaz.")) {
      return;
    }
    await deletePost(post.id);
    navigate("/");
  }

  async function handleReportSubmit(event: FormEvent) {
    event.preventDefault();
    if (!post) return;
    setReportError(null);
    try {
      await createReport({ target_type: "post", post: post.id, reason: reportReason });
      setReportSent(true);
    } catch (err) {
      setReportError(err instanceof ApiError ? err.displayMessage : "No se pudo enviar el reporte.");
    }
  }

  if (isLoading) return <LoadingState label="Cargando publicación…" />;
  if (error && !post) return <ErrorState message={error} onRetry={load} />;
  if (!post) return null;

  return (
    <div className={styles.page}>
      <div className={styles.imageColumn}>
        {imageFailed ? (
          <div className={styles.imageFallback}>Imagen no disponible</div>
        ) : (
          <img
            src={post.image}
            alt={post.title || `Publicación de ${post.author_username}`}
            className={styles.image}
            onError={() => setImageFailed(true)}
          />
        )}
      </div>

      <div className={styles.details}>
        {post.title && <h1>{post.title}</h1>}
        <Link to={`/profile/${post.author_username}`} className={styles.author}>
          @{post.author_username}
        </Link>

        {post.description && <p className={styles.description}>{post.description}</p>}

        {post.category_name && <p className={styles.category}>Categoría: {post.category_name}</p>}

        {post.tags.length > 0 && (
          <div className={styles.tags}>
            {post.tags.map((tag) => (
              <Tag key={tag} name={tag} />
            ))}
          </div>
        )}

        <div className={styles.actions}>
          {isAuthenticated && (
            <button type="button" className="btn btn-secondary" onClick={toggleFavorite}>
              {favorite ? "★ Quitar de favoritos" : "☆ Agregar a favoritos"}
            </button>
          )}
          {isAuthenticated && (
            <button type="button" className="btn btn-secondary" onClick={() => setIsReportOpen(true)}>
              Reportar
            </button>
          )}
          {(isOwnPost || canModerate) && (
            <button type="button" className="btn btn-secondary" onClick={handleDeletePost}>
              Eliminar
            </button>
          )}
          {canModerate && post.status !== "hidden" && (
            <button type="button" className="btn btn-secondary" onClick={handleHidePost}>
              Ocultar (moderación)
            </button>
          )}
          {canModerate && post.status === "hidden" && (
            <button type="button" className="btn btn-secondary" onClick={handleRestorePost}>
              Restaurar
            </button>
          )}
        </div>

        {error && <p className="field-error">{error}</p>}

        <section className={styles.comments}>
          <h2>Comentarios</h2>

          {isAuthenticated ? (
            <form onSubmit={handleAddComment} className={styles.commentForm}>
              <label htmlFor="comment" className="visually-hidden">
                Escribir comentario
              </label>
              <textarea
                id="comment"
                required
                maxLength={2000}
                rows={3}
                value={commentText}
                onChange={(event) => setCommentText(event.target.value)}
                placeholder="Escribe un comentario…"
              />
              {commentError && <p className="field-error">{commentError}</p>}
              <button type="submit" className="btn btn-primary" disabled={isSubmittingComment}>
                {isSubmittingComment ? "Publicando…" : "Comentar"}
              </button>
            </form>
          ) : (
            <p style={{ color: "var(--color-text-muted)" }}>
              <Link to="/login">Inicia sesión</Link> para comentar.
            </p>
          )}

          {comments.length === 0 ? (
            <p style={{ color: "var(--color-text-muted)", marginTop: "1rem" }}>
              Aún no hay comentarios.
            </p>
          ) : (
            <div className={styles.commentList}>
              {comments.map((comment) => (
                <Comment
                  key={comment.id}
                  comment={comment}
                  isOwn={user?.id === comment.author}
                  canModerate={canModerate}
                  onDelete={handleDeleteComment}
                  onHide={handleHideComment}
                  onUnhide={handleUnhideComment}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      {isReportOpen && (
        <Modal title="Reportar publicación" onClose={() => setIsReportOpen(false)}>
          {reportSent ? (
            <p>Gracias, tu reporte fue enviado y será revisado por el equipo de moderación.</p>
          ) : (
            <form onSubmit={handleReportSubmit} className={styles.reportForm}>
              <div className="field">
                <label htmlFor="report-reason">Motivo</label>
                <input
                  id="report-reason"
                  required
                  value={reportReason}
                  onChange={(event) => setReportReason(event.target.value)}
                />
              </div>
              {reportError && <p className="field-error">{reportError}</p>}
              <button type="submit" className="btn btn-primary">
                Enviar reporte
              </button>
            </form>
          )}
        </Modal>
      )}
    </div>
  );
}
