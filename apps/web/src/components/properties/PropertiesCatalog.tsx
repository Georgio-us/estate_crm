"use client";

import { useEffect, useMemo, useState } from "react";
import type { PropertyCategory, PropertyListing, PropertyMarket, PropertyStatus } from "@/types/crm";
import { NewPropertyModal, type NewPropertyDraft } from "./NewPropertyModal";
import { PropertyDrawer } from "./PropertyDrawer";
import styles from "./properties.module.css";

type ViewMode = "gallery" | "table";

interface ApiProperty {
  id: string; code: string; title: string; address: string | null; district: string | null;
  category: "APARTMENT" | "HOUSE" | "LAND" | "COMMERCIAL"; market: "PRIMARY" | "SECONDARY";
  operation: "SALE" | "RENT"; status: "AVAILABLE" | "RESERVED" | "SOLD"; price: number;
  currency: "USD" | "EUR"; rooms: string | null; area: number; floor: number | null;
  totalFloors: number | null; landArea: number | null; project: string | null; developer: string | null;
  description: string | null; imageUrl: string | null; updatedAt: string;
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

function mapApiProperty(property: ApiProperty): PropertyListing {
  return {
    id: property.id, code: property.code, title: property.title, address: property.address || "Адрес не указан",
    district: property.district || "Не указан", category: categoryFromApi[property.category], market: marketFromApi[property.market],
    operation: operationFromApi[property.operation], status: statusFromApi[property.status], price: property.price,
    currency: property.currency, rooms: property.rooms || undefined, area: property.area, floor: property.floor || undefined,
    totalFloors: property.totalFloors || undefined, landArea: property.landArea || undefined, project: property.project || undefined,
    developer: property.developer || undefined, description: property.description || "Описание ещё не добавлено.",
    imageUrl: property.imageUrl || fallbackImage,
    updatedAt: new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(property.updatedAt)),
  };
}

function propertyPayload(property: PropertyListing | NewPropertyDraft) {
  return {
    title: property.title, address: property.address || null, district: property.district || null,
    category: categoryToApi[property.category], market: marketToApi[property.market], operation: operationToApi[property.operation],
    ...( "status" in property ? { status: statusToApi[property.status] } : {}),
    price: Number(property.price) || 0, currency: "currency" in property ? property.currency : "USD",
    rooms: property.rooms || null, area: Number(property.area) || 0,
    ...( "floor" in property ? { floor: property.floor || null, totalFloors: property.totalFloors || null, landArea: property.landArea || null, imageUrl: property.imageUrl || null } : {}),
    project: property.project || null, developer: property.developer || null, description: property.description || null,
  };
}

export function PropertiesCatalog() {
  const [properties, setProperties] = useState<PropertyListing[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [view, setView] = useState<ViewMode>("gallery");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<"all" | PropertyCategory>("all");
  const [market, setMarket] = useState<"all" | PropertyMarket>("all");
  const [status, setStatus] = useState<"all" | PropertyStatus>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  async function loadProperties() {
    setLoadState("loading");
    try {
      const response = await fetch("/api/crm/properties", { cache: "no-store" });
      const payload = await response.json() as { properties?: ApiProperty[] };
      if (!response.ok || !payload.properties) throw new Error();
      setProperties(payload.properties.map(mapApiProperty));
      setLoadState("ready");
    } catch { setLoadState("error"); }
  }

  useEffect(() => {
    let active = true;
    void fetch("/api/crm/properties", { cache: "no-store" }).then(async (response) => {
      const payload = await response.json() as { properties?: ApiProperty[] };
      if (!response.ok || !payload.properties) throw new Error();
      if (active) { setProperties(payload.properties.map(mapApiProperty)); setLoadState("ready"); }
    }, () => { if (active) setLoadState("error"); }).catch(() => { if (active) setLoadState("error"); });
    return () => { active = false; };
  }, []);

  const selectedProperty = properties.find((property) => property.id === selectedId);
  const visibleProperties = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("ru");
    return properties.filter((property) => {
      const matchesSearch = !query || [property.title, property.address, property.code, property.project, property.developer]
        .some((value) => value?.toLocaleLowerCase("ru").includes(query));
      return matchesSearch
        && (category === "all" || property.category === category)
        && (market === "all" || property.market === market)
        && (status === "all" || property.status === status);
    });
  }, [category, market, properties, search, status]);

  const hasFilters = Boolean(search || category !== "all" || market !== "all" || status !== "all");

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

  function resetFilters() {
    setSearch("");
    setCategory("all");
    setMarket("all");
    setStatus("all");
  }

  return (
    <section className={styles.page}>
      <header className={styles.topbar}>
        <h1>Объекты</h1>
        <label className={styles.search}>
          <span>⌕</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)} type="search" placeholder="Адрес, ЖК или номер объекта" />
        </label>
        <button className={styles.primaryButton} type="button" aria-label="Новый объект" onClick={() => setIsCreating(true)}>
          <span aria-hidden="true">＋</span><span className={styles.actionLabel}>Новый объект</span>
        </button>
      </header>

      <div className={styles.content}>
        <div className={styles.headingRow}>
          <div>
            <span className={styles.eyebrow}>База недвижимости</span>
            <h2>Все объекты</h2>
            <p>Первичная и вторичная недвижимость в едином каталоге</p>
          </div>
          <div className={styles.viewSwitch} aria-label="Режим отображения">
            <button className={view === "gallery" ? styles.viewActive : ""} type="button" onClick={() => setView("gallery")}>▦ Галерея</button>
            <button className={view === "table" ? styles.viewActive : ""} type="button" onClick={() => setView("table")}>☷ Таблица</button>
          </div>
        </div>

        <div className={styles.filters}>
          <FilterSelect label="Тип" value={category} onChange={(value) => setCategory(value as "all" | PropertyCategory)} options={["Квартира", "Дом", "Участок", "Коммерция"]} />
          <FilterSelect label="Рынок" value={market} onChange={(value) => setMarket(value as "all" | PropertyMarket)} options={["Первичный", "Вторичный"]} />
          <FilterSelect label="Статус" value={status} onChange={(value) => setStatus(value as "all" | PropertyStatus)} options={["Доступен", "Резерв", "Продан"]} />
          <span className={styles.resultCount}>{visibleProperties.length} из {properties.length}</span>
          {hasFilters && <button className={styles.resetButton} type="button" onClick={resetFilters}>Сбросить</button>}
        </div>

        {loadState === "loading" ? <div className={styles.emptyState}><span>◌</span><h3>Загружаем объекты</h3></div> : loadState === "error" ? <div className={styles.emptyState}><span>!</span><h3>Не удалось загрузить объекты</h3><button type="button" onClick={() => { void loadProperties(); }}>Повторить</button></div> : visibleProperties.length ? (
          view === "gallery" ? (
            <div className={styles.gallery}>
              {visibleProperties.map((property) => <PropertyCard property={property} onOpen={() => setSelectedId(property.id)} key={property.id} />)}
            </div>
          ) : (
            <PropertyTable properties={visibleProperties} onOpen={setSelectedId} />
          )
        ) : (
          <div className={styles.emptyState}><span>⌕</span><h3>Объекты не найдены</h3><p>Измените параметры поиска или сбросьте фильтры.</p><button type="button" onClick={resetFilters}>Сбросить фильтры</button></div>
        )}
      </div>

      {selectedProperty && <PropertyDrawer property={selectedProperty} onSave={saveProperty} onClose={() => setSelectedId(null)} />}
      {isCreating && <NewPropertyModal onCreate={createProperty} onClose={() => setIsCreating(false)} />}
    </section>
  );
}

