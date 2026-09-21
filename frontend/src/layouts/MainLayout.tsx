import { Outlet } from "react-router-dom";

import { Navbar } from "../components/Navbar";
import styles from "./MainLayout.module.css";

export function MainLayout() {
  return (
    <>
      <Navbar />
      <main className={`container ${styles.main}`}>
        <Outlet />
      </main>
      <footer className={styles.footer}>
        <div className={`container ${styles.footerContent}`}>
          <img src="/logo.jpg" alt="Universo 34 Logo" className={styles.footerLogo} />
          <p>Universo 34 — Rule 34 · Sin Límites</p>
        </div>
      </footer>
    </>
  );
}
