"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { demoProjects, demoSecondaryProperties } from "@/components/properties/demoCatalog";
import type { Deal } from "@/types/crm";
import styles from "./deal-drawer.module.css";

interface SelectionRecord {
  id: string; propertyId: string | null; catalogKey: string; status: "CANDIDATE" | "OFFERED";
  title: string; subtitle: string | null; priceLabel: string | null; imageUrl: string | null;
}
interface ApiProperty {
  id: string; title: string; address: string | null; district: string | null;
  category: "APARTMENT" | "HOUSE" | "LAND" | "COMMERCIAL"; market: "PRIMARY" | "SECONDARY";
  operation: "SALE" | "RENT"; status: "AVAILABLE" | "RESERVED" | "SOLD"; price: number | null;
  currency: "USD" | "EUR" | "UAH"; rooms: string | null; area: number | null; floor: number | null;
  totalFloors: number | null; landArea: number | null; imageUrl: string | null;
}
interface ViaProperty {
  externalId: string; title: string; active: boolean; price?: number | null; currency?: string | null;
  district?: string | null; propertyType?: string | null; rooms?: string | null; areaM2?: number | null; previewImageUrl?: string | null;
}
interface CatalogCandidate {
  key: string; propertyId?: string; title: string; subtitle: string; priceLabel: string; imageUrl: string | null;
  market: "Первичный" | "Вторичный"; category: string; district: string; rooms?: string; operation: string; source: "CRM" | "Via" | "Демо";
}
interface PropertySelectionShareRecord {
  id: string; status: "CREATED" | "SENT" | "OPENED" | "REVOKED" | "EXPIRED"; publicPath: string;
  expiresAt: string; sentAt: string | null; openedAt: string | null; revokedAt: string | null;
  viewCount: number; createdAt: string; items: Array<{ id: string; propertySelectionId: string | null; title: string; priceLabel: string | null }>;
}

const categoryLabels = { APARTMENT: "Квартира", HOUSE: "Дом", LAND: "Участок", COMMERCIAL: "Коммерция" } as const;
const shareStatusLabels: Record<PropertySelectionShareRecord["status"], string> = { CREATED: "Ссылка готова", SENT: "Ссылка готова", OPENED: "Клиент открыл", REVOKED: "Отозвана", EXPIRED: "Истекла" };

