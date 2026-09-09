"use client";

import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { AuthBoundary } from "@/components/auth/AuthBoundary";
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
    <AuthBoundary><TasksProvider><div className={`${styles.shell} ${isSidebarCollapsed ? styles.shellCollapsed : ""}`}>
      <button
        className={styles.mobileMenuButton}
        type="button"
        aria-label="Открыть меню"
        aria-expanded={isMobileMenuOpen}
        onClick={() => setIsMobileMenuOpen(true)}
      >
        <span aria-hidden="true">☰</span>
      </button>
      {isMobileMenuOpen && (
        <button
          className={styles.mobileBackdrop}
          type="button"
          aria-label="Закрыть меню"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}
      <Sidebar
        collapsed={isSidebarCollapsed}
        mobileOpen={isMobileMenuOpen}
        onMobileClose={() => setIsMobileMenuOpen(false)}
        onToggle={() => setIsSidebarCollapsed((current) => !current)}
      />
      <main className={styles.main}>{children}</main>
    </div></TasksProvider></AuthBoundary>
  );
}
