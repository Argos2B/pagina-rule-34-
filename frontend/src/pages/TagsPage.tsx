import { useCallback, useEffect, useState } from "react";

import { listTags } from "../api/posts";
import { ApiError } from "../utils/apiError";
import type { Tag as TagType } from "../types/api";
import { LoadingState } from "../components/LoadingState";
import { ErrorState } from "../components/ErrorState";
import { EmptyState } from "../components/EmptyState";
import { Tag } from "../components/Tag";
import { useDebounce } from "../hooks/useDebounce";
import styles from "./TagsPage.module.css";

export function TagsPage() {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search);
  const [tags, setTags] = useState<TagType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await listTags(debouncedSearch || undefined);
      setTags(response.results);
    } catch (err) {
      setError(err instanceof ApiError ? err.displayMessage : "No se pudieron cargar las etiquetas.");
    } finally {
      setIsLoading(false);
    }
  }, [debouncedSearch]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <h1>Etiquetas</h1>
      <div className={styles.searchRow}>
        <label htmlFor="tag-search" className="visually-hidden">
          Buscar etiquetas
        </label>
        <input
          id="tag-search"
          type="search"
          placeholder="Buscar etiquetas…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className={styles.searchInput}
        />
      </div>

      {isLoading && <LoadingState label="Cargando etiquetas…" />}
      {!isLoading && error && <ErrorState message={error} onRetry={load} />}
      {!isLoading && !error && tags.length === 0 && (
        <EmptyState title="No hay etiquetas" description="Aún no existen etiquetas que coincidan con tu búsqueda." />
      )}
      {!isLoading && !error && tags.length > 0 && (
        <div className={styles.tagList}>
          {tags.map((tag) => (
            <Tag key={tag.id} name={tag.name} />
          ))}
        </div>
      )}
    </div>
  );
}
