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
  currency: "USD" | "EUR" | "UAH"; rooms: string | null; area: number | null; imageUrl: string | null;
}
interface ViaProperty {
  externalId: string; title: string; active: boolean; price?: number | null; currency?: string | null;
  district?: string | null; propertyType?: string | null; rooms?: string | null; areaM2?: number | null; previewImageUrl?: string | null;
}
interface CatalogCandidate {
  key: string; propertyId?: string; title: string; subtitle: string; priceLabel: string; imageUrl: string;
  market: "Первичный" | "Вторичный"; category: string; district: string; rooms?: string; source: "CRM" | "Via" | "Демо";
}
interface PropertySelectionShareRecord {
  id: string; status: "CREATED" | "SENT" | "OPENED" | "REVOKED" | "EXPIRED"; publicPath: string;
  expiresAt: string; sentAt: string | null; openedAt: string | null; revokedAt: string | null;
  viewCount: number; createdAt: string; items: Array<{ id: string; propertySelectionId: string | null }>;
}

const categoryLabels = { APARTMENT: "Квартира", HOUSE: "Дом", LAND: "Участок", COMMERCIAL: "Коммерция" } as const;
const fallbackImage = "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=900&q=80";
const shareStatusLabels: Record<PropertySelectionShareRecord["status"], string> = { CREATED: "Ссылка готова", SENT: "Отправлена", OPENED: "Клиент открыл", REVOKED: "Отозвана", EXPIRED: "Истекла" };

