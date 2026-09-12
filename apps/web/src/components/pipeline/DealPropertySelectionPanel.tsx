import { useEffect, useMemo, useState } from "react";
import type { Deal } from "@/types/crm";
import { demoProjects, demoSecondaryProperties } from "@/components/properties/demoCatalog";
import styles from "./deal-drawer.module.css";

interface SelectionRecord {
  id: string;
  propertyId: string | null;
  catalogKey: string;
  status: "CANDIDATE" | "OFFERED";
  title: string;
  subtitle: string | null;
  priceLabel: string | null;
  imageUrl: string | null;
}

interface ApiProperty {
  id: string; code: string; title: string; address: string | null; district: string | null;
  category: "APARTMENT" | "HOUSE" | "LAND" | "COMMERCIAL"; market: "PRIMARY" | "SECONDARY";
  operation: "SALE" | "RENT"; status: "AVAILABLE" | "RESERVED" | "SOLD"; price: number;
  currency: "USD" | "EUR"; rooms: string | null; area: number; imageUrl: string | null;
}

interface CatalogCandidate {
  key: string;
  propertyId?: string;
  title: string;
  subtitle: string;
  priceLabel: string;
  imageUrl: string;
  market: "Первичный" | "Вторичный";
  category: string;
  district: string;
  rooms?: string;
}

const categoryLabels = { APARTMENT: "Квартира", HOUSE: "Дом", LAND: "Участок", COMMERCIAL: "Коммерция" } as const;
const fallbackImage = "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=900&q=80";