export function DealPropertySelectionPanel({ deal, onClose, onCountChange, onActivityChanged }: { deal: Deal; onClose: () => void; onCountChange: (count: number) => void; onActivityChanged: () => Promise<void> }) {
  const [selections, setSelections] = useState<SelectionRecord[]>([]);
  const [shares, setShares] = useState<PropertySelectionShareRecord[]>([]);
  const [properties, setProperties] = useState<ApiProperty[]>([]);
  const [viaProperties, setViaProperties] = useState<ViaProperty[]>([]);
  const [viaEnabled, setViaEnabled] = useState(false);
  const [viaState, setViaState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [browse, setBrowse] = useState(false);
  const [tab, setTab] = useState<"selection" | "history">("selection");
  const [market, setMarket] = useState<"all" | "Первичный" | "Вторичный">(deal.marketPreference === "Новостройка" ? "Первичный" : deal.marketPreference === "Вторичная" ? "Вторичный" : "all");
  const [source, setSource] = useState<"all" | "CRM" | "Via">("all");
  const [search, setSearch] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    await Promise.resolve(); setLoadState("loading"); setError("");
    try {
      const [selectionResponse, propertyResponse, shareResponse, viaStatusResponse] = await Promise.all([
        fetch(`/api/crm/deals/${deal.id}/property-selections`, { cache: "no-store" }), fetch("/api/crm/properties", { cache: "no-store" }),
        fetch(`/api/crm/deals/${deal.id}/property-shares`, { cache: "no-store" }), fetch("/api/crm/integrations/via/status", { cache: "no-store" }),
      ]);
      const selectionPayload = await selectionResponse.json() as { selections?: SelectionRecord[]; message?: string };
      const propertyPayload = await propertyResponse.json() as { properties?: ApiProperty[] };
      const sharePayload = await shareResponse.json() as { shares?: PropertySelectionShareRecord[]; message?: string };
      const viaStatus = await viaStatusResponse.json() as { enabled?: boolean };
      if (!selectionResponse.ok || !selectionPayload.selections) throw new Error(selectionPayload.message || "Не удалось загрузить подборку.");
      if (!shareResponse.ok || !sharePayload.shares) throw new Error(sharePayload.message || "Не удалось загрузить ссылки.");
      setSelections(selectionPayload.selections); setShares(sharePayload.shares);
      setProperties(propertyResponse.ok && propertyPayload.properties ? propertyPayload.properties : []);
      setViaEnabled(Boolean(viaStatusResponse.ok && viaStatus.enabled)); setViaState(viaStatusResponse.ok && viaStatus.enabled ? "idle" : "ready");
      onCountChange(selectionPayload.selections.filter((item) => item.status === "CANDIDATE").length); setLoadState("ready");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось загрузить подборку."); setLoadState("error"); }
  }, [deal.id, onCountChange]);

  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);

  const loadVia = useCallback(async () => {
    if (!viaEnabled || viaState !== "idle") return;
    setViaState("loading");
    try {
      const response = await fetch("/api/crm/integrations/via/properties", { cache: "no-store" });
      const payload = await response.json() as { items?: ViaProperty[] };
      if (!response.ok || !payload.items) throw new Error("Не удалось загрузить каталог Via.");
      setViaProperties(payload.items); setViaState("ready");
    } catch { setViaState("error"); }
  }, [viaEnabled, viaState]);

  useEffect(() => {
    if (loadState !== "ready" || !viaEnabled || viaState !== "idle") return;
    const timer = window.setTimeout(() => { void loadVia(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadState, loadVia, viaEnabled, viaState]);
  useEffect(() => { if (!notice) return; const timer = window.setTimeout(() => setNotice(""), 2200); return () => window.clearTimeout(timer); }, [notice]);

  const catalog = useMemo<CatalogCandidate[]>(() => {
    const demoUnits = demoProjects.flatMap((project) => project.units.filter((unit) => unit.status === "Доступен").map((unit) => ({
      key: `unit:${unit.id}`, title: `${project.title} · ${unit.name}`, subtitle: `${project.developer} · ${project.district} · ${unit.area} м²`, priceLabel: formatPrice(unit.price, unit.currency), imageUrl: project.imageUrl,
      market: "Первичный" as const, category: "Квартира", district: project.district, rooms: String(unit.rooms), operation: "Продажа", source: "Демо" as const,
    })));
    const demoSecondary = demoSecondaryProperties.filter((item) => item.status === "Доступен").map((item) => ({
      key: `demo-property:${item.id}`, title: item.title, subtitle: `${item.address} · ${item.area} м²`, priceLabel: formatPrice(item.price, item.currency), imageUrl: item.imageUrl,
      market: "Вторичный" as const, category: item.category, district: item.district, rooms: item.rooms, operation: "Продажа", source: "Демо" as const,
    }));
    const realProperties = properties.filter((item) => item.status === "AVAILABLE").map((item) => ({
      key: `property:${item.id}`, propertyId: item.id, title: item.title, subtitle: [
        item.address || "Адрес не указан", item.rooms ? `${item.rooms} комн.` : null, item.area ? `${item.area} м²` : null,
        item.category === "HOUSE" && item.totalFloors ? `${item.totalFloors} эт.` : item.floor ? `${item.floor}${item.totalFloors ? `/${item.totalFloors}` : ""} эт.` : null,
        item.landArea ? `${item.landArea} сот.` : null,
      ].filter(Boolean).join(" · "),
      priceLabel: formatPrice(item.price, item.currency), imageUrl: item.imageUrl, market: item.market === "PRIMARY" ? "Первичный" as const : "Вторичный" as const,
      category: categoryLabels[item.category], district: item.district || "", rooms: item.rooms || undefined, operation: item.operation === "SALE" ? "Продажа" : "Аренда", source: "CRM" as const,
    }));
    const via = viaProperties.filter((item) => item.active).map((item) => ({
      key: `via:${item.externalId}`, title: item.title, subtitle: [item.district, item.rooms ? `${item.rooms} комн.` : null, item.areaM2 ? `${item.areaM2} м²` : null].filter(Boolean).join(" · ") || "Объект из каталога Via",
      priceLabel: item.price == null ? "Цена не указана" : formatPrice(item.price, normalizeCurrency(item.currency)), imageUrl: item.previewImageUrl || null,
      market: "Вторичный" as const, category: viaCategory(item.propertyType), district: item.district || "", rooms: item.rooms || undefined, operation: "Продажа", source: "Via" as const,
    }));
    return realProperties.length || via.length ? [...realProperties, ...via] : [...demoUnits, ...demoSecondary];
  }, [properties, viaProperties]);

  const visibleCatalog = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("ru");
    return catalog.filter((item) => (source === "all" || item.source === source) && (market === "all" || item.market === market) && (!query || `${item.title} ${item.subtitle} ${item.category} ${item.operation}`.toLocaleLowerCase("ru").includes(query)));
  }, [catalog, market, search, source]);

  const candidateSelections = selections.filter((item) => item.status === "CANDIDATE");
  const legacyOffered = selections.filter((item) => item.status === "OFFERED");
  const selectedKeys = new Set(candidateSelections.map((item) => item.catalogKey));
  const candidateIds = new Set(candidateSelections.map((item) => item.id));
  const readyShare = shares.find((item) => !(["REVOKED", "EXPIRED"] as string[]).includes(item.status) && item.items.length === candidateIds.size && item.items.every((shareItem) => shareItem.propertySelectionId && candidateIds.has(shareItem.propertySelectionId)));

  async function add(candidate: CatalogCandidate) {
    setBusyKey(candidate.key); setError("");
    try {
      const response = await fetch(`/api/crm/deals/${deal.id}/property-selections`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ propertyId: candidate.propertyId || null, catalogKey: candidate.key, title: candidate.title, subtitle: candidate.subtitle, priceLabel: candidate.priceLabel, imageUrl: candidate.imageUrl }) });
      const payload = await response.json() as { selection?: SelectionRecord; message?: string };
      if (!response.ok || !payload.selection) throw new Error(payload.message || "Не удалось добавить объект.");
      const next = [payload.selection, ...selections.filter((item) => item.id !== payload.selection!.id)]; setSelections(next);
      onCountChange(next.filter((item) => item.status === "CANDIDATE").length); await onActivityChanged();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось добавить объект."); } finally { setBusyKey(null); }
  }

  async function remove(selection: SelectionRecord) {
    setBusyKey(selection.id); setError("");
    try {
      const response = await fetch(`/api/crm/deals/${deal.id}/property-selections/${selection.id}`, { method: "DELETE" });
      const payload = await response.json() as { ok?: boolean; message?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.message || "Не удалось удалить объект.");
      const next = selections.filter((item) => item.id !== selection.id); setSelections(next); onCountChange(next.filter((item) => item.status === "CANDIDATE").length); await onActivityChanged();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось удалить объект."); } finally { setBusyKey(null); }
  }

  async function createShare() {
    if (!candidateSelections.length) return;
    setBusyKey("create-share"); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/crm/deals/${deal.id}/property-shares`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ selectionIds: candidateSelections.map((item) => item.id) }) });
      const payload = await response.json() as { share?: PropertySelectionShareRecord; message?: string };
      if (!response.ok || !payload.share) throw new Error(payload.message || "Не удалось создать ссылку.");
      setShares((current) => [payload.share!, ...current.filter((item) => item.id !== payload.share!.id)]); setNotice("Ссылка создана."); await onActivityChanged();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось создать ссылку."); } finally { setBusyKey(null); }
  }

  function absoluteShareUrl(share: PropertySelectionShareRecord) { return new URL(share.publicPath, window.location.origin).toString(); }
  async function copyShare(share: PropertySelectionShareRecord) {
    try { await navigator.clipboard.writeText(absoluteShareUrl(share)); setNotice("Ссылка скопирована."); }
    catch { setError("Не удалось скопировать ссылку. Откройте её и скопируйте адрес вручную."); }
  }
  return <div className={styles.selectionLayer}>
    <button className={styles.selectionBackdrop} type="button" onClick={onClose} aria-label="Закрыть подборку" />
    <aside className={styles.selectionDrawer} role="dialog" aria-modal="true" aria-label="Подборка объектов">
      <header className={styles.selectionHeader}><div><span>Сделка #{deal.number}</span><h2>{browse ? "Добавить объекты" : "Подборка"}</h2><p>{deal.contactName}</p></div><button type="button" onClick={onClose} aria-label="Закрыть">×</button></header>
      {loadState === "loading" ? <div className={styles.selectionState}>Загружаем подборку…</div> : loadState === "error" ? <div className={styles.selectionState}><p>{error}</p><button type="button" onClick={() => { void load(); }}>Повторить</button></div> : browse ? <>
        <div className={styles.catalogPickerToolbar}><button type="button" onClick={() => setBrowse(false)}>← К подборке</button><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Объект, адрес или ЖК" /><select value={market} onChange={(event) => setMarket(event.target.value as typeof market)}><option value="all">Весь рынок</option><option value="Первичный">Новостройки</option><option value="Вторичный">Вторичная</option></select></div>
        <div className={styles.catalogSourceTabs}><button className={source === "all" ? styles.catalogSourceActive : ""} type="button" onClick={() => setSource("all")}>Все</button><button className={source === "CRM" ? styles.catalogSourceActive : ""} type="button" onClick={() => setSource("CRM")}>База CRM</button>{viaEnabled && <button className={source === "Via" ? styles.catalogSourceActive : ""} type="button" onClick={() => setSource("Via")}>Via</button>}</div>
        {viaState === "loading" && (source === "all" || source === "Via") && <p className={styles.catalogLoading}>Загружаем объекты Via…</p>}
        {viaState === "error" && source === "Via" && <div className={styles.selectionState}><p>Каталог Via временно не загрузился.</p><button type="button" onClick={() => setViaState("idle")}>Повторить</button></div>}
        {!(viaState === "error" && source === "Via") && <div className={styles.selectionCatalog}>{visibleCatalog.map((candidate) => <article className={styles.selectionCatalogCard} key={candidate.key}><span className={!candidate.imageUrl ? styles.selectionImagePlaceholder : ""} style={candidate.imageUrl ? { backgroundImage: `url("${candidate.imageUrl}")` } : undefined}>{!candidate.imageUrl && "Фото позже"}</span><div><small>{candidate.source} · {candidate.market} · {candidate.category} · {candidate.operation}</small><strong>{candidate.title}</strong><p>{candidate.subtitle}</p><b>{candidate.priceLabel}</b></div><button type="button" disabled={selectedKeys.has(candidate.key) || busyKey === candidate.key} onClick={() => { void add(candidate); }}>{selectedKeys.has(candidate.key) ? "Добавлен" : busyKey === candidate.key ? "…" : "Добавить"}</button></article>)}</div>}
        {!visibleCatalog.length && viaState !== "loading" && !(viaState === "error" && source === "Via") && <div className={styles.selectionState}><p>В этом источнике объектов пока нет.</p></div>}
        <div className={styles.selectionStickyBar}><span>В подборке: {candidateSelections.length}</span><button type="button" onClick={() => setBrowse(false)}>Готово</button></div>
      </> : <>
        <div className={styles.selectionTabs}><button className={tab === "selection" ? styles.selectionTabActive : ""} type="button" onClick={() => setTab("selection")}>Подборка <span>{candidateSelections.length}</span></button><button className={tab === "history" ? styles.selectionTabActive : ""} type="button" onClick={() => setTab("history")}>История <span>{shares.length}</span></button></div>
        {tab === "selection" ? <>
          {candidateSelections.length > 0 && <div className={styles.selectionActions}><p>Объекты текущей подборки.</p><button type="button" onClick={() => setBrowse(true)}>＋ Добавить ещё</button></div>}
          {candidateSelections.length > 0 && <div className={styles.selectionList}>{candidateSelections.map((selection) => <article className={styles.selectionItem} key={selection.id}><span className={!selection.imageUrl ? styles.selectionImagePlaceholder : ""} style={selection.imageUrl ? { backgroundImage: `url("${selection.imageUrl}")` } : undefined}>{!selection.imageUrl && "Фото позже"}</span><div><strong>{selection.title}</strong><p>{selection.subtitle}</p><b>{selection.priceLabel}</b></div><div><button className={styles.selectionRemove} type="button" disabled={busyKey === selection.id} onClick={() => { void remove(selection); }}>Убрать</button></div></article>)}</div>}
          {!candidateSelections.length && <div className={styles.selectionState}><p>Добавьте объекты, которые хотите показать клиенту.</p><button type="button" onClick={() => setBrowse(true)}>Добавить объекты</button></div>}
          {candidateSelections.length > 0 && <div className={styles.shareComposer}>{readyShare ? <div className={styles.shareReady}><div><strong>Подборка создана</strong><small>{readyShare.items.length} объектов · ссылка действует 30 дней</small></div><div><a href={readyShare.publicPath} target="_blank" rel="noopener noreferrer">Открыть предпросмотр</a><button className={styles.sharePrimary} type="button" onClick={() => { void copyShare(readyShare); }}>Копировать ссылку</button></div></div> : <><div><strong>Создать подборку</strong><span>Получите одну мобильную ссылку на выбранные объекты.</span></div><button className={styles.sharePrimary} type="button" disabled={busyKey === "create-share"} onClick={() => { void createShare(); }}>{busyKey === "create-share" ? "Создаём…" : "Создать ссылку"}</button></>}</div>}
        </> : <div className={styles.shareHistory}>{shares.map((share) => <article className={styles.shareHistoryItem} key={share.id}><div><span className={`${styles.shareStatus} ${styles[`shareStatus_${share.status}`]}`}>{shareStatusLabels[share.status]}</span><strong>{share.items.length} объектов</strong><small>{new Date(share.createdAt).toLocaleString("ru-RU")}{share.viewCount ? ` · клиент открывал: ${share.viewCount}` : ""}</small><details><summary>Показать объекты</summary>{share.items.map((item) => <p key={item.id}>{item.title}{item.priceLabel ? ` · ${item.priceLabel}` : ""}</p>)}</details></div><div>{!(["REVOKED", "EXPIRED"] as string[]).includes(share.status) && <><a href={share.publicPath} target="_blank" rel="noopener noreferrer">Открыть</a><button type="button" onClick={() => { void copyShare(share); }}>Копировать</button></>}</div></article>)}{!shares.length && <div className={styles.selectionState}>Созданных подборок пока нет.</div>}{legacyOffered.length > 0 && <p className={styles.legacySelectionNote}>Ранее вручную отмечено предложенными: {legacyOffered.length}.</p>}</div>}
      </>}
      {notice && loadState === "ready" && <p className={styles.selectionNotice} role="status">{notice}</p>}
      {error && loadState === "ready" && <p className={styles.selectionError} role="alert">{error}</p>}
    </aside>
  </div>;
}

function normalizeCurrency(value: string | null | undefined): "USD" | "EUR" | "UAH" { const normalized = value?.toUpperCase(); return normalized === "EUR" || normalized === "UAH" ? normalized : "USD"; }
function viaCategory(value: string | null | undefined) { const normalized = value?.toLowerCase() || ""; if (normalized.includes("house") || normalized.includes("дом")) return "Дом"; if (normalized.includes("land") || normalized.includes("участ")) return "Участок"; if (normalized.includes("commercial") || normalized.includes("коммер")) return "Коммерция"; return "Квартира"; }
function formatPrice(value: number | null, currency: "USD" | "EUR" | "UAH") { if (value === null) return "Цена не указана"; return `${currency === "USD" ? "$" : currency === "EUR" ? "€" : "₴"}${new Intl.NumberFormat("ru-RU").format(value)}`; }
