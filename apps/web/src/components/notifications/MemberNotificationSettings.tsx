"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useCurrentUser } from "@/components/auth/AuthContext";
import styles from "./member-notifications.module.css";

export type NotificationMember = { id: string; name: string; role: "ADMIN" | "LEAD" | "MANAGER" };
type TelegramAudience = "ALL" | "OWN" | "SELECTED" | "NONE";
type TelegramPreferences = {
  connected: boolean;
  role: NotificationMember["role"];
  audience: TelegramAudience;
  leadNotifications: boolean;
  taskReminderNotifications: boolean;
  taskOverdueNotifications: boolean;
  selectedUserIds: string[];
  members: NotificationMember[];
};

const roleLabels: Record<NotificationMember["role"], string> = { ADMIN: "Администратор", LEAD: "Руководитель", MANAGER: "Менеджер" };

export function MemberNotificationSettings({ member }: { member: NotificationMember }) {
  const currentUser = useCurrentUser();
  const [saved, setSaved] = useState<TelegramPreferences | null>(null);
  const [draft, setDraft] = useState<TelegramPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");
  const currentRole = currentUser.organization.role;
  const canManage = currentUser.id === member.id || currentRole === "ADMIN" || (currentRole === "LEAD" && member.role !== "ADMIN");

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/crm/team/${member.id}/notifications`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as TelegramPreferences & { message?: string };
        if (!response.ok) throw new Error(payload.message || "Не удалось загрузить настройки уведомлений.");
        setSaved(payload);
        setDraft(payload);
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted) setFeedback(caught instanceof Error ? caught.message : "Не удалось загрузить настройки уведомлений.");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [member.id]);

  async function save() {
    if (!draft) return;
    setSaving(true);
    setFeedback("");
    try {
      const response = await fetch(`/api/crm/team/${member.id}/notifications`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ audience: draft.audience, leadNotifications: draft.leadNotifications, taskReminderNotifications: draft.taskReminderNotifications, taskOverdueNotifications: draft.taskOverdueNotifications, selectedUserIds: draft.selectedUserIds }),
      });
      const payload = await response.json() as TelegramPreferences & { message?: string };
      if (!response.ok) throw new Error(payload.message || "Не удалось сохранить уведомления.");
      setSaved(payload);
      setDraft(payload);
      setFeedback("Настройки уведомлений сохранены.");
    } catch (caught) {
      setFeedback(caught instanceof Error ? caught.message : "Не удалось сохранить уведомления.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <section className={styles.panel}><h3>Telegram-уведомления</h3><p>Загружаем настройки…</p></section>;
  if (!draft) return <section className={styles.panel}><h3>Telegram-уведомления</h3><p>{feedback}</p></section>;
  if (!draft.connected) return <section className={styles.panel}><header><div><h3>Telegram-уведомления</h3><p>Сотрудник ещё не связал свой Telegram с CRM.</p></div><span className={styles.disconnected}>Не подключён</span></header>{member.id === currentUser.id ? <Link href="/integrations">Подключить Telegram →</Link> : <p>Попросите сотрудника войти под своим аккаунтом и подключить бота в разделе «Интеграции».</p>}</section>;

  const manager = draft.role === "MANAGER";
  const changed = JSON.stringify(draft) !== JSON.stringify(saved);
  return <section className={styles.panel}>
    <header><div><h3>Telegram-уведомления</h3><p>Что бот отправляет этому сотруднику и по чьей работе.</p></div><span className={styles.connected}>Подключён</span></header>
    <label className={styles.scope}><span>Охват событий</span><select disabled={!canManage} value={draft.audience} onChange={(event) => setDraft({ ...draft, audience: event.target.value as TelegramAudience, selectedUserIds: event.target.value === "SELECTED" ? draft.selectedUserIds : [] })}>{!manager && <option value="ALL">Вся команда</option>}<option value="OWN">Только свои</option>{!manager && <option value="SELECTED">Выбранные сотрудники</option>}<option value="NONE">Не присылать</option></select></label>
    {draft.audience === "SELECTED" && <div className={styles.members}>{draft.members.map((item) => <label key={item.id}><input disabled={!canManage} type="checkbox" checked={draft.selectedUserIds.includes(item.id)} onChange={(event) => setDraft({ ...draft, selectedUserIds: event.target.checked ? [...draft.selectedUserIds, item.id] : draft.selectedUserIds.filter((id) => id !== item.id) })} /><span><strong>{item.name}</strong><small>{roleLabels[item.role]}</small></span></label>)}</div>}
    <div className={styles.kinds}><NotificationToggle disabled={!canManage} label="Назначение и срок задачи" description="Сразу при назначении и за 30 минут до срока" checked={draft.taskReminderNotifications} onChange={(checked) => setDraft({ ...draft, taskReminderNotifications: checked })} /><NotificationToggle disabled={!canManage} label="Новые лиды" description="Короткое сообщение с номером сделки" checked={draft.leadNotifications} onChange={(checked) => setDraft({ ...draft, leadNotifications: checked })} /><NotificationToggle disabled={!canManage} label="Просроченные задачи" description="Отдельный сигнал после наступления срока" checked={draft.taskOverdueNotifications} onChange={(checked) => setDraft({ ...draft, taskOverdueNotifications: checked })} /></div>
    {canManage && <button className={styles.save} type="button" disabled={saving || !changed || (draft.audience === "SELECTED" && !draft.selectedUserIds.length)} onClick={() => { void save(); }}>{saving ? "Сохраняем…" : "Сохранить уведомления"}</button>}
    {feedback && <p className={styles.feedback}>{feedback}</p>}
  </section>;
}

function NotificationToggle({ label, description, checked, disabled, onChange }: { label: string; description: string; checked: boolean; disabled: boolean; onChange: (checked: boolean) => void }) {
  return <label><span><strong>{label}</strong><small>{description}</small></span><input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} /></label>;
}
