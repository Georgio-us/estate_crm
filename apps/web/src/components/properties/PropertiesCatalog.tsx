"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { UiIcon } from "@/components/ui/UiIcon";
import { useCurrentUser } from "@/components/auth/AuthContext";
import { DevelopmentsCatalog } from "@/components/developments/DevelopmentsCatalog";
import type { PropertyCategory, PropertyListing } from "@/types/crm";
import { NewPropertyModal, type NewPropertyDraft } from "./NewPropertyModal";
import { PropertyDrawer } from "./PropertyDrawer";
import { PropertyExcelTransfer } from "./PropertyExcelTransfer";
import styles from "./properties.module.css";

type ViewMode = "gallery" | "table";
type CatalogSection = "all" | "primary" | "secondary" | "rent" | "via" | "archive";

interface ApiProperty {
  id: string; code: string; title: string; address: string | null; district: string | null;
  category: "APARTMENT" | "HOUSE" | "LAND" | "COMMERCIAL"; market: "PRIMARY" | "SECONDARY";
  operation: "SALE" | "RENT"; status: "AVAILABLE" | "RESERVED" | "SOLD"; price: number | null; pricePerSquareMeter: number | null; priceRaw: string | null;
  currency: "USD" | "EUR" | "UAH"; rooms: string | null; area: number | null; areaRaw: string | null; floor: number | null;
  totalFloors: number | null; landArea: number | null; project: string | null; developer: string | null;
  description: string | null; imageUrl: string | null; updatedAt: string;
  buildingLabel: string | null; unitDetail: string | null; subtype: string | null; condition: string | null;
  documentNotes: string | null; ownerName: string | null; ownerContacts: string | null;
  assigneeId: string | null; assigneeName: string | null; assignmentNote: string | null; photosCount: number;
  sourceSheet: string | null; sourceRow: number | null; sourceProvider: "CRM" | "EXCEL" | "VIA"; externalSourceId: string | null;
  archivedAt: string | null;
}
interface ViaProperty {
  externalId: string; title: string; active: boolean; updatedAt?: string; operation?: string; propertyType?: string;
  price?: number | null; currency?: string | null; rooms?: string | null; areaM2?: number | null;
  district?: string | null; previewImageUrl?: string | null;
}

const categoryFromApi = { APARTMENT: "Квартира", HOUSE: "Дом", LAND: "Участок", COMMERCIAL: "Коммерция" } as const;
const categoryToApi = { Квартира: "APARTMENT", Дом: "HOUSE", Участок: "LAND", Коммерция: "COMMERCIAL" } as const;
const marketFromApi = { PRIMARY: "Первичный", SECONDARY: "Вторичный" } as const;
const marketToApi = { Первичный: "PRIMARY", Вторичный: "SECONDARY" } as const;
const operationFromApi = { SALE: "Продажа", RENT: "Аренда" } as const;
const operationToApi = { Продажа: "SALE", Аренда: "RENT" } as const;
const statusFromApi = { AVAILABLE: "Доступен", RESERVED: "Резерв", SOLD: "Продан" } as const;
const statusToApi = { Доступен: "AVAILABLE", Резерв: "RESERVED", Продан: "SOLD" } as const;
const fallbackImage = "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=1200&q=80";

async function fetchViaCatalog(): Promise<ViaProperty[]> {
  const items: ViaProperty[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 20; page += 1) {
    const response = await fetch(`/api/crm/integrations/via/properties${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`, { cache: "no-store" });
    const payload = await response.json() as { items?: ViaProperty[]; nextCursor?: string | null };
    if (!response.ok || !payload.items) throw new Error();
    items.push(...payload.items);
    cursor = payload.nextCursor || null;
    if (!cursor) break;
  }
  return items.filter((item) => item.active);
}

