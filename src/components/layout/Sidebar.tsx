"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./layout.module.css";

const primaryItems = [
  ["⌂", "Главная", "#"],
  ["▥", "Воронка", "/"],
  ["◎", "Контакты", "/contacts"],
  ["◇", "Объекты", "/objects"],
  ["✓", "Задачи", "/tasks"],
  ["□", "Календарь", "/calendar"],
];

const secondaryItems = [
  ["↗", "Интеграции", "#"],
  ["♙", "Команда", "#"],
  ["◫", "Подписка", "#"],
  ["⚙", "Настройки", "#"],
];

interface SidebarProps {
  collapsed: boolean;
  mobileOpen: boolean;
  onMobileClose: () => void;
  onToggle: () => void;
}

export function Sidebar({ collapsed, mobileOpen, onMobileClose, onToggle }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside className={`${styles.sidebar} ${collapsed ? styles.sidebarCollapsed : ""} ${mobileOpen ? styles.sidebarMobileOpen : ""}`}>
      <div className={styles.brand}>
        <span className={styles.brandMark}>E</span>
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
              {label === "Задачи" && <span className={styles.navBadge}>6</span>}
            </Link>
          ))}
        </div>

        <div className={styles.navLabel}>Управление</div>

        <div className={styles.navGroup}>
          {secondaryItems.map(([icon, label, href]) => (
            <Link className={styles.navItem} href={href} key={label} onClick={onMobileClose}>
              <span className={styles.navIcon}>{icon}</span>
              <span>{label}</span>
            </Link>
          ))}
        </div>
      </nav>

      <div className={styles.profile}>
        <span className={styles.avatar}>ГП</span>
        <span className={styles.profileText}>
          <strong>Георгий</strong>
          <small>Администратор</small>
        </span>
        <span className={styles.profileMore}>•••</span>
      </div>
    </aside>
  );
}
