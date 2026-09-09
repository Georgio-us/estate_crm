"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { AuthBoundary } from "@/components/auth/AuthBoundary";
import { useCurrentUser } from "@/components/auth/AuthContext";
import { TasksProvider } from "@/components/tasks/TasksContext";
import { Sidebar } from "./Sidebar";
import styles from "./layout.module.css";

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  if (pathname === "/login" || pathname.startsWith("/invite/")) {
    return children;
  }

  return (
    <AuthBoundary><TasksProvider><WorkspaceShell
      pathname={pathname}
      collapsed={isSidebarCollapsed}
      mobileOpen={isMobileMenuOpen}
      onMobileOpen={() => setIsMobileMenuOpen(true)}
      onMobileClose={() => setIsMobileMenuOpen(false)}
      onToggle={() => setIsSidebarCollapsed((current) => !current)}
    >{children}</WorkspaceShell></TasksProvider></AuthBoundary>
  );
}

function WorkspaceShell({ children, pathname, collapsed, mobileOpen, onMobileOpen, onMobileClose, onToggle }: {
  children: ReactNode;
  pathname: string;
  collapsed: boolean;
  mobileOpen: boolean;
  onMobileOpen: () => void;
  onMobileClose: () => void;
  onToggle: () => void;
}) {
  const user = useCurrentUser();
  const forbidden = (pathname.startsWith("/team") && user.organization.role === "MANAGER")
    || ((pathname.startsWith("/settings") || pathname.startsWith("/subscription")) && user.organization.role !== "ADMIN");

  return <div className={`${styles.shell} ${collapsed ? styles.shellCollapsed : ""}`}>
      <button
        className={styles.mobileMenuButton}
        type="button"
        aria-label="Открыть меню"
        aria-expanded={mobileOpen}
        onClick={onMobileOpen}
      >
        <span aria-hidden="true">☰</span>
      </button>
      {mobileOpen && (
        <button
          className={styles.mobileBackdrop}
          type="button"
          aria-label="Закрыть меню"
          onClick={onMobileClose}
        />
      )}
      <Sidebar
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        onMobileClose={onMobileClose}
        onToggle={onToggle}
      />
      <main className={styles.main}>{forbidden ? <section className={styles.accessDenied}><span>Доступ ограничен</span><h1>Этот раздел управляется администратором</h1><p>Ваша роль не предусматривает доступ к этой части CRM. Рабочие сделки, контакты и задачи доступны в основном меню.</p><Link href="/home">Вернуться на главную →</Link></section> : children}</main>
    </div>;
}
