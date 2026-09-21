import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";

import { register } from "../api/auth";
import { useAuth } from "../auth/useAuth";
import { ApiError } from "../utils/apiError";
import styles from "./AuthPage.module.css";

export function RegisterPage() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    setIsSubmitting(true);
    try {
      await register({ username, email, password, password_confirm: passwordConfirm });
      // Registration succeeded; log the user in immediately for a smooth flow.
      await login(username, password);
      navigate("/", { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        setFieldErrors(err.fieldErrors);
        setError(Object.keys(err.fieldErrors).length ? null : err.displayMessage);
      } else {
        setError("No se pudo completar el registro.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className={styles.wrapper}>
      <form className={styles.card} onSubmit={handleSubmit}>
        <h1>Crear cuenta</h1>

        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}

        <div className="field">
          <label htmlFor="username">Usuario</label>
          <input
            id="username"
            type="text"
            autoComplete="username"
            required
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
          {fieldErrors.username && <span className="field-error">{fieldErrors.username[0]}</span>}
        </div>

        <div className="field">
          <label htmlFor="email">Correo electrónico</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          {fieldErrors.email && <span className="field-error">{fieldErrors.email[0]}</span>}
        </div>

        <div className="field">
          <label htmlFor="password">Contraseña</label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={10}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          {fieldErrors.password && <span className="field-error">{fieldErrors.password[0]}</span>}
        </div>

        <div className="field">
          <label htmlFor="password_confirm">Confirmar contraseña</label>
          <input
            id="password_confirm"
            type="password"
            autoComplete="new-password"
            required
            value={passwordConfirm}
            onChange={(event) => setPasswordConfirm(event.target.value)}
          />
          {fieldErrors.password_confirm && (
            <span className="field-error">{fieldErrors.password_confirm[0]}</span>
          )}
        </div>

        <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
          {isSubmitting ? "Creando cuenta…" : "Registrarse"}
        </button>

        <div className={styles.links}>
          <Link to="/login">Ya tengo una cuenta</Link>
        </div>
      </form>
    </div>
  );
}
