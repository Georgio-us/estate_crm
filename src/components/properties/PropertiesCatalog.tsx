"use client";

import { useMemo, useState } from "react";
import { mockProperties } from "@/data/mock-properties";
import type { PropertyCategory, PropertyListing, PropertyMarket, PropertyStatus } from "@/types/crm";
import { NewPropertyModal, type NewPropertyDraft } from "./NewPropertyModal";
import { PropertyDrawer } from "./PropertyDrawer";
import styles from "./properties.module.css";

type ViewMode = "gallery" | "table";

export function PropertiesCatalog() {
  const [properties, setProperties] = useState(mockProperties);
  const [view, setView] = useState<ViewMode>("gallery");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<"all" | PropertyCategory>("all");
  const [market, setMarket] = useState<"all" | PropertyMarket>("all");
  const [status, setStatus] = useState<"all" | PropertyStatus>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

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

  function createProperty(draft: NewPropertyDraft) {
    const property: PropertyListing = {
      id: `property-${Date.now()}`,
      code: `OD-${2300 + properties.length}`,
      title: draft.title,
      address: draft.address,
      district: draft.district,
      category: draft.category,
      market: draft.market,
      operation: draft.operation,
      status: "Доступен",
      price: Number(draft.price) || 0,
      currency: "USD",
      rooms: draft.rooms || undefined,
      area: Number(draft.area) || 0,
      project: draft.project || undefined,
      developer: draft.developer || undefined,
      description: draft.description || "Описание ещё не добавлено.",
      imageUrl: "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=1200&q=80",
      updatedAt: "Только что",
    };

    setProperties((current) => [property, ...current]);
    setIsCreating(false);
    setSelectedId(property.id);
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
        <button className={styles.primaryButton} type="button" onClick={() => setIsCreating(true)}>＋ Новый объект</button>
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

        {visibleProperties.length ? (
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

      {selectedProperty && <PropertyDrawer property={selectedProperty} onClose={() => setSelectedId(null)} />}
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