function mapApiProperty(property: ApiProperty): PropertyListing {
  return {
    id: property.id, code: property.code, title: property.title, address: property.address || "Адрес не указан",
    district: property.district || "Не указан", category: categoryFromApi[property.category], market: marketFromApi[property.market],
    operation: operationFromApi[property.operation], status: statusFromApi[property.status], price: property.price, pricePerSquareMeter: property.pricePerSquareMeter,
    currency: property.currency, rooms: property.rooms || undefined, area: property.area, floor: property.floor ?? undefined,
    totalFloors: property.totalFloors ?? undefined, landArea: property.landArea ?? undefined, project: property.project || undefined,
    developer: property.developer || undefined, description: property.description || "Описание ещё не добавлено.",
    imageUrl: property.imageUrl || fallbackImage,
    priceRaw: property.priceRaw, areaRaw: property.areaRaw, buildingLabel: property.buildingLabel, unitDetail: property.unitDetail,
    subtype: property.subtype, condition: property.condition, documentNotes: property.documentNotes,
    ownerName: property.ownerName, ownerContacts: property.ownerContacts, assigneeId: property.assigneeId,
    assigneeName: property.assigneeName, assignmentNote: property.assignmentNote, photosCount: property.photosCount,
    sourceSheet: property.sourceSheet, sourceRow: property.sourceRow, sourceProvider: property.sourceProvider, externalSourceId: property.externalSourceId,
    archivedAt: property.archivedAt,
    updatedAt: new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(property.updatedAt)),
  };
}

function propertyPayload(property: PropertyListing | NewPropertyDraft) {
  const numeric = (value: string | number | undefined) => value === undefined || value === "" ? null : Number(value);
  return {
    title: property.title, address: property.address || null, district: property.district || null,
    category: categoryToApi[property.category], market: marketToApi[property.market], operation: operationToApi[property.operation],
    ...( "status" in property ? { status: statusToApi[property.status] } : {}),
    price: property.price === "" || property.price === null ? null : Number(property.price), pricePerSquareMeter: property.pricePerSquareMeter === "" || property.pricePerSquareMeter === null || property.pricePerSquareMeter === undefined ? null : Number(property.pricePerSquareMeter), currency: property.currency,
    rooms: property.rooms || null, area: property.area === "" || property.area === null ? null : Number(property.area),
    ...( "floor" in property ? { floor: numeric(property.floor), totalFloors: numeric(property.totalFloors), landArea: numeric(property.landArea) } : {}),
    project: property.project || null, developer: property.developer || null, description: property.description || null,
    ...( "ownerName" in property ? { ownerName: property.ownerName || null, ownerContacts: property.ownerContacts || null, buildingLabel: property.buildingLabel || null, unitDetail: property.unitDetail || null, subtype: property.subtype || null, condition: property.condition || null, documentNotes: property.documentNotes || null, assigneeId: property.assigneeId || null, assignmentNote: property.assignmentNote || null } : {}),
  };
}