export function DealPropertySelectionPanel({ deal, onClose, onCountChange, onActivityChanged }: { deal: Deal; onClose: () => void; onCountChange: (count: number) => void; onActivityChanged: () => Promise<void> }) {
  const [selections, setSelections] = useState<SelectionRecord[]>([]);
  const [properties, setProperties] = useState<ApiProperty[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [browse, setBrowse] = useState(false);
  const [tab, setTab] = useState<"CANDIDATE" | "OFFERED">("CANDIDATE");
  const [market, setMarket] = useState<"all" | "Первичный" | "Вторичный">(
    deal.marketPreference === "Новостройка" ? "Первичный" : deal.marketPreference === "Вторичная" ? "Вторичный" : "all",
  );
  const [search, setSearch] = useState("");
  const [useRequestFilters, setUseRequestFilters] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function load() {
    setLoadState("loading");
    try {
      const [selectionResponse, propertyResponse] = await Promise.all([
        fetch(`/api/crm/deals/${deal.id}/property-selections`, { cache: "no-store" }),
        fetch("/api/crm/properties", { cache: "no-store" }),
      ]);
      const selectionPayload = await selectionResponse.json() as { selections?: SelectionRecord[]; message?: string };
      const propertyPayload = await propertyResponse.json() as { properties?: ApiProperty[] };
      if (!selectionResponse.ok || !selectionPayload.selections) throw new Error(selectionPayload.message || "Не удалось загрузить подборку.");
      setSelections(selectionPayload.selections);
      setProperties(propertyResponse.ok && propertyPayload.properties ? propertyPayload.properties : []);
      onCountChange(selectionPayload.selections.length);
      setLoadState("ready");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось загрузить подборку.");
      setLoadState("error");
    }
  }

  useEffect(() => {
    let active = true;
    void Promise.all([
      fetch(`/api/crm/deals/${deal.id}/property-selections`, { cache: "no-store" }),
      fetch("/api/crm/properties", { cache: "no-store" }),
    ]).then(async ([selectionResponse, propertyResponse]) => {
      const selectionPayload = await selectionResponse.json() as { selections?: SelectionRecord[]; message?: string };
      const propertyPayload = await propertyResponse.json() as { properties?: ApiProperty[] };
      if (!selectionResponse.ok || !selectionPayload.selections) throw new Error(selectionPayload.message || "Не удалось загрузить подборку.");
      if (!active) return;
      setSelections(selectionPayload.selections);
      setProperties(propertyResponse.ok && propertyPayload.properties ? propertyPayload.properties : []);
      onCountChange(selectionPayload.selections.length);
      setLoadState("ready");
    }).catch((cause: unknown) => {
      if (!active) return;
      setError(cause instanceof Error ? cause.message : "Не удалось загрузить подборку.");
      setLoadState("error");
    });
    return () => { active = false; };
  }, [deal.id, onCountChange]);

  const catalog = useMemo<CatalogCandidate[]>(() => {
    const demoUnits = demoProjects.flatMap((project) => project.units.filter((unit) => unit.status === "Доступен").map((unit) => ({
      key: `unit:${unit.id}`, title: `${project.title} · ${unit.name}`, subtitle: `${project.developer} · ${project.district} · ${unit.area} м²`,
      priceLabel: formatPrice(unit.price, unit.currency), imageUrl: project.imageUrl, market: "Первичный" as const, category: "Квартира", district: project.district, rooms: String(unit.rooms),
    })));
    const demoSecondary = demoSecondaryProperties.filter((property) => property.status === "Доступен").map((property) => ({
      key: `demo-property:${property.id}`, title: property.title, subtitle: `${property.address} · ${property.area} м²`, priceLabel: formatPrice(property.price, property.currency),
      imageUrl: property.imageUrl, market: "Вторичный" as const, category: property.category, district: property.district, rooms: property.rooms,
    }));
    const realProperties = properties.filter((property) => property.status === "AVAILABLE").map((property) => ({
      key: `property:${property.id}`, propertyId: property.id, title: property.title, subtitle: `${property.address || "Адрес не указан"} · ${property.area} м²`,
      priceLabel: formatPrice(property.price, property.currency), imageUrl: property.imageUrl || fallbackImage, market: property.market === "PRIMARY" ? "Первичный" as const : "Вторичный" as const,
      category: categoryLabels[property.category], district: property.district || "", rooms: property.rooms || undefined,
    }));
    return [...realProperties, ...demoUnits, ...demoSecondary];
  }, [properties]);

  const visibleCatalog = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("ru");
    const wantedCategory = deal.propertyType === "Коммерческая недвижимость" ? "Коммерция" : deal.propertyType;
    return catalog.filter((item) => {
      if (market !== "all" && item.market !== market) return false;
      if (query && !`${item.title} ${item.subtitle}`.toLocaleLowerCase("ru").includes(query)) return false;
      if (!useRequestFilters) return true;
      if (wantedCategory && item.category !== wantedCategory) return false;
      if (deal.district && item.district !== deal.district) return false;
      if (deal.rooms && deal.rooms !== "4+" && item.rooms !== deal.rooms) return false;
      if (deal.preferredProject && !item.title.toLocaleLowerCase("ru").includes(deal.preferredProject.toLocaleLowerCase("ru"))) return false;
      return true;
    });
  }, [catalog, deal.district, deal.preferredProject, deal.propertyType, deal.rooms, market, search, useRequestFilters]);

  const selectedKeys = new Set(selections.map((selection) => selection.catalogKey));
  const tabSelections = selections.filter((selection) => selection.status === tab);

  async function add(candidate: CatalogCandidate) {
    setBusyKey(candidate.key); setError("");
    try {
      const response = await fetch(`/api/crm/deals/${deal.id}/property-selections`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ propertyId: candidate.propertyId || null, catalogKey: candidate.key, title: candidate.title, subtitle: candidate.subtitle, priceLabel: candidate.priceLabel, imageUrl: candidate.imageUrl }) });
      const payload = await response.json() as { selection?: SelectionRecord; message?: string };
      if (!response.ok || !payload.selection) throw new Error(payload.message || "Не удалось добавить объект.");
      setSelections((current) => [payload.selection!, ...current.filter((item) => item.id !== payload.selection!.id)]);
      onCountChange(selections.filter((item) => item.id !== payload.selection!.id).length + 1);
      await onActivityChanged();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось добавить объект."); }
    finally { setBusyKey(null); }
  }

  async function changeStatus(selection: SelectionRecord, status: SelectionRecord["status"]) {
    setBusyKey(selection.id); setError("");
    try {
      const response = await fetch(`/api/crm/deals/${deal.id}/property-selections/${selection.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status }) });
      const payload = await response.json() as { selection?: SelectionRecord; message?: string };
      if (!response.ok || !payload.selection) throw new Error(payload.message || "Не удалось обновить подборку.");
      setSelections((current) => current.map((item) => item.id === selection.id ? payload.selection! : item));
      await onActivityChanged();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось обновить подборку."); }
    finally { setBusyKey(null); }
  }

  async function remove(selection: SelectionRecord) {
    setBusyKey(selection.id); setError("");
    try {
      const response = await fetch(`/api/crm/deals/${deal.id}/property-selections/${selection.id}`, { method: "DELETE" });
      const payload = await response.json() as { ok?: boolean; message?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.message || "Не удалось удалить объект.");
      const next = selections.filter((item) => item.id !== selection.id);
      setSelections(next); onCountChange(next.length); await onActivityChanged();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось удалить объект."); }
    finally { setBusyKey(null); }
  }

  return <div className={styles.selectionLayer}>
    <button className={styles.selectionBackdrop} type="button" onClick={onClose} aria-label="Закрыть подборку" />
    <aside className={styles.selectionDrawer} role="dialog" aria-modal="true" aria-label="Подборка объектов">
      <header className={styles.selectionHeader}><div><span>Сделка #{deal.number}</span><h2>{browse ? "Добавить из каталога" : "Подборка"}</h2><p>{deal.contactName}</p></div><button type="button" onClick={onClose} aria-label="Закрыть">×</button></header>
      {loadState === "loading" ? <div className={styles.selectionState}>Загружаем подборку…</div> : loadState === "error" ? <div className={styles.selectionState}><p>{error}</p><button type="button" onClick={() => { void load(); }}>Повторить</button></div> : browse ? <>
        <div className={styles.catalogPickerToolbar}><button type="button" onClick={() => setBrowse(false)}>← К подборке</button><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Объект или ЖК" /><select value={market} onChange={(event) => setMarket(event.target.value as typeof market)}><option value="all">Весь рынок</option><option value="Первичный">Новостройки</option><option value="Вторичный">Вторичная</option></select></div>
        <div className={styles.requestFilterNotice}><span>{useRequestFilters ? "Учитываем параметры сделки" : "Показываем весь каталог"}</span><button type="button" onClick={() => setUseRequestFilters((value) => !value)}>{useRequestFilters ? "Показать всё" : "Применить запрос"}</button></div>
        <div className={styles.selectionCatalog}>{visibleCatalog.map((candidate) => <article className={styles.selectionCatalogCard} key={candidate.key}><span style={{ backgroundImage: `url("${candidate.imageUrl}")` }} /><div><small>{candidate.market}</small><strong>{candidate.title}</strong><p>{candidate.subtitle}</p><b>{candidate.priceLabel}</b></div><button type="button" disabled={selectedKeys.has(candidate.key) || busyKey === candidate.key} onClick={() => { void add(candidate); }}>{selectedKeys.has(candidate.key) ? "Добавлен" : busyKey === candidate.key ? "…" : "Добавить"}</button></article>)}</div>
        {!visibleCatalog.length && <div className={styles.selectionState}><p>По параметрам сделки вариантов не найдено.</p>{useRequestFilters && <button type="button" onClick={() => setUseRequestFilters(false)}>Показать весь каталог</button>}</div>}
      </> : <>
        <div className={styles.selectionTabs}><button className={tab === "CANDIDATE" ? styles.selectionTabActive : ""} type="button" onClick={() => setTab("CANDIDATE")}>Кандидаты <span>{selections.filter((item) => item.status === "CANDIDATE").length}</span></button><button className={tab === "OFFERED" ? styles.selectionTabActive : ""} type="button" onClick={() => setTab("OFFERED")}>Уже предложено <span>{selections.filter((item) => item.status === "OFFERED").length}</span></button></div>
        <div className={styles.selectionActions}><p>{tab === "CANDIDATE" ? "Варианты, которые стоит рассмотреть для клиента." : "Объекты, которые клиент уже видел."}</p><button type="button" onClick={() => setBrowse(true)}>＋ Добавить объекты</button></div>
        <div className={styles.selectionList}>{tabSelections.map((selection) => <article className={styles.selectionItem} key={selection.id}><span style={{ backgroundImage: `url("${selection.imageUrl || fallbackImage}")` }} /><div><strong>{selection.title}</strong><p>{selection.subtitle}</p><b>{selection.priceLabel}</b></div><div>{tab === "CANDIDATE" ? <button type="button" disabled={busyKey === selection.id} onClick={() => { void changeStatus(selection, "OFFERED"); }}>Отметить предложенным</button> : <button type="button" disabled={busyKey === selection.id} onClick={() => { void changeStatus(selection, "CANDIDATE"); }}>Вернуть в кандидаты</button>}<button className={styles.selectionRemove} type="button" disabled={busyKey === selection.id} onClick={() => { void remove(selection); }}>Убрать</button></div></article>)}</div>
        {!tabSelections.length && <div className={styles.selectionState}><p>{tab === "CANDIDATE" ? "Кандидатов пока нет." : "Клиенту ещё ничего не предлагали."}</p>{tab === "CANDIDATE" && <button type="button" onClick={() => setBrowse(true)}>Открыть каталог</button>}</div>}
      </>}
      {error && loadState === "ready" && <p className={styles.selectionError} role="alert">{error}</p>}
    </aside>
  </div>;
}

function formatPrice(value: number, currency: "USD" | "EUR") {
  return `${currency === "USD" ? "$" : "€"}${new Intl.NumberFormat("ru-RU").format(value)}`;
}
