import styles from "./Avatar.module.css";

interface AvatarProps {
  username: string;
  avatarUrl?: string | null;
  size?: "sm" | "md" | "lg";
}

export function Avatar({ username, avatarUrl, size = "md" }: AvatarProps) {
  const initial = username.charAt(0).toUpperCase();

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={`Avatar de ${username}`}
        className={`${styles.avatar} ${styles[size]}`}
        loading="lazy"
      />
    );
  }

  return (
    <span className={`${styles.avatar} ${styles.fallback} ${styles[size]}`} aria-hidden="true">
      {initial}
    </span>
  );
}
