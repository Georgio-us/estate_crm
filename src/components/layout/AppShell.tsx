"use client";

import { useState, type ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import styles from "./layout.module.css";

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  return (
    <div className={`${styles.shell} ${isSidebarCollapsed ? styles.shellCollapsed : ""}`}>
      <Sidebar collapsed={isSidebarCollapsed} onToggle={() => setIsSidebarCollapsed((current) => !current)} />
      <main className={styles.main}>{children}</main>
    </div>
  );
}
