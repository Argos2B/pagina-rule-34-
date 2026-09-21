import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { listPosts } from "../api/posts";
import { ApiError } from "../utils/apiError";
import type { Post } from "../types/api";
import { LoadingState } from "../components/LoadingState";
import { ErrorState } from "../components/ErrorState";
import { PostGrid } from "../components/PostGrid";
import { Pagination } from "../components/Pagination";
import { SearchBar } from "../components/SearchBar";

const PAGE_SIZE = 24;

export function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get("q") ?? "";
  const page = Number(searchParams.get("page") ?? "1");

  const [posts, setPosts] = useState<Post[]>([]);
  const [count, setCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await listPosts({ page, page_size: PAGE_SIZE, search: query || undefined });
      setPosts(response.results);
      setCount(response.count);
    } catch (err) {
      setError(err instanceof ApiError ? err.displayMessage : "No se pudo completar la búsqueda.");
    } finally {
      setIsLoading(false);
    }
  }, [page, query]);

  useEffect(() => {
    void load();
  }, [load]);

  function goToPage(nextPage: number) {
    const next = new URLSearchParams(searchParams);
    next.set("page", String(nextPage));
    setSearchParams(next);
  }

  return (
    <div>
      <h1>Resultados de búsqueda</h1>
      <p style={{ color: "var(--color-text-muted)", marginTop: "0.5rem" }}>
        {query ? `Mostrando resultados para "${query}"` : "Escribe un término para buscar."}
      </p>
      <div style={{ margin: "1.25rem 0" }}>
        <SearchBar initialValue={query} />
      </div>

      {isLoading && <LoadingState label="Buscando…" />}
      {!isLoading && error && <ErrorState message={error} onRetry={load} />}
      {!isLoading && !error && (
        <>
          <PostGrid
            posts={posts}
            emptyTitle="Sin resultados"
            emptyDescription="No encontramos publicaciones que coincidan con tu búsqueda."
          />
          <Pagination page={page} pageSize={PAGE_SIZE} count={count} onPageChange={goToPage} />
        </>
      )}
    </div>
  );
}
