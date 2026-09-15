"use client";

import { useEffect, useState } from "react";

import styles from "./via-deal-selections.module.css";

type ViaProperty = { externalId: string; title: string; active: boolean; price?: number | null; currency?: string | null; district?: string | null; previewImageUrl?: string | null };
type ViaCatalog = { items: ViaProperty[]; nextCursor: string | null };
type ViaShare = { id: string; shareUrl: string | null; status: "DRAFT" | "CREATED" | "SENT" | "REVOKED" | "FAILED"; propertyExternalIds: string[]; createdAt: string; sentAt: string | null; revokedAt: string | null };

export function ViaDealSelections({ dealId }: { dealId: string }) {
  const [catalog, setCatalog] = useState<ViaCatalog | null>(null);
  const [shares, setShares] = useState<ViaShare[]>([]);
  const [chosen, setChosen] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      fetch("/api/crm/integrations/via/status", { cache: "no-store", signal: controller.signal }),
      fetch(`/api/crm/deals/${dealId}/via-selections`, { cache: "no-store", signal: controller.signal }),
    ]).then(async ([statusResponse, shareResponse]) => {
      const status = await statusResponse.json() as { enabled?: boolean };
      const sharePayload = await shareResponse.json() as { selections?: ViaShare[]; message?: string };
      if (!statusResponse.ok || !shareResponse.ok) throw new Error(sharePayload.message || "Не удалось загрузить подборки Via.");
      if (!controller.signal.aborted) { setConnected(Boolean(status.enabled)); setShares(sharePayload.selections || []); }
      if (status.enabled) {
        const response = await fetch("/api/crm/integrations/via/properties", { cache: "no-store", signal: controller.signal });
        const payload = await response.json() as ViaCatalog & { message?: string };
        if (!response.ok) throw new Error(payload.message || "Не удалось загрузить каталог Via.");
        if (!controller.signal.aborted) setCatalog(payload);
      }
    }).catch((caught: unknown) => { if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "Via недоступен."); });
    return () => controller.abort();
  }, [dealId]);

  async function loadMore() {
    if (!catalog?.nextCursor) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/crm/integrations/via/properties?cursor=${encodeURIComponent(catalog.nextCursor)}`, { cache: "no-store" });
      const payload = await response.json() as ViaCatalog & { message?: string };
      if (!response.ok) throw new Error(payload.message || "Не удалось загрузить следующую страницу.");
      setCatalog({ items: [...catalog.items, ...payload.items], nextCursor: payload.nextCursor });
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Ошибка каталога Via."); }
    finally { setBusy(false); }
  }

  async function createShare() {
    if (!chosen.length || chosen.length > 10) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/crm/deals/${dealId}/via-selections`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ propertyExternalIds: chosen }) });
      const payload = await response.json() as { selection?: ViaShare; message?: string };
      if (!response.ok || !payload.selection) throw new Error(payload.message || "Не удалось создать подборку Via.");
      setShares((current) => [payload.selection!, ...current]);
      setChosen([]);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Ошибка создания подборки."); }
    finally { setBusy(false); }
  }

  async function updateShare(id: string, action: "sent" | "revoke") {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/crm/deals/${dealId}/via-selections/${id}/${action}`, { method: "POST" });
      const payload = await response.json() as { selection?: ViaShare; message?: string };
      if (!response.ok || !payload.selection) throw new Error(payload.message || "Не удалось обновить подборку.");
      setShares((current) => current.map((share) => share.id === id ? payload.selection! : share));
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Ошибка изменения подборки."); }
    finally { setBusy(false); }
  }

  async function copyLink(share: ViaShare) {
    if (!share.shareUrl) return;
    try { await navigator.clipboard.writeText(share.shareUrl); setNotice("Ссылка скопирована. После отправки клиенту отметьте подборку как предложенную."); }
    catch { setError("Не удалось скопировать ссылку. Откройте её вручную."); }
  }

  return <section className={styles.root}>
    <header><div><h3>Via · подборки для клиента</h3><p>Выберите объекты Via, создайте ссылку и отправьте её клиенту.</p></div><span>{connected ? "Подключено" : "Не подключено"}</span></header>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {notice && <p className={styles.notice} role="status">{notice}</p>}
    {connected && <>
      <div className={styles.catalog}>
        {catalog?.items.filter((item) => item.active).map((item) => <label key={item.externalId} className={styles.property}>
          <input type="checkbox" checked={chosen.includes(item.externalId)} disabled={!chosen.includes(item.externalId) && chosen.length >= 10} onChange={() => setChosen((current) => current.includes(item.externalId) ? current.filter((id) => id !== item.externalId) : [...current, item.externalId])} />
          <span><strong>{item.title}</strong><small>{[item.district, item.price != null ? `${item.price} ${item.currency || ""}`.trim() : null].filter(Boolean).join(" · ")}</small></span>
        </label>)}
        {catalog && !catalog.items.some((item) => item.active) && <p>В Via пока нет доступных объектов.</p>}
        {catalog?.nextCursor && <button type="button" disabled={busy} onClick={() => { void loadMore(); }}>Показать ещё</button>}
      </div>
      <button className={styles.primary} type="button" disabled={busy || !chosen.length} onClick={() => { void createShare(); }}>Создать ссылку на {chosen.length || "выбранные"} объектов</button><small>В одной подборке Via — до 10 объектов.</small>
    </>}
    <div className={styles.shares}><h4>Созданные подборки</h4>{shares.length ? shares.map((share) => <div key={share.id} className={styles.share}>
      <div><strong>{share.propertyExternalIds.length} объектов · {share.status === "SENT" ? "предложено" : share.status === "REVOKED" ? "отозвано" : share.status === "CREATED" ? "ссылка готова" : share.status === "FAILED" ? "ошибка" : "создаётся"}</strong><small>{new Date(share.createdAt).toLocaleString("ru")}</small></div>
      {share.shareUrl && share.status !== "REVOKED" && <div className={styles.actions}><a href={share.shareUrl} target="_blank" rel="noopener noreferrer">Открыть</a><button type="button" onClick={() => { void copyLink(share); }}>Копировать</button>{share.status === "CREATED" && <button type="button" disabled={busy} onClick={() => { void updateShare(share.id, "sent"); }}>Отметить отправленной</button>}<button type="button" disabled={busy} onClick={() => { void updateShare(share.id, "revoke"); }}>Отозвать</button></div>}
    </div>) : <p>Из этой сделки ещё не отправляли подборки Via.</p>}</div>
  </section>;
}
