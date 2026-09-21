import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { listCategories, listPosts } from "../api/posts";
import { ApiError } from "../utils/apiError";
import type { Category, Post } from "../types/api";
import { LoadingState } from "../components/LoadingState";
import { ErrorState } from "../components/ErrorState";
import { PostGrid } from "../components/PostGrid";
import { Pagination } from "../components/Pagination";
import styles from "./HomePage.module.css";

const PAGE_SIZE = 24;

export function HomePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Number(searchParams.get("page") ?? "1");
  const category = searchParams.get("category") ?? "";
  const ordering = searchParams.get("ordering") ?? "-created_at";

  const [posts, setPosts] = useState<Post[]>([]);
  const [count, setCount] = useState(0);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await listPosts({
        page,
        page_size: PAGE_SIZE,
        ordering,
        category: category ? Number(category) : undefined,
      });
      setPosts(response.results);
      setCount(response.count);
    } catch (err) {
      setError(err instanceof ApiError ? err.displayMessage : "No se pudieron cargar las publicaciones.");
    } finally {
      setIsLoading(false);
    }
  }, [page, category, ordering]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    listCategories()
      .then((response) => setCategories(response.results))
      .catch(() => setCategories([]));
  }, []);

  function updateParam(key: string, value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) {
      next.set(key, value);
    } else {
      next.delete(key);
    }
    next.delete("page");
    setSearchParams(next);
  }

  function goToPage(nextPage: number) {
    const next = new URLSearchParams(searchParams);
    next.set("page", String(nextPage));
    setSearchParams(next);
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1>Explorar</h1>
        <div className={styles.filters}>
          <select
            value={category}
            onChange={(event) => updateParam("category", event.target.value)}
            aria-label="Filtrar por categoría"
          >
            <option value="">Todas las categorías</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
          <select
            value={ordering}
            onChange={(event) => updateParam("ordering", event.target.value)}
            aria-label="Ordenar por"
          >
            <option value="-created_at">Más recientes</option>
            <option value="created_at">Más antiguas</option>
          </select>
        </div>
      </div>

      {isLoading && <LoadingState label="Cargando publicaciones…" />}
      {!isLoading && error && <ErrorState message={error} onRetry={load} />}
      {!isLoading && !error && (
        <>
          <PostGrid posts={posts} />
          <Pagination page={page} pageSize={PAGE_SIZE} count={count} onPageChange={goToPage} />
        </>
      )}
    </div>
  );
}