function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return <label className={styles.filter}><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}><option value="all">Все</option>{options.map((option) => <option value={option} key={option}>{option}</option>)}</select></label>;
}

function PropertyCard({ property, onOpen }: { property: PropertyListing; onOpen: () => void }) {
  return (
    <button className={styles.propertyCard} type="button" onClick={onOpen}>
      <div className={styles.propertyImage} role="img" aria-label={`Фото: ${property.title}`} style={{ backgroundImage: `linear-gradient(180deg, transparent 55%, rgba(20, 20, 18, .16)), url("${property.imageUrl}")` }}>
        <span className={`${styles.status} ${styles[`status_${property.status}`]}`}>{property.status}</span>
        <span className={styles.code}>{property.code}</span>
      </div>
      <div className={styles.cardBody}>
        <div className={styles.cardTitle}><h3>{property.title}</h3><span>›</span></div>
        <p>{property.address}</p>
        <div className={styles.tags}><span>{property.category}</span><span>{property.market}</span>{property.project && <span>{property.project}</span>}</div>
        <div className={styles.cardFacts}>
          <strong>{formatPrice(property)}</strong>
          <span>{[property.rooms && `${property.rooms} комн.`, `${property.area} м²`, property.floor && `${property.floor}/${property.totalFloors} эт.`].filter(Boolean).join(" · ")}</span>
        </div>
      </div>
    </button>
  );
}

function PropertyTable({ properties, onOpen }: { properties: PropertyListing[]; onOpen: (id: string) => void }) {
  return (
    <div className={styles.tableWrap}>
      <table>
        <thead><tr><th>Объект</th><th>Тип</th><th>Рынок</th><th>Район</th><th>Параметры</th><th>Цена</th><th>Статус</th></tr></thead>
        <tbody>{properties.map((property) => (
          <tr key={property.id} onClick={() => onOpen(property.id)}>
            <td><span className={styles.tableThumb} style={{ backgroundImage: `url("${property.imageUrl}")` }} /><span><strong>{property.title}</strong><small>{property.code} · {property.address}</small></span></td>
            <td>{property.category}</td><td>{property.market}</td><td>{property.district}</td>
            <td>{[property.rooms && `${property.rooms} комн.`, `${property.area} м²`].filter(Boolean).join(" · ")}</td>
            <td><strong>{formatPrice(property)}</strong></td>
            <td><span className={`${styles.status} ${styles[`status_${property.status}`]}`}>{property.status}</span></td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

export function formatPrice(property: Pick<PropertyListing, "price" | "currency" | "operation">) {
  const symbol = property.currency === "USD" ? "$" : "€";
  const value = new Intl.NumberFormat("ru-RU").format(property.price);
  return property.operation === "Аренда" ? `${symbol}${value} / мес.` : `${symbol}${value}`;
}
