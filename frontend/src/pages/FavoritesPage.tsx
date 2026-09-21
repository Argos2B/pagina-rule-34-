import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { listFavorites } from "../api/interactions";
import { getPost } from "../api/posts";
import { ApiError } from "../utils/apiError";
import type { Post } from "../types/api";
import { LoadingState } from "../components/LoadingState";
import { ErrorState } from "../components/ErrorState";
import { PostGrid } from "../components/PostGrid";
import { Pagination } from "../components/Pagination";

const PAGE_SIZE = 20;

export function FavoritesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Number(searchParams.get("page") ?? "1");

  const [posts, setPosts] = useState<Post[]>([]);
  const [count, setCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const favoritesResponse = await listFavorites(page);
      setCount(favoritesResponse.count);
      // The Favorite serializer only exposes the post ID, so each favorited
      // post's full data must be fetched individually.
      const postResults = await Promise.allSettled(
        favoritesResponse.results.map((favorite) => getPost(favorite.post)),
      );
      const loadedPosts = postResults
        .filter((result): result is PromiseFulfilledResult<Post> => result.status === "fulfilled")
        .map((result) => result.value);
      setPosts(loadedPosts);
    } catch (err) {
      setError(err instanceof ApiError ? err.displayMessage : "No se pudieron cargar tus favoritos.");
    } finally {
      setIsLoading(false);
    }
  }, [page]);

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
      <h1>Mis favoritos</h1>
      <div style={{ marginTop: "1.25rem" }}>
        {isLoading && <LoadingState label="Cargando favoritos…" />}
        {!isLoading && error && <ErrorState message={error} onRetry={load} />}
        {!isLoading && !error && (
          <>
            <PostGrid
              posts={posts}
              emptyTitle="Aún no tienes favoritos"
              emptyDescription="Explora publicaciones y márcalas como favoritas para verlas aquí."
            />
            <Pagination page={page} pageSize={PAGE_SIZE} count={count} onPageChange={goToPage} />
          </>
        )}
      </div>
    </div>
  );
}
