import { useCallback, useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";

import { getPublicUser } from "../api/auth";
import { listPosts } from "../api/posts";
import { ApiError } from "../utils/apiError";
import type { Post, PublicUser } from "../types/api";
import { Avatar } from "../components/Avatar";
import { LoadingState } from "../components/LoadingState";
import { ErrorState } from "../components/ErrorState";
import { PostGrid } from "../components/PostGrid";
import { Pagination } from "../components/Pagination";
import styles from "./ProfilePage.module.css";

const PAGE_SIZE = 20;

export function ProfilePage() {
  const { username } = useParams<{ username: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Number(searchParams.get("page") ?? "1");

  const [profile, setProfile] = useState<PublicUser | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [count, setCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!username) return;
    setIsLoading(true);
    setError(null);
    try {
      const profileData = await getPublicUser(username);
      setProfile(profileData);
      const postsData = await listPosts({ author: profileData.id, page, page_size: PAGE_SIZE });
      setPosts(postsData.results);
      setCount(postsData.count);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setError("Este perfil no existe o no está disponible.");
      } else {
        setError(err instanceof ApiError ? err.displayMessage : "No se pudo cargar el perfil.");
      }
    } finally {
      setIsLoading(false);
    }
  }, [username, page]);

  useEffect(() => {
    void load();
  }, [load]);

  function goToPage(nextPage: number) {
    const next = new URLSearchParams(searchParams);
    next.set("page", String(nextPage));
    setSearchParams(next);
  }

  if (isLoading) return <LoadingState label="Cargando perfil…" />;
  if (error || !profile) return <ErrorState message={error ?? "Perfil no encontrado."} onRetry={load} />;

  return (
    <div>
      <div className={styles.header}>
        <Avatar username={profile.username} avatarUrl={profile.avatar} size="lg" />
        <div>
          <h1>@{profile.username}</h1>
          <p className={styles.meta}>
            Miembro desde {new Date(profile.date_joined).toLocaleDateString()}
          </p>
          {profile.biography && <p className={styles.bio}>{profile.biography}</p>}
        </div>
      </div>

      <h2 className={styles.sectionTitle}>Publicaciones</h2>
      <PostGrid
        posts={posts}
        emptyTitle="Sin publicaciones"
        emptyDescription={`@${profile.username} aún no tiene publicaciones visibles.`}
      />
      <Pagination page={page} pageSize={PAGE_SIZE} count={count} onPageChange={goToPage} />

      <p className={styles.backLink}>
        <Link to="/">Volver al inicio</Link>
      </p>
    </div>
  );
}