export function PropertiesCatalog() {
  const currentUser = useCurrentUser();
  const [properties, setProperties] = useState<PropertyListing[]>([]);
  const [archivedProperties, setArchivedProperties] = useState<PropertyListing[]>([]);
  const [viaProperties, setViaProperties] = useState<ViaProperty[]>([]);
  const [viaEnabled, setViaEnabled] = useState(false);
  const [viaState, setViaState] = useState<"loading" | "ready" | "error">("loading");
  const [importingViaId, setImportingViaId] = useState<string | null>(null);
  const [viaNotice, setViaNotice] = useState("");
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [view, setView] = useState<ViewMode>("gallery");
  const [section, setSection] = useState<CatalogSection>("all");
  const [myOnly, setMyOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<"all" | PropertyCategory>("all");
  const [district, setDistrict] = useState("all");
  const [maxPrice, setMaxPrice] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  async function loadProperties() {
    setLoadState("loading");
    try {
      const [response, archiveResponse] = await Promise.all([
        fetch("/api/crm/properties", { cache: "no-store" }),
        fetch("/api/crm/properties?archived=only", { cache: "no-store" }),
      ]);
      const [payload, archivePayload] = await Promise.all([response.json(), archiveResponse.json()]) as Array<{ properties?: ApiProperty[] }>;
      if (!response.ok || !archiveResponse.ok || !payload.properties || !archivePayload.properties) throw new Error("Invalid response");
      setProperties(payload.properties.map(mapApiProperty));
      setArchivedProperties(archivePayload.properties.map(mapApiProperty));
      setLoadState("ready");
    } catch { setLoadState("error"); }
  }

  useEffect(() => {
    let active = true;
    void Promise.all([fetch("/api/crm/properties", { cache: "no-store" }), fetch("/api/crm/properties?archived=only", { cache: "no-store" })]).then(async ([response, archiveResponse]) => {
      const [payload, archivePayload] = await Promise.all([response.json(), archiveResponse.json()]) as Array<{ properties?: ApiProperty[] }>;
      if (!response.ok || !archiveResponse.ok || !payload.properties || !archivePayload.properties) throw new Error();
      if (active) { setProperties(payload.properties.map(mapApiProperty)); setArchivedProperties(archivePayload.properties.map(mapApiProperty)); setLoadState("ready"); }
    }).catch(() => { if (active) setLoadState("error"); });
    return () => { active = false; };
  }, []);

  async function loadViaProperties() {
    setViaState("loading");
    try {
      const statusResponse = await fetch("/api/crm/integrations/via/status", { cache: "no-store" });
      const status = await statusResponse.json() as { enabled?: boolean };
      const enabled = Boolean(statusResponse.ok && status.enabled);
      setViaEnabled(enabled);
      if (!enabled) { setViaProperties([]); setViaState("ready"); return; }
      setViaProperties(await fetchViaCatalog()); setViaState("ready");
    } catch { setViaState("error"); }
  }

  useEffect(() => {
    let active = true;
    void fetch("/api/crm/integrations/via/status", { cache: "no-store" }).then(async (response) => {
      const status = await response.json() as { enabled?: boolean };
      if (!active) return;
      const enabled = Boolean(response.ok && status.enabled); setViaEnabled(enabled);
      if (!enabled) { setViaState("ready"); return; }
      const catalog = await fetchViaCatalog();
      if (active) { setViaProperties(catalog); setViaState("ready"); }
    }).catch(() => { if (active) setViaState("error"); });
    return () => { active = false; };
  }, []);

  const selectedProperty = [...properties, ...archivedProperties].find((property) => property.id === selectedId);
  const importedVia = useMemo(() => new Map(properties.filter((property) => property.sourceProvider === "VIA" && property.externalSourceId).map((property) => [property.externalSourceId!, property.id])), [properties]);

  const visibleProperties = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("ru");
    const sourceProperties = section === "archive" ? archivedProperties : properties;
    return sourceProperties.filter((property) => {
      const matchesSearch = !query || [property.title, property.address, property.code, property.project, property.developer].some((value) => value?.toLocaleLowerCase("ru").includes(query));
      return section !== "via" && (section === "archive" || property.status === "Доступен")
        && matchesSearch
        && (section === "all" || section === "archive" || (section === "primary" ? property.market === "Первичный" : section === "rent" ? property.operation === "Аренда" : property.market === "Вторичный" && property.operation === "Продажа"))
        && (!myOnly || property.assigneeId === currentUser.id)
        && (category === "all" || property.category === category)
        && (district === "all" || property.district === district)
        && (!maxPrice || (property.price !== null && property.price <= Number(maxPrice)));
    });
  }, [archivedProperties, properties, category, currentUser.id, district, maxPrice, myOnly, search, section]);

  const visibleViaProperties = useMemo(() => {
    if (!viaEnabled || (section !== "all" && section !== "via")) return [];
    const query = search.trim().toLocaleLowerCase("ru");
    return viaProperties.filter((property) => {
      const propertyCategory = viaCategoryLabel(property.propertyType);
      return (!query || `${property.title} ${property.district || ""} ${propertyCategory}`.toLocaleLowerCase("ru").includes(query))
        && (category === "all" || propertyCategory === category)
        && (district === "all" || property.district === district)
        && (!maxPrice || (property.price != null && property.price <= Number(maxPrice)));
    });
  }, [category, district, maxPrice, search, section, viaEnabled, viaProperties]);

  const hasFilters = Boolean(search || section !== "all" || myOnly || category !== "all" || district !== "all" || maxPrice);
  const resultTotal = visibleProperties.length + visibleViaProperties.length;
  const catalogTotal = section === "archive" ? archivedProperties.length : properties.filter((property) => property.status === "Доступен").length + (viaEnabled ? viaProperties.length : 0);

  async function createProperty(draft: NewPropertyDraft) {
    const response = await fetch("/api/crm/properties", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(propertyPayload(draft)) });
    const payload = await response.json() as { property?: ApiProperty; message?: string };
    if (!response.ok || !payload.property) throw new Error(payload.message || "Не удалось создать объект.");
    const property = mapApiProperty(payload.property);
    setProperties((current) => [property, ...current]);
    setIsCreating(false);
    setSelectedId(property.id);
  }

  async function saveProperty(next: PropertyListing) {
    const response = await fetch(`/api/crm/properties/${next.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(propertyPayload(next)) });
    const payload = await response.json() as { property?: ApiProperty; message?: string };
    if (!response.ok || !payload.property) throw new Error(payload.message || "Не удалось сохранить объект.");
    const property = mapApiProperty(payload.property);
    setProperties((current) => current.map((item) => item.id === property.id ? property : item));
  }

  async function runPropertyLifecycle(propertyId: string, action: "archive" | "restore") {
    const response = await fetch(`/api/crm/properties/${propertyId}/${action}`, { method: "POST" });
    const payload = await response.json() as { property?: ApiProperty; message?: string };
    if (!response.ok || !payload.property) throw new Error(payload.message || "Не удалось обновить объект.");
    setSelectedId(null);
    await loadProperties();
    if (action === "archive") setSection("archive");
  }

  async function deleteProperty(propertyId: string) {
    const response = await fetch(`/api/crm/properties/${propertyId}`, { method: "DELETE" });
    const payload = await response.json() as { deleted?: boolean; message?: string };
    if (!response.ok || !payload.deleted) throw new Error(payload.message || "Не удалось удалить объект.");
    setSelectedId(null);
    await loadProperties();
  }

  async function importViaProperty(property: ViaProperty) {
    setImportingViaId(property.externalId); setViaNotice("");
    try {
      const response = await fetch(`/api/crm/integrations/via/properties/${encodeURIComponent(property.externalId)}/import`, { method: "POST" });
      const payload = await response.json() as { propertyId?: string; imported?: boolean; message?: string };
      if (!response.ok || !payload.propertyId) throw new Error(payload.message || "Не удалось импортировать объект Via.");
      await loadProperties(); setSelectedId(payload.propertyId);
      setViaNotice(payload.imported ? "Объект импортирован в CRM и теперь доступен для редактирования." : "Этот объект уже находится в CRM.");
    } catch (cause) { setViaNotice(cause instanceof Error ? cause.message : "Не удалось импортировать объект Via."); }
    finally { setImportingViaId(null); }
  }

  function resetFilters() {
    setSearch(""); setSection("all"); setMyOnly(false); setCategory("all"); setDistrict("all"); setMaxPrice("");
  }

  function changeSection(next: CatalogSection) {
    setSection(next);
    setMyOnly(false);
    setCategory("all");
  }

  return (
    <section className={styles.page}>
      <header className={styles.topbar}>
        <h1>Объекты</h1>
        {section !== "primary" && <><label className={styles.search}><UiIcon name="search" /><input value={search} onChange={(event) => setSearch(event.target.value)} type="search" placeholder="Объект, адрес или код" /></label>
        <button className={styles.primaryButton} type="button" aria-label="Новый объект" onClick={() => setIsCreating(true)}><span aria-hidden="true">＋</span><span className={styles.actionLabel}>Новый объект</span></button></>}
      </header>

      <div className={styles.content}>
        <div className={styles.headingRow}>
          <div><span className={styles.eyebrow}>База недвижимости</span><h2>Каталог объектов</h2><p>Новостройки, доступные юниты и вторичная недвижимость</p></div>
          {section !== "primary" && <div className={styles.viewSwitch} aria-label="Режим отображения"><button className={view === "gallery" ? styles.viewActive : ""} type="button" onClick={() => setView("gallery")}>Галерея</button><button className={view === "table" ? styles.viewActive : ""} type="button" onClick={() => setView("table")}>Таблица</button></div>}
        </div>

        <div className={styles.catalogTabs} role="tablist" aria-label="Раздел каталога">
          <button className={section === "all" ? styles.catalogTabActive : ""} type="button" onClick={() => changeSection("all")}>Все</button>
          <button className={section === "primary" ? styles.catalogTabActive : ""} type="button" onClick={() => changeSection("primary")}>Новостройки</button>
          <button className={section === "secondary" ? styles.catalogTabActive : ""} type="button" onClick={() => changeSection("secondary")}>Вторичная недвижимость</button>
          <button className={section === "rent" ? styles.catalogTabActive : ""} type="button" onClick={() => changeSection("rent")}>Аренда</button>
          {viaEnabled && <button className={section === "via" ? styles.catalogTabActive : ""} type="button" onClick={() => changeSection("via")}>Via</button>}
          <button className={section === "archive" ? styles.catalogTabActive : ""} type="button" onClick={() => changeSection("archive")}>Архив{archivedProperties.length ? ` · ${archivedProperties.length}` : ""}</button>
        </div>
        {section === "primary" && <DevelopmentsCatalog />}
        {(section === "secondary" || section === "rent") && <div className={styles.propertyCatalogActions}><button type="button" aria-pressed={myOnly} onClick={() => setMyOnly((value) => !value)}>{myOnly ? "Все объекты" : "Мои объекты"}</button><PropertyExcelTransfer onImported={loadProperties} /></div>}

        {section !== "primary" && <><div className={styles.filters}>
          <FilterSelect label="Тип" value={category} onChange={(value) => setCategory(value as "all" | PropertyCategory)} options={["Квартира", "Дом", "Участок", "Коммерция"]} />
          <FilterSelect label="Район" value={district} onChange={setDistrict} options={["Приморский", "Киевский", "Пересыпский", "Хаджибейский"]} />
          <label className={styles.filter}><span>Цена до</span><input inputMode="numeric" value={maxPrice} onChange={(event) => setMaxPrice(event.target.value.replace(/\D/g, ""))} placeholder="Любая" /></label>
          <span className={styles.resultCount}>{resultTotal} из {catalogTotal}</span>
          {hasFilters && <button className={styles.resetButton} type="button" onClick={resetFilters}>Сбросить</button>}
        </div>
        {viaNotice && <p className={styles.viaNotice} role="status">{viaNotice}</p>}

        {loadState === "loading" || (section === "via" && viaState === "loading") ? <LoadingState /> : loadState === "error" ? <ErrorState onRetry={loadProperties} /> : section === "via" && viaState === "error" ? <ErrorState onRetry={loadViaProperties} /> : resultTotal ? (
          <div className={styles.catalogResults}>
            {visibleProperties.length > 0 && <CatalogGroup title={section === "archive" ? "Архив объектов" : section === "secondary" ? "Вторичная недвижимость" : section === "rent" ? "Аренда" : "Объекты"} description={section === "archive" ? "Объекты исключены из поиска и клиентских подборок" : "Квартиры, дома, участки и коммерческие помещения"} count={visibleProperties.length}>
              {view === "gallery" ? <div className={styles.gallery}>{visibleProperties.map((property) => <PropertyCard property={property} onOpen={() => setSelectedId(property.id)} key={property.id} />)}</div> : <PropertyTable properties={visibleProperties} onOpen={setSelectedId} />}
            </CatalogGroup>}
            {visibleViaProperties.length > 0 && <CatalogGroup title="Каталог Via" description="Внешние объекты. Импортируйте выбранный объект, чтобы редактировать его в CRM." count={visibleViaProperties.length}>
              {view === "gallery" ? <div className={styles.gallery}>{visibleViaProperties.map((property) => <ViaPropertyCard property={property} importedId={importedVia.get(property.externalId)} importing={importingViaId === property.externalId} onImport={() => { void importViaProperty(property); }} onOpenImported={(id) => setSelectedId(id)} key={property.externalId} />)}</div> : <ViaPropertyTable properties={visibleViaProperties} importedVia={importedVia} importingViaId={importingViaId} onImport={(property) => { void importViaProperty(property); }} onOpenImported={setSelectedId} />}
            </CatalogGroup>}
          </div>
        ) : <EmptyState onReset={resetFilters} hasFilters={hasFilters} archive={section === "archive"} />}</>}
      </div>

      {selectedProperty && <PropertyDrawer property={selectedProperty} onSave={saveProperty} onClose={() => setSelectedId(null)} onRefresh={loadProperties} onArchive={() => runPropertyLifecycle(selectedProperty.id, "archive")} onRestore={() => runPropertyLifecycle(selectedProperty.id, "restore")} onDelete={() => deleteProperty(selectedProperty.id)} canDelete={currentUser.organization.role !== "MANAGER"} />}
      {isCreating && <NewPropertyModal onCreate={createProperty} onClose={() => setIsCreating(false)} />}
    </section>
  );
}

function CatalogGroup({ title, description, count, children }: { title: string; description: string; count: number; children: ReactNode }) {
  return <section className={styles.catalogGroup}><header><div><h3>{title}</h3><p>{description}</p></div><span>{count}</span></header>{children}</section>;
}

function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return <label className={styles.filter}><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}><option value="all">Все</option>{options.map((option) => <option value={option} key={option}>{option}</option>)}</select></label>;
}

function PropertyCard({ property, onOpen }: { property: PropertyListing; onOpen: () => void }) {
  return <button className={styles.propertyCard} type="button" onClick={onOpen}>
    <div className={styles.propertyImage} role="img" aria-label={`Фото: ${property.title}`} style={{ backgroundImage: `linear-gradient(180deg, transparent 55%, rgba(20, 20, 18, .16)), url("${property.imageUrl}")` }}><span className={`${styles.status} ${property.archivedAt ? styles.statusArchived : styles[`status_${property.status}`]}`}>{property.archivedAt ? "В архиве" : property.status}</span>{property.sourceProvider === "VIA" ? <span className={styles.code}>Via → CRM</span> : <span className={styles.code}>{property.code}</span>}</div>
    <div className={styles.cardBody}><div className={styles.cardTitle}><h3>{property.title}</h3><span>›</span></div><p>{property.address}</p><div className={styles.tags}><span>{property.category}</span><span>{property.market}</span>{property.project && <span>{property.project}</span>}</div><div className={styles.cardFacts}><strong>{formatPrice(property)}</strong><span>{[property.rooms && `${property.rooms} комн.`, property.area !== null && `${property.area} м²`, property.floor && `${property.floor}/${property.totalFloors} эт.`].filter(Boolean).join(" · ")}</span></div></div>
  </button>;
}

function ViaPropertyCard({ property, importedId, importing, onImport, onOpenImported }: { property: ViaProperty; importedId?: string; importing: boolean; onImport: () => void; onOpenImported: (id: string) => void }) {
  return <article className={`${styles.propertyCard} ${styles.viaPropertyCard}`}>
    <div className={`${styles.propertyImage} ${!property.previewImageUrl ? styles.viaImagePlaceholder : ""}`} role="img" aria-label={`Фото: ${property.title}`} style={property.previewImageUrl ? { backgroundImage: `linear-gradient(180deg, transparent 55%, rgba(20, 20, 18, .16)), url("${property.previewImageUrl}")` } : undefined}><span className={styles.viaImagePill}>Via</span>{!property.previewImageUrl && <b>Фото не передано</b>}</div>
    <div className={styles.cardBody}><div className={styles.cardTitle}><h3>{property.title}</h3></div><p>{property.district || "Район не указан"}</p><div className={styles.tags}><span>{viaCategoryLabel(property.propertyType)}</span><span>{viaOperationLabel(property.operation)}</span><span>Внешний источник</span></div><div className={styles.cardFacts}><strong>{formatViaPrice(property)}</strong><span>{[property.rooms && `${property.rooms} комн.`, property.areaM2 != null && `${property.areaM2} м²`].filter(Boolean).join(" · ")}</span></div><div className={styles.viaCardActions}>{importedId ? <button type="button" onClick={() => onOpenImported(importedId)}>Открыть в CRM</button> : <button className={styles.viaImportButton} type="button" disabled={importing} onClick={onImport}>{importing ? "Импортируем…" : "Импортировать в CRM"}</button>}</div></div>
  </article>;
}

function ViaPropertyTable({ properties, importedVia, importingViaId, onImport, onOpenImported }: { properties: ViaProperty[]; importedVia: Map<string, string>; importingViaId: string | null; onImport: (property: ViaProperty) => void; onOpenImported: (id: string) => void }) {
  return <div className={styles.tableWrap}><table><thead><tr><th>Объект Via</th><th>Тип</th><th>Район</th><th>Параметры</th><th>Цена</th><th>Действие</th></tr></thead><tbody>{properties.map((property) => { const importedId = importedVia.get(property.externalId); return <tr className={styles.viaTableRow} key={property.externalId}><td><span className={`${styles.tableThumb} ${!property.previewImageUrl ? styles.viaImagePlaceholder : ""}`} style={property.previewImageUrl ? { backgroundImage: `url("${property.previewImageUrl}")` } : undefined} /><span><strong>{property.title}</strong><small>Via · {property.externalId}</small></span></td><td>{viaCategoryLabel(property.propertyType)}</td><td>{property.district || "—"}</td><td>{[property.rooms && `${property.rooms} комн.`, property.areaM2 != null && `${property.areaM2} м²`].filter(Boolean).join(" · ") || "—"}</td><td><strong>{formatViaPrice(property)}</strong></td><td>{importedId ? <button type="button" onClick={() => onOpenImported(importedId)}>Открыть в CRM</button> : <button type="button" disabled={importingViaId === property.externalId} onClick={() => onImport(property)}>{importingViaId === property.externalId ? "Импортируем…" : "Импортировать"}</button>}</td></tr>; })}</tbody></table></div>;
}

function PropertyTable({ properties, onOpen }: { properties: PropertyListing[]; onOpen: (id: string) => void }) {
  return <div className={styles.tableWrap}><table><thead><tr><th>Объект</th><th>Тип</th><th>Рынок</th><th>Район</th><th>Параметры</th><th>Цена</th><th>Статус</th></tr></thead><tbody>{properties.map((property) => <tr key={property.id} onClick={() => onOpen(property.id)}><td><span className={styles.tableThumb} style={{ backgroundImage: `url("${property.imageUrl}")` }} /><span><strong>{property.title}</strong><small>{property.sourceProvider === "VIA" ? "Via → CRM" : property.code} · {property.address}</small></span></td><td>{property.category}</td><td>{property.market}</td><td>{property.district}</td><td>{[property.rooms && `${property.rooms} комн.`, property.area !== null && `${property.area} м²`].filter(Boolean).join(" · ")}</td><td><strong>{formatPrice(property)}</strong></td><td><span className={`${styles.status} ${property.archivedAt ? styles.statusArchived : styles[`status_${property.status}`]}`}>{property.archivedAt ? "В архиве" : property.status}</span></td></tr>)}</tbody></table></div>;
}

function LoadingState() { return <div className={styles.emptyState}><span>◌</span><h3>Загружаем объекты</h3></div>; }
function ErrorState({ onRetry }: { onRetry: () => Promise<void> }) { return <div className={styles.emptyState}><span>!</span><h3>Не удалось загрузить объекты</h3><button type="button" onClick={() => { void onRetry(); }}>Повторить</button></div>; }
function EmptyState({ onReset, hasFilters, archive }: { onReset: () => void; hasFilters: boolean; archive: boolean }) { return <div className={styles.emptyState}><span><UiIcon name="search" /></span><h3>{archive ? "Архив пуст" : hasFilters ? "Объекты не найдены" : "Каталог пока пуст"}</h3><p>{archive ? "Перенесённые в архив объекты появятся здесь." : hasFilters ? "Измените параметры поиска или сбросьте фильтры." : "Добавьте первый объект в каталог."}</p>{hasFilters && !archive && <button type="button" onClick={onReset}>Сбросить фильтры</button>}</div>; }

export function formatPrice(property: Pick<PropertyListing, "price" | "currency" | "operation">) {
  const symbol = property.currency === "USD" ? "$" : property.currency === "EUR" ? "€" : "₴";
  if (property.price === null) return "Цена не указана";
  const value = new Intl.NumberFormat("ru-RU").format(property.price);
  return property.operation === "Аренда" ? `${symbol}${value} / мес.` : `${symbol}${value}`;
}

function viaCategoryLabel(value: string | null | undefined): PropertyCategory {
  const normalized = value?.toLowerCase() || "";
  if (normalized.includes("house") || normalized.includes("дом")) return "Дом";
  if (normalized.includes("land") || normalized.includes("участ")) return "Участок";
  if (normalized.includes("commercial") || normalized.includes("коммер")) return "Коммерция";
  return "Квартира";
}
function viaOperationLabel(value: string | null | undefined) { const normalized = value?.toLowerCase() || ""; return normalized.includes("rent") || normalized.includes("аренд") ? "Аренда" : "Продажа"; }
function formatViaPrice(property: Pick<ViaProperty, "price" | "currency" | "operation">) {
  if (property.price == null) return "Цена не указана";
  const currency = property.currency?.toUpperCase();
  const symbol = currency === "EUR" ? "€" : currency === "UAH" ? "₴" : "$";
  return `${symbol}${new Intl.NumberFormat("ru-RU").format(property.price)}${viaOperationLabel(property.operation) === "Аренда" ? " / мес." : ""}`;
}
