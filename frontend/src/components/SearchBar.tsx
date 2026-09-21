import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";

import styles from "./SearchBar.module.css";

interface SearchBarProps {
  initialValue?: string;
  placeholder?: string;
}

export function SearchBar({ initialValue = "", placeholder = "Buscar publicaciones, etiquetas…" }: SearchBarProps) {
  const [value, setValue] = useState(initialValue);
  const navigate = useNavigate();

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = value.trim();
    navigate(trimmed ? `/search?q=${encodeURIComponent(trimmed)}` : "/search");
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit} role="search">
      <label htmlFor="global-search" className="visually-hidden">
        Buscar
      </label>
      <input
        id="global-search"
        type="search"
        className={styles.input}
        placeholder={placeholder}
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
      <button type="submit" className={styles.button}>
        Buscar
      </button>
    </form>
  );
}
