import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";

import { createPost, listCategories } from "../api/posts";
import { ApiError } from "../utils/apiError";
import type { Category, PostVisibility } from "../types/api";
import styles from "./UploadPage.module.css";

const MAX_SIZE_BYTES = 15 * 1024 * 1024;
const ALLOWED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".gif"];

export function UploadPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [visibility, setVisibility] = useState<PostVisibility>("public");
  const [categories, setCategories] = useState<Category[]>([]);

  const [clientError, setClientError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    listCategories()
      .then((response) => setCategories(response.results))
      .catch(() => setCategories([]));
  }, []);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    setClientError(null);
    if (!selected) {
      setFile(null);
      setPreviewUrl(null);
      return;
    }

    const extension = selected.name.slice(selected.name.lastIndexOf(".")).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(extension)) {
      setClientError(`Formato no soportado. Usa: ${ALLOWED_EXTENSIONS.join(", ")}`);
      setFile(null);
      setPreviewUrl(null);
      return;
    }
    if (selected.size > MAX_SIZE_BYTES) {
      setClientError("El archivo supera el tamaño máximo permitido de 15 MB.");
      setFile(null);
      setPreviewUrl(null);
      return;
    }

    setFile(selected);
    setPreviewUrl(URL.createObjectURL(selected));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setServerError(null);

    if (!file) {
      setClientError("Selecciona una imagen para publicar.");
      return;
    }

    const tags = tagsInput
      .split(",")
      .map((tag) => tag.trim().toLowerCase())
      .filter(Boolean);

    setIsSubmitting(true);
    setProgress(0);
    try {
      const created = await createPost(
        { title, description, image: file, category: categoryId ? Number(categoryId) : null, tags, visibility },
        setProgress,
      );
      navigate(`/posts/${created.id}`);
    } catch (err) {
      setServerError(err instanceof ApiError ? err.displayMessage : "No se pudo subir la publicación.");
    } finally {
      setIsSubmitting(false);
      setProgress(null);
    }
  }

  return (
    <div className={styles.wrapper}>
      <h1>Subir publicación</h1>
      <form className={styles.form} onSubmit={handleSubmit}>
        <div className={styles.dropzone} onClick={() => fileInputRef.current?.click()}>
          {previewUrl ? (
            <img src={previewUrl} alt="Vista previa" className={styles.preview} />
          ) : (
            <p>Haz clic para seleccionar una imagen (JPG, PNG, WEBP, GIF — máx. 15 MB)</p>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept={ALLOWED_EXTENSIONS.join(",")}
          onChange={handleFileChange}
          className="visually-hidden"
          aria-label="Seleccionar imagen"
        />
        {clientError && <p className="field-error">{clientError}</p>}

        <div className="field">
          <label htmlFor="title">Título</label>
          <input id="title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={200} />
        </div>

        <div className="field">
          <label htmlFor="description">Descripción</label>
          <textarea
            id="description"
            rows={4}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="tags">Etiquetas (separadas por coma)</label>
          <input
            id="tags"
            value={tagsInput}
            onChange={(event) => setTagsInput(event.target.value)}
            placeholder="ej: paisaje, digital, azul"
          />
        </div>

        <div className={styles.row}>
          <div className="field">
            <label htmlFor="category">Categoría</label>
            <select id="category" value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
              <option value="">Sin categoría</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="visibility">Visibilidad</label>
            <select
              id="visibility"
              value={visibility}
              onChange={(event) => setVisibility(event.target.value as PostVisibility)}
            >
              <option value="public">Pública</option>
              <option value="unlisted">No listada (solo con enlace)</option>
              <option value="private">Privada</option>
            </select>
          </div>
        </div>

        {serverError && <p className="field-error">{serverError}</p>}
        {progress !== null && (
          <div className={styles.progressBar}>
            <div className={styles.progressFill} style={{ width: `${progress}%` }} />
          </div>
        )}

        <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
          {isSubmitting ? "Subiendo…" : "Publicar"}
        </button>
      </form>
    </div>
  );
}
