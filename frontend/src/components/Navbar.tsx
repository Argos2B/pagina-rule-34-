import { useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";

import { useAuth } from "../auth/useAuth";
import { isAdminOrAbove } from "../utils/roles";
import { Avatar } from "./Avatar";
import { SearchBar } from "./SearchBar";
import styles from "./Navbar.module.css";

export function Navbar() {
  const { user, isAuthenticated, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    setMenuOpen(false);
    navigate("/");
  }

  return (
    <header className={styles.header}>
      <div className={`container ${styles.bar}`}>
        <Link to="/" className={styles.brand}>
          <img src="/logo.jpg" alt="Universo 34 Logo" className={styles.brandLogo} />
          <span className={styles.brandText}>
            UNIVERSO <span className={styles.brandAccent}>34</span>
          </span>
        </Link>

        <SearchBar />

        <button
          type="button"
          className={styles.menuToggle}
          aria-expanded={menuOpen}
          aria-controls="primary-nav"
          onClick={() => setMenuOpen((open) => !open)}
        >
          Menú
        </button>

        <nav id="primary-nav" className={`${styles.nav} ${menuOpen ? styles.navOpen : ""}`}>
          <NavLink to="/" end className={styles.link} onClick={() => setMenuOpen(false)}>
            Explorar
          </NavLink>
          <NavLink to="/tags" className={styles.link} onClick={() => setMenuOpen(false)}>
            Etiquetas
          </NavLink>

          {isAuthenticated && (
            <>
              <NavLink to="/favorites" className={styles.link} onClick={() => setMenuOpen(false)}>
                Favoritos
              </NavLink>
              <NavLink to="/upload" className={styles.link} onClick={() => setMenuOpen(false)}>
                Subir
              </NavLink>
              <NavLink to="/reports" className={styles.link} onClick={() => setMenuOpen(false)}>
                Mis reportes
              </NavLink>
            </>
          )}

          {isAuthenticated && isAdminOrAbove(user?.role) && (
            <NavLink to="/admin" className={styles.link} onClick={() => setMenuOpen(false)}>
              Administración
            </NavLink>
          )}

          {isAuthenticated && user ? (
            <div className={styles.userMenu}>
              <Link to={`/profile/${user.username}`} className={styles.userLink} onClick={() => setMenuOpen(false)}>
                <Avatar username={user.username} avatarUrl={user.avatar} size="sm" />
                <span>{user.username}</span>
              </Link>
              <Link to="/settings" className={styles.link} onClick={() => setMenuOpen(false)}>
                Configuración
              </Link>
              <button type="button" className={styles.logoutButton} onClick={handleLogout}>
                Cerrar sesión
              </button>
            </div>
          ) : (
            <div className={styles.authLinks}>
              <Link to="/login" className={styles.link} onClick={() => setMenuOpen(false)}>
                Iniciar sesión
              </Link>
              <Link to="/register" className="btn btn-primary" onClick={() => setMenuOpen(false)}>
                Registrarse
              </Link>
            </div>
          )}
        </nav>
      </div>
    </header>
  );
}
