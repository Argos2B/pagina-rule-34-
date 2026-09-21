import { useState, type FormEvent } from "react";

import { changePassword, requestEmailVerification, updateMe } from "../api/auth";
import { useAuth } from "../auth/useAuth";
import { ApiError } from "../utils/apiError";
import styles from "./SettingsPage.module.css";

export function SettingsPage() {
  const { user, refreshUser } = useAuth();

  if (!user) return null;

  return (
    <div className={styles.wrapper}>
      <h1>Ajustes de la cuenta</h1>
      <ProfileForm email={user.email} biography={user.biography} onSaved={refreshUser} />
      <EmailVerificationSection isVerified={user.is_email_verified} />
      <PasswordForm />
    </div>
  );
}

function ProfileForm({
  email: initialEmail,
  biography: initialBiography,
  onSaved,
}: {
  email: string;
  biography: string;
  onSaved: () => Promise<void>;
}) {
  const [email, setEmail] = useState(initialEmail);
  const [biography, setBiography] = useState(initialBiography);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccess(false);
    setFieldErrors({});
    setIsSubmitting(true);
    try {
      await updateMe({ email, biography });
      await onSaved();
      setSuccess(true);
    } catch (err) {
      if (err instanceof ApiError) {
        setFieldErrors(err.fieldErrors);
        setError(Object.keys(err.fieldErrors).length ? null : err.displayMessage);
      } else {
        setError("No se pudo guardar el perfil.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className={styles.section} onSubmit={handleSubmit}>
      <h2>Perfil</h2>
      {success && <p style={{ color: "var(--color-success)" }}>Perfil actualizado.</p>}
      {error && <p className="field-error">{error}</p>}

      <div className="field">
        <label htmlFor="email">Correo electrónico</label>
        <input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
        {fieldErrors.email && <span className="field-error">{fieldErrors.email[0]}</span>}
      </div>

      <div className="field">
        <label htmlFor="biography">Biografía</label>
        <textarea
          id="biography"
          rows={4}
          value={biography}
          onChange={(event) => setBiography(event.target.value)}
        />
        {fieldErrors.biography && <span className="field-error">{fieldErrors.biography[0]}</span>}
      </div>

      <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
        {isSubmitting ? "Guardando…" : "Guardar cambios"}
      </button>
    </form>
  );
}

function EmailVerificationSection({ isVerified }: { isVerified: boolean }) {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRequest() {
    setError(null);
    try {
      await requestEmailVerification();
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.displayMessage : "No se pudo enviar el correo de verificación.");
    }
  }

  if (isVerified) {
    return (
      <div className={styles.section}>
        <h2>Correo electrónico</h2>
        <p style={{ color: "var(--color-success)" }}>Tu correo está verificado.</p>
      </div>
    );
  }

  return (
    <div className={styles.section}>
      <h2>Correo electrónico</h2>
      <p>Tu correo aún no está verificado.</p>
      {sent ? (
        <p style={{ color: "var(--color-success)" }}>Correo de verificación enviado.</p>
      ) : (
        <button type="button" className="btn btn-secondary" onClick={handleRequest}>
          Enviar correo de verificación
        </button>
      )}
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}

function PasswordForm() {
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccess(false);
    setIsSubmitting(true);
    try {
      await changePassword(oldPassword, newPassword);
      setOldPassword("");
      setNewPassword("");
      setSuccess(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.displayMessage : "No se pudo cambiar la contraseña.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className={styles.section} onSubmit={handleSubmit}>
      <h2>Cambiar contraseña</h2>
      {success && <p style={{ color: "var(--color-success)" }}>Contraseña actualizada.</p>}
      {error && <p className="field-error">{error}</p>}

      <div className="field">
        <label htmlFor="old_password">Contraseña actual</label>
        <input
          id="old_password"
          type="password"
          required
          autoComplete="current-password"
          value={oldPassword}
          onChange={(event) => setOldPassword(event.target.value)}
        />
      </div>

      <div className="field">
        <label htmlFor="new_password">Nueva contraseña</label>
        <input
          id="new_password"
          type="password"
          required
          minLength={10}
          autoComplete="new-password"
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
        />
      </div>

      <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
        {isSubmitting ? "Guardando…" : "Cambiar contraseña"}
      </button>
    </form>
  );
}
