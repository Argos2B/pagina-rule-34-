import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { confirmPasswordReset, requestPasswordReset } from "../api/auth";
import { ApiError } from "../utils/apiError";
import styles from "./AuthPage.module.css";

export function ForgotPasswordPage() {
  const [searchParams] = useSearchParams();
  const uid = searchParams.get("uid");
  const token = searchParams.get("token");

  if (uid && token) {
    return <ResetPasswordForm uid={uid} token={token} />;
  }

  return <RequestResetForm />;
}

function RequestResetForm() {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setIsSubmitting(true);
    try {
      const detail = await requestPasswordReset(email);
      setMessage(detail);
    } catch (err) {
      setError(err instanceof ApiError ? err.displayMessage : "No se pudo procesar la solicitud.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className={styles.wrapper}>
      <form className={styles.card} onSubmit={handleSubmit}>
        <h1>Recuperar contraseña</h1>
        <p style={{ color: "var(--color-text-muted)", fontSize: "0.9rem" }}>
          Ingresa tu correo y te enviaremos instrucciones para restablecer tu contraseña.
        </p>

        {message && <p style={{ color: "var(--color-success)" }}>{message}</p>}
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}

        <div className="field">
          <label htmlFor="email">Correo electrónico</label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>

        <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
          {isSubmitting ? "Enviando…" : "Enviar instrucciones"}
        </button>

        <div className={styles.links}>
          <Link to="/login">Volver a iniciar sesión</Link>
        </div>
      </form>
    </div>
  );
}

function ResetPasswordForm({ uid, token }: { uid: string; token: string }) {
  const [newPassword, setNewPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await confirmPasswordReset(uid, token, newPassword);
      setSuccess(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.displayMessage : "El enlace no es válido o ha expirado.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (success) {
    return (
      <div className={styles.wrapper}>
        <div className={styles.card}>
          <h1>Contraseña actualizada</h1>
          <p>Ya puedes iniciar sesión con tu nueva contraseña.</p>
          <Link to="/login" className="btn btn-primary">
            Ir a iniciar sesión
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      <form className={styles.card} onSubmit={handleSubmit}>
        <h1>Elegir nueva contraseña</h1>

        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}

        <div className="field">
          <label htmlFor="new_password">Nueva contraseña</label>
          <input
            id="new_password"
            type="password"
            required
            minLength={10}
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
          />
        </div>

        <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
          {isSubmitting ? "Guardando…" : "Guardar nueva contraseña"}
        </button>
      </form>
    </div>
  );
}
