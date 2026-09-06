"use client";

import { useState, type ReactNode } from "react";
import { TasksProvider } from "@/components/tasks/TasksContext";
import { Sidebar } from "./Sidebar";
import styles from "./layout.module.css";

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <TasksProvider><div className={`${styles.shell} ${isSidebarCollapsed ? styles.shellCollapsed : ""}`}>
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
    </div></TasksProvider>
  );
}
