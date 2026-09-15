"use client";

import { useCallback, useEffect, useState } from "react";

import { useCurrentUser } from "@/components/auth/AuthContext";

import styles from "./integrations.module.css";

type ViaStatus = { connected: boolean; enabled: boolean; viaTenant: string | null; lastEventAt: string | null };
type PairingIssue = { pairingCode: string; expiresAt: string; viaTenant: string };

export function ViaConnectionPanel({ onUpdated }: { onUpdated: () => Promise<void> }) {
  const user = useCurrentUser();
  const [status, setStatus] = useState<ViaStatus | null>(null);
  const [pairing, setPairing] = useState<PairingIssue | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [successOpen, setSuccessOpen] = useState(false);
  const admin = user.organization.role === "ADMIN";

  const refresh = useCallback(async (announceConnection = false) => {
    const response = await fetch("/api/crm/integrations/via/status", { cache: "no-store" });
    const payload = await response.json() as ViaStatus & { message?: string };
    if (!response.ok) throw new Error(payload.message || "Не удалось загрузить состояние Via.");
    setStatus(payload);
    if (announceConnection) {
      if (payload.connected) {
        setPairing(null);
        setFeedback("");
        setSuccessOpen(true);
      } else {
        setFeedback("Via ещё не подтвердил подключение. Подтвердите код в Via и проверьте снова.");
      }
    }
    await onUpdated();
    return payload;
  }, [onUpdated]);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/crm/integrations/via/status", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as ViaStatus & { message?: string };
        if (!response.ok) throw new Error(payload.message || "Не удалось загрузить состояние Via.");
        return payload;
      })
      .then((payload) => { if (!controller.signal.aborted) setStatus(payload); })
      .catch((error: unknown) => { if (!controller.signal.aborted) setFeedback(error instanceof Error ? error.message : "Via недоступен."); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!successOpen) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setSuccessOpen(false);
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [successOpen]);

  async function issuePairing() {
    setBusy(true); setFeedback(""); setPairing(null);
    try {
      const response = await fetch("/api/crm/integrations/via/pairing/issue", { method: "POST" });
      const payload = await response.json() as PairingIssue & { message?: string };
      if (!response.ok || !payload.pairingCode) throw new Error(payload.message || "Не удалось создать код подключения.");
      setPairing(payload);
      setFeedback("Откройте экран интеграции в Via и подтвердите этот одноразовый код. API-ключи передавать вручную не нужно.");
    } catch (error) { setFeedback(error instanceof Error ? error.message : "Ошибка подключения Via."); }
    finally { setBusy(false); }
  }

  async function changeEnabled(enabled: boolean) {
    setBusy(true); setFeedback("");
    try {
      const response = await fetch(`/api/crm/integrations/via/${enabled ? "enable" : "disable"}`, { method: "POST" });
      const payload = await response.json() as { message?: string };
      if (!response.ok) throw new Error(payload.message || "Не удалось изменить состояние интеграции.");
      await refresh();
      setFeedback(enabled ? "Интеграция Via включена." : "Интеграция Via отключена. Ранее созданные подборки не удалены.");
    } catch (error) { setFeedback(error instanceof Error ? error.message : "Ошибка настройки Via."); }
    finally { setBusy(false); }
  }

  async function verifyPairing() {
    setBusy(true); setFeedback("");
    try { await refresh(true); }
    catch (error) { setFeedback(error instanceof Error ? error.message : "Не удалось обновить состояние."); }
    finally { setBusy(false); }
  }

  return <>
    <section className={styles.installInfo}>
      <h3>{status?.connected ? status.enabled ? "Via подключён" : "Via подключён, но выключен" : "Подключить Via"}</h3>
      <p>CRM остаётся центром сделки, а Via показывает подборки клиенту в Telegram Mini App. Каталог Via не копируется автоматически в CRM.</p>
      <div>
        <span>{status?.viaTenant ? `Организация Via: ${status.viaTenant}` : "Связь с Via ещё не установлена"}</span>
        {status?.lastEventAt && <span>Последнее событие: {new Date(status.lastEventAt).toLocaleString("ru")}</span>}
        {!admin && <span>Подключением управляет администратор CRM.</span>}
        {admin && (!status?.connected || pairing) && <button className={styles.panelPrimary} type="button" disabled={busy} onClick={() => { void issuePairing(); }}>{busy ? "Создаём код…" : pairing ? "Новый код" : "Создать код подключения"}</button>}
        {admin && status?.connected && <button className={styles.panelPrimary} type="button" disabled={busy} onClick={() => { void changeEnabled(!status.enabled); }}>{busy ? "Сохраняем…" : status.enabled ? "Отключить интеграцию" : "Включить интеграцию"}</button>}
        {pairing && <div className={styles.credentials}><label><span>Одноразовый код Via</span><input readOnly value={pairing.pairingCode} onFocus={(event) => event.currentTarget.select()} /></label><small>Действует до {new Date(pairing.expiresAt).toLocaleTimeString("ru")}. После подтверждения в Via обновите состояние.</small><button type="button" disabled={busy} onClick={() => { void verifyPairing(); }}>{busy ? "Проверяем…" : "Проверить подключение"}</button></div>}
        {feedback && <small role="status">{feedback}</small>}
      </div>
    </section>

    {successOpen && <div className={styles.successLayer}>
      <button className={styles.successBackdrop} type="button" aria-label="Закрыть подтверждение" onClick={() => setSuccessOpen(false)} />
      <section className={styles.successModal} role="dialog" aria-modal="true" aria-labelledby="via-success-title">
        <span className={styles.successIcon} aria-hidden="true">✓</span>
        <span className={styles.eyebrow}>Интеграция подключена</span>
        <h2 id="via-success-title">Via готов к работе</h2>
        <p>Теперь менеджеры могут создавать подборки объектов Via прямо из карточки сделки и отправлять клиентам ссылку на Telegram Mini App.</p>
        <button className={styles.panelPrimary} type="button" autoFocus onClick={() => setSuccessOpen(false)}>Продолжить</button>
      </section>
    </div>}
  </>;
}