export function DealPropertySelectionPanel({ deal, onClose, onCountChange, onActivityChanged }: { deal: Deal; onClose: () => void; onCountChange: (count: number) => void; onActivityChanged: () => Promise<void> }) {
  const [selections, setSelections] = useState<SelectionRecord[]>([]);
  const [shares, setShares] = useState<PropertySelectionShareRecord[]>([]);
  const [properties, setProperties] = useState<ApiProperty[]>([]);
  const [viaProperties, setViaProperties] = useState<ViaProperty[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [browse, setBrowse] = useState(false);
  const [tab, setTab] = useState<"selection" | "history">("selection");
  const [market, setMarket] = useState<"all" | "Первичный" | "Вторичный">(deal.marketPreference === "Новостройка" ? "Первичный" : deal.marketPreference === "Вторичная" ? "Вторичный" : "all");
  const [source, setSource] = useState<"all" | "CRM" | "Via">("all");
  const [search, setSearch] = useState("");
  const [useRequestFilters, setUseRequestFilters] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    await Promise.resolve();
    setLoadState("loading"); setError("");
    try {
      const [selectionResponse, propertyResponse, shareResponse, viaStatusResponse] = await Promise.all([
        fetch(`/api/crm/deals/${deal.id}/property-selections`, { cache: "no-store" }),
        fetch("/api/crm/properties", { cache: "no-store" }),
        fetch(`/api/crm/deals/${deal.id}/property-shares`, { cache: "no-store" }),
        fetch("/api/crm/integrations/via/status", { cache: "no-store" }),
      ]);
      const selectionPayload = await selectionResponse.json() as { selections?: SelectionRecord[]; message?: string };
      const propertyPayload = await propertyResponse.json() as { properties?: ApiProperty[] };
      const sharePayload = await shareResponse.json() as { shares?: PropertySelectionShareRecord[]; message?: string };
      const viaStatus = await viaStatusResponse.json() as { enabled?: boolean };
      if (!selectionResponse.ok || !selectionPayload.selections) throw new Error(selectionPayload.message || "Не удалось загрузить подборку.");
      if (!shareResponse.ok || !sharePayload.shares) throw new Error(sharePayload.message || "Не удалось загрузить ссылки.");
      let remoteItems: ViaProperty[] = [];
      if (viaStatusResponse.ok && viaStatus.enabled) {
        const viaResponse = await fetch("/api/crm/integrations/via/properties", { cache: "no-store" });
        const viaPayload = await viaResponse.json() as { items?: ViaProperty[] };
        if (viaResponse.ok && viaPayload.items) remoteItems = viaPayload.items;
      }
      setSelections(selectionPayload.selections); setShares(sharePayload.shares);
      setProperties(propertyResponse.ok && propertyPayload.properties ? propertyPayload.properties : []);
      setViaProperties(remoteItems); onCountChange(selectionPayload.selections.length); setLoadState("ready");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось загрузить подборку."); setLoadState("error");
    }
  }, [deal.id, onCountChange]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const catalog = useMemo<CatalogCandidate[]>(() => {
    const demoUnits = demoProjects.flatMap((project) => project.units.filter((unit) => unit.status === "Доступен").map((unit) => ({
      key: `unit:${unit.id}`, title: `${project.title} · ${unit.name}`, subtitle: `${project.developer} · ${project.district} · ${unit.area} м²`, priceLabel: formatPrice(unit.price, unit.currency), imageUrl: project.imageUrl,
      market: "Первичный" as const, category: "Квартира", district: project.district, rooms: String(unit.rooms), source: "Демо" as const,
    })));
    const demoSecondary = demoSecondaryProperties.filter((item) => item.status === "Доступен").map((item) => ({
      key: `demo-property:${item.id}`, title: item.title, subtitle: `${item.address} · ${item.area} м²`, priceLabel: formatPrice(item.price, item.currency), imageUrl: item.imageUrl,
      market: "Вторичный" as const, category: item.category, district: item.district, rooms: item.rooms, source: "Демо" as const,
    }));
    const realProperties = properties.filter((item) => item.status === "AVAILABLE").map((item) => ({
      key: `property:${item.id}`, propertyId: item.id, title: item.title, subtitle: [item.address || "Адрес не указан", item.area ? `${item.area} м²` : null].filter(Boolean).join(" · "),
      priceLabel: formatPrice(item.price, item.currency), imageUrl: item.imageUrl || fallbackImage, market: item.market === "PRIMARY" ? "Первичный" as const : "Вторичный" as const,
      category: categoryLabels[item.category], district: item.district || "", rooms: item.rooms || undefined, source: "CRM" as const,
    }));
    const via = viaProperties.filter((item) => item.active).map((item) => ({
      key: `via:${item.externalId}`, title: item.title, subtitle: [item.district, item.areaM2 ? `${item.areaM2} м²` : null].filter(Boolean).join(" · ") || "Объект из каталога Via",
      priceLabel: item.price == null ? "Цена не указана" : formatPrice(item.price, normalizeCurrency(item.currency)), imageUrl: item.previewImageUrl || fallbackImage,
      market: "Вторичный" as const, category: viaCategory(item.propertyType), district: item.district || "", rooms: item.rooms || undefined, source: "Via" as const,
    }));
    return realProperties.length || via.length ? [...realProperties, ...via] : [...demoUnits, ...demoSecondary];
  }, [properties, viaProperties]);

  const visibleCatalog = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("ru");
    const wantedCategory = deal.propertyType === "Коммерческая недвижимость" ? "Коммерция" : deal.propertyType;
    return catalog.filter((item) => {
      if (source !== "all" && item.source !== source) return false;
      if (market !== "all" && item.market !== market) return false;
      if (query && !`${item.title} ${item.subtitle}`.toLocaleLowerCase("ru").includes(query)) return false;
      if (!useRequestFilters) return true;
      if (wantedCategory && item.category !== wantedCategory) return false;
      if (deal.district && item.district && item.district !== deal.district) return false;
      if (deal.rooms && deal.rooms !== "4+" && item.rooms && item.rooms !== deal.rooms) return false;
      if (deal.preferredProject && !item.title.toLocaleLowerCase("ru").includes(deal.preferredProject.toLocaleLowerCase("ru"))) return false;
      return true;
    });
  }, [catalog, deal.district, deal.preferredProject, deal.propertyType, deal.rooms, market, search, source, useRequestFilters]);

  const candidateSelections = selections.filter((item) => item.status === "CANDIDATE");
  const legacyOffered = selections.filter((item) => item.status === "OFFERED");
  const selectedKeys = new Set(selections.map((item) => item.catalogKey));
  const candidateIds = new Set(candidateSelections.map((item) => item.id));
  const readyShare = shares.find((item) => item.status === "CREATED" && item.items.length === candidateIds.size && item.items.every((shareItem) => shareItem.propertySelectionId && candidateIds.has(shareItem.propertySelectionId)));

  async function add(candidate: CatalogCandidate) {
    setBusyKey(candidate.key); setError("");
    try {
      const response = await fetch(`/api/crm/deals/${deal.id}/property-selections`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ propertyId: candidate.propertyId || null, catalogKey: candidate.key, title: candidate.title, subtitle: candidate.subtitle, priceLabel: candidate.priceLabel, imageUrl: candidate.imageUrl }) });
      const payload = await response.json() as { selection?: SelectionRecord; message?: string };
      if (!response.ok || !payload.selection) throw new Error(payload.message || "Не удалось добавить объект.");
      setSelections((current) => [payload.selection!, ...current.filter((item) => item.id !== payload.selection!.id)]);
      onCountChange(selections.filter((item) => item.id !== payload.selection!.id).length + 1); await onActivityChanged();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось добавить объект."); }
    finally { setBusyKey(null); }
  }

  async function remove(selection: SelectionRecord) {
    setBusyKey(selection.id); setError("");
    try {
      const response = await fetch(`/api/crm/deals/${deal.id}/property-selections/${selection.id}`, { method: "DELETE" });
      const payload = await response.json() as { ok?: boolean; message?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.message || "Не удалось удалить объект.");
      const next = selections.filter((item) => item.id !== selection.id); setSelections(next); onCountChange(next.length); await onActivityChanged();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось удалить объект."); }
    finally { setBusyKey(null); }
  }

  async function createShare() {
    if (!candidateSelections.length) return;
    setBusyKey("create-share"); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/crm/deals/${deal.id}/property-shares`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ selectionIds: candidateSelections.map((item) => item.id) }) });
      const payload = await response.json() as { share?: PropertySelectionShareRecord; message?: string };
      if (!response.ok || !payload.share) throw new Error(payload.message || "Не удалось создать ссылку.");
      setShares((current) => [payload.share!, ...current]); setNotice("Ссылка готова. Скопируйте её и отправьте клиенту."); await onActivityChanged();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось создать ссылку."); }
    finally { setBusyKey(null); }
  }

  function absoluteShareUrl(share: PropertySelectionShareRecord) { return new URL(share.publicPath, window.location.origin).toString(); }
  async function copyShare(share: PropertySelectionShareRecord) {
    try { await navigator.clipboard.writeText(absoluteShareUrl(share)); setNotice("Ссылка скопирована. После отправки нажмите «Подборка отправлена»."); }
    catch { setError("Не удалось скопировать ссылку. Откройте её и скопируйте адрес вручную."); }
  }
  async function updateShare(share: PropertySelectionShareRecord, action: "sent" | "revoke") {
    setBusyKey(share.id); setError("");
    try {
      const response = await fetch(`/api/crm/deals/${deal.id}/property-shares/${share.id}/${action}`, { method: "POST" });
      const payload = await response.json() as { share?: PropertySelectionShareRecord; message?: string };
      if (!response.ok || !payload.share) throw new Error(payload.message || "Не удалось обновить ссылку.");
      setShares((current) => current.map((item) => item.id === share.id ? payload.share! : item));
      if (action === "sent") { setNotice("Отправка зафиксирована в истории сделки."); setTab("history"); await load(); }
      await onActivityChanged();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось обновить ссылку."); }
    finally { setBusyKey(null); }
  }

  return <div className={styles.selectionLayer}>
    <button className={styles.selectionBackdrop} type="button" onClick={onClose} aria-label="Закрыть подборку" />
    <aside className={styles.selectionDrawer} role="dialog" aria-modal="true" aria-label="Подборка объектов">
      <header className={styles.selectionHeader}><div><span>Сделка #{deal.number}</span><h2>{browse ? "Добавить объекты" : "Подборка"}</h2><p>{deal.contactName}</p></div><button type="button" onClick={onClose} aria-label="Закрыть">×</button></header>
      {loadState === "loading" ? <div className={styles.selectionState}>Загружаем подборку…</div> : loadState === "error" ? <div className={styles.selectionState}><p>{error}</p><button type="button" onClick={() => { void load(); }}>Повторить</button></div> : browse ? <>
        <div className={styles.catalogPickerToolbar}><button type="button" onClick={() => setBrowse(false)}>← К подборке</button><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Объект или ЖК" /><select value={market} onChange={(event) => setMarket(event.target.value as typeof market)}><option value="all">Весь рынок</option><option value="Первичный">Новостройки</option><option value="Вторичный">Вторичная</option></select></div>
        <div className={styles.catalogSourceTabs}><button className={source === "all" ? styles.catalogSourceActive : ""} type="button" onClick={() => setSource("all")}>Все</button><button className={source === "CRM" ? styles.catalogSourceActive : ""} type="button" onClick={() => setSource("CRM")}>База CRM</button>{viaProperties.length > 0 && <button className={source === "Via" ? styles.catalogSourceActive : ""} type="button" onClick={() => setSource("Via")}>Via</button>}</div>
        <div className={styles.requestFilterNotice}><span>{useRequestFilters ? "Учитываем параметры сделки" : "Показываем весь каталог"}</span><button type="button" onClick={() => setUseRequestFilters((value) => !value)}>{useRequestFilters ? "Показать всё" : "Применить запрос"}</button></div>
        <div className={styles.selectionCatalog}>{visibleCatalog.map((candidate) => <article className={styles.selectionCatalogCard} key={candidate.key}><span style={{ backgroundImage: `url("${candidate.imageUrl}")` }} /><div><small>{candidate.source} · {candidate.market}</small><strong>{candidate.title}</strong><p>{candidate.subtitle}</p><b>{candidate.priceLabel}</b></div><button type="button" disabled={selectedKeys.has(candidate.key) || busyKey === candidate.key} onClick={() => { void add(candidate); }}>{selectedKeys.has(candidate.key) ? "Добавлен" : busyKey === candidate.key ? "…" : "Добавить"}</button></article>)}</div>
        {!visibleCatalog.length && <div className={styles.selectionState}><p>По выбранным параметрам вариантов не найдено.</p>{useRequestFilters && <button type="button" onClick={() => setUseRequestFilters(false)}>Показать весь каталог</button>}</div>}
        <div className={styles.selectionStickyBar}><span>В подборке: {candidateSelections.length}</span><button type="button" onClick={() => setBrowse(false)}>Готово</button></div>
      </> : <>
        <div className={styles.selectionTabs}><button className={tab === "selection" ? styles.selectionTabActive : ""} type="button" onClick={() => setTab("selection")}>Подборка <span>{candidateSelections.length}</span></button><button className={tab === "history" ? styles.selectionTabActive : ""} type="button" onClick={() => setTab("history")}>История <span>{shares.length}</span></button></div>
        {tab === "selection" ? <>
          <div className={styles.selectionActions}><p>Добавьте варианты и отправьте клиенту одной ссылкой.</p><button type="button" onClick={() => setBrowse(true)}>＋ Добавить объекты</button></div>
          <div className={styles.selectionList}>{candidateSelections.map((selection) => <article className={styles.selectionItem} key={selection.id}><span style={{ backgroundImage: `url("${selection.imageUrl || fallbackImage}")` }} /><div><strong>{selection.title}</strong><p>{selection.subtitle}</p><b>{selection.priceLabel}</b></div><div><button className={styles.selectionRemove} type="button" disabled={busyKey === selection.id} onClick={() => { void remove(selection); }}>Убрать</button></div></article>)}</div>
          {!candidateSelections.length && <div className={styles.selectionState}><p>Добавьте объекты, которые хотите показать клиенту.</p><button type="button" onClick={() => setBrowse(true)}>Открыть каталог</button></div>}
          <div className={styles.shareComposer}>{readyShare ? <div className={styles.shareReady}><div><small>Ссылка готова · {readyShare.items.length} объектов</small><a href={readyShare.publicPath} target="_blank" rel="noopener noreferrer">{absolutePathLabel(readyShare.publicPath)}</a></div><div><button type="button" onClick={() => { void copyShare(readyShare); }}>Копировать ссылку</button><button className={styles.sharePrimary} type="button" disabled={busyKey === readyShare.id} onClick={() => { void updateShare(readyShare, "sent"); }}>Подборка отправлена</button></div></div> : <><div><strong>Готово к отправке?</strong><span>Создадим отдельную мобильную страницу для клиента.</span></div><button className={styles.sharePrimary} type="button" disabled={!candidateSelections.length || busyKey === "create-share"} onClick={() => { void createShare(); }}>{busyKey === "create-share" ? "Создаём…" : "Создать ссылку"}</button></>}</div>
        </> : <div className={styles.shareHistory}>{shares.map((share) => <article className={styles.shareHistoryItem} key={share.id}><div><span className={`${styles.shareStatus} ${styles[`shareStatus_${share.status}`]}`}>{shareStatusLabels[share.status]}</span><strong>{share.items.length} объектов</strong><small>{new Date(share.createdAt).toLocaleString("ru-RU")}{share.viewCount ? ` · открытий: ${share.viewCount}` : ""}</small></div><div>{!(["REVOKED", "EXPIRED"] as string[]).includes(share.status) && <><a href={share.publicPath} target="_blank" rel="noopener noreferrer">Открыть</a><button type="button" onClick={() => { void copyShare(share); }}>Копировать</button><button type="button" disabled={busyKey === share.id} onClick={() => { void updateShare(share, "revoke"); }}>Отозвать</button></>}</div></article>)}{!shares.length && <div className={styles.selectionState}>Отправленных подборок пока нет.</div>}{legacyOffered.length > 0 && <p className={styles.legacySelectionNote}>Ранее вручную отмечено предложенными: {legacyOffered.length}. Новые отправки фиксируются автоматически по ссылке.</p>}</div>}
      </>}
      {notice && loadState === "ready" && <p className={styles.selectionNotice} role="status">{notice}</p>}
      {error && loadState === "ready" && <p className={styles.selectionError} role="alert">{error}</p>}
    </aside>
  </div>;
}

function normalizeCurrency(value: string | null | undefined): "USD" | "EUR" | "UAH" { const normalized = value?.toUpperCase(); return normalized === "EUR" || normalized === "UAH" ? normalized : "USD"; }
function viaCategory(value: string | null | undefined) { const normalized = value?.toLowerCase() || ""; if (normalized.includes("house") || normalized.includes("дом")) return "Дом"; if (normalized.includes("land") || normalized.includes("участ")) return "Участок"; if (normalized.includes("commercial") || normalized.includes("коммер")) return "Коммерция"; return "Квартира"; }
function absolutePathLabel(path: string) { return path.replace(/^\//, ""); }
function formatPrice(value: number | null, currency: "USD" | "EUR" | "UAH") { if (value === null) return "Цена не указана"; return `${currency === "USD" ? "$" : currency === "EUR" ? "€" : "₴"}${new Intl.NumberFormat("ru-RU").format(value)}`; }
