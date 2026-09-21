import { Link } from "react-router-dom";

import styles from "./Tag.module.css";

interface TagProps {
  name: string;
  onClick?: () => void;
}

/** A single tag chip. If `onClick` is provided it behaves as a filter toggle,
 * otherwise it links to the tag's search results. */
export function Tag({ name, onClick }: TagProps) {
  if (onClick) {
    return (
      <button type="button" className={styles.tag} onClick={onClick}>
        #{name}
      </button>
    );
  }

  return (
    <Link to={`/search?q=${encodeURIComponent(name)}`} className={styles.tag}>
      #{name}
    </Link>
  );
}
