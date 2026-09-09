"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useCurrentUser } from "@/components/auth/AuthContext";
import { LogoMark } from "@/components/brand/LogoMark";
import { useTasks } from "@/components/tasks/TasksContext";
import styles from "./layout.module.css";

const primaryItems = [
  ["⌂", "Главная", "/home"],
  ["▥", "Воронка", "/"],
  ["◎", "Контакты", "/contacts"],
  ["◇", "Объекты", "/objects"],
  ["✓", "Задачи", "/tasks"],
  ["□", "Календарь", "/calendar"],
];

const secondaryItems = [
  ["↗", "Интеграции", "/integrations"],
  ["♙", "Команда", "/team"],
  ["◫", "Подписка", "/subscription"],
  ["⚙", "Настройки", "/settings"],
];

interface SidebarProps {
  collapsed: boolean;
  mobileOpen: boolean;
  onMobileClose: () => void;
  onToggle: () => void;
}

export function Sidebar({ collapsed, mobileOpen, onMobileClose, onToggle }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const user = useCurrentUser();
  const { tasks } = useTasks();
  const activeTaskCount = tasks.filter((task) => task.period !== "completed").length;
  const roleLabel = user.organization.role === "ADMIN"
    ? "Администратор"
    : user.organization.role === "LEAD"
      ? "Руководитель"
      : "Менеджер";
  const initials = user.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  async function logout() {
    setLoggingOut(true);

    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }

  return (
    <aside className={`${styles.sidebar} ${collapsed ? styles.sidebarCollapsed : ""} ${mobileOpen ? styles.sidebarMobileOpen : ""}`}>
      <div className={styles.brand}>
        <LogoMark className={styles.brandMark} title="Estate CRM" />
        <span>Estate CRM</span>
        <button className={styles.collapseButton} type="button" aria-label={collapsed ? "Развернуть меню" : "Свернуть меню"} onClick={onToggle}>
          {collapsed ? "›" : "‹"}
        </button>
        <button className={styles.mobileCloseButton} type="button" aria-label="Закрыть меню" onClick={onMobileClose}>×</button>
      </div>

      <nav className={styles.navigation} aria-label="Основная навигация">
        <div className={styles.navGroup}>
          {primaryItems.map(([icon, label, href]) => (
            <Link
              className={`${styles.navItem} ${(href === "/" ? pathname === "/" : pathname.startsWith(href)) ? styles.navItemActive : ""}`}
              href={href}
              key={label}
              onClick={onMobileClose}
            >
              <span className={styles.navIcon}>{icon}</span>
              <span>{label}</span>
              {label === "Задачи" && activeTaskCount > 0 && <span className={styles.navBadge}>{activeTaskCount}</span>}
            </Link>
          ))}
        </div>

        <div className={styles.navLabel}>Управление</div>

        <div className={styles.navGroup}>
          {secondaryItems.map(([icon, label, href]) => (
            <Link className={`${styles.navItem} ${href !== "#" && pathname.startsWith(href) ? styles.navItemActive : ""}`} href={href} key={label} onClick={onMobileClose}>
              <span className={styles.navIcon}>{icon}</span>
              <span>{label}</span>
            </Link>
          ))}
        </div>
      </nav>

      <div className={styles.profile}>
        <span className={styles.avatar}>{initials || "—"}</span>
        <span className={styles.profileText}>
          <strong>{user.name}</strong>
          <small>{roleLabel}</small>
        </span>
        <button
          className={styles.profileMore}
          disabled={loggingOut}
          type="button"
          aria-label="Выйти из CRM"
          onClick={() => void logout()}
        >
          {collapsed ? "↪" : "Выйти"}
        </button>
      </div>
    </aside>
  );
}
