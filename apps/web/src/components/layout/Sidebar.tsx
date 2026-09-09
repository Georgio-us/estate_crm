"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
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
  ["≡", "Документация", "/documentation"],
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
  const profileRef = useRef<HTMLDivElement>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const user = useCurrentUser();
  const { tasks } = useTasks();
  const activeTaskCount = tasks.filter((task) => task.period !== "completed").length;
  const roleLabel = user.organization.role === "ADMIN"
    ? "Администратор"
    : user.organization.role === "LEAD"
      ? "Руководитель"
      : "Менеджер";
  const visibleSecondaryItems = secondaryItems.filter(([, label]) => {
    if (label === "Команда" && user.organization.role === "MANAGER") return false;
    if ((label === "Подписка" || label === "Настройки") && user.organization.role !== "ADMIN") return false;
    return true;
  });
  const initials = user.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  useEffect(() => {
    if (!profileOpen) return;
    function closeProfile(event: PointerEvent) {
      if (!profileRef.current?.contains(event.target as Node)) setProfileOpen(false);
    }
    document.addEventListener("pointerdown", closeProfile);
    return () => document.removeEventListener("pointerdown", closeProfile);
  }, [profileOpen]);

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
          {visibleSecondaryItems.map(([icon, label, href]) => (
            <Link className={`${styles.navItem} ${href !== "#" && pathname.startsWith(href) ? styles.navItemActive : ""}`} href={href} key={label} onClick={onMobileClose}>
              <span className={styles.navIcon}>{icon}</span>
              <span>{label}</span>
            </Link>
          ))}
        </div>
      </nav>

      <div className={styles.profile} ref={profileRef}>
        <button
          className={styles.profileMore}
          disabled={loggingOut}
          type="button"
          aria-label="Открыть меню аккаунта"
          aria-expanded={profileOpen}
          onClick={() => setProfileOpen((current) => !current)}
        >
          <span className={styles.avatar}>{initials || "—"}</span>
          <span className={styles.profileText}>
            <strong>{user.name}</strong>
            <small>{roleLabel}</small>
          </span>
          <span className={styles.profileChevron} aria-hidden="true">⌃</span>
        </button>
        {profileOpen && <div className={styles.profileMenu}>
          <div><strong>{user.name}</strong><small>{user.email}</small></div>
          <button type="button" disabled={loggingOut} onClick={() => void logout()}>Сменить аккаунт</button>
          <button type="button" disabled={loggingOut} onClick={() => void logout()}>Выйти</button>
        </div>}
      </div>
    </aside>
  );
}
