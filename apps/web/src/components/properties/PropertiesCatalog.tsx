"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { UiIcon } from "@/components/ui/UiIcon";
import type { PropertyCategory, PropertyListing } from "@/types/crm";
import { demoProjects, demoSecondaryProperties, type PropertyProject } from "./demoCatalog";
import { NewPropertyModal, type NewPropertyDraft } from "./NewPropertyModal";
import { ProjectDrawer, formatProjectPrice } from "./ProjectDrawer";
import { PropertyDrawer } from "./PropertyDrawer";
import styles from "./properties.module.css";

type ViewMode = "gallery" | "table";
type CatalogSection = "all" | "primary" | "secondary";

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
  const [section, setSection] = useState<CatalogSection>("all");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<"all" | PropertyCategory>("all");
  const [developer, setDeveloper] = useState("all");
  const [construction, setConstruction] = useState("all");
  const [operation, setOperation] = useState("all");
  const [district, setDistrict] = useState("all");
  const [maxPrice, setMaxPrice] = useState("");
  const [demoEnabled, setDemoEnabled] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  async function loadProperties() {
    setLoadState("loading");
    try {
      const response = await fetch("/api/crm/properties", { cache: "no-store" });
      const payload = await response.json() as { properties?: ApiProperty[] };
      if (!response.ok || !payload.properties) throw new Error("Invalid response");
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
    }).catch(() => { if (active) setLoadState("error"); });
    return () => { active = false; };
  }, []);

  const realPrimaryExists = properties.some((property) => property.market === "Первичный");
  const realSecondaryExists = properties.some((property) => property.market === "Вторичный");
  const shownProjects = useMemo(() => demoEnabled ? demoProjects : [], [demoEnabled]);
  const shownDemoSecondary = useMemo(() => demoEnabled && !realSecondaryExists ? demoSecondaryProperties : [], [demoEnabled, realSecondaryExists]);
  const catalogProperties = useMemo(() => [...properties, ...shownDemoSecondary], [properties, shownDemoSecondary]);
  const selectedProperty = catalogProperties.find((property) => property.id === selectedId);
  const selectedProject = shownProjects.find((project) => project.id === selectedProjectId);
  const isSelectedDemo = Boolean(selectedProperty?.id.startsWith("demo-"));
  const demoVisible = shownProjects.length > 0 || shownDemoSecondary.length > 0;

  const developers = useMemo(() => Array.from(new Set([
    ...shownProjects.map((project) => project.developer),
    ...catalogProperties.map((property) => property.developer).filter((value): value is string => Boolean(value)),
  ])).sort((a, b) => a.localeCompare(b, "ru")), [catalogProperties, shownProjects]);

  const visibleProperties = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("ru");
    return catalogProperties.filter((property) => {
      const matchesSearch = !query || [property.title, property.address, property.code, property.project, property.developer].some((value) => value?.toLocaleLowerCase("ru").includes(query));
      return property.status === "Доступен"
        && matchesSearch
        && (section === "all" || (section === "primary" ? property.market === "Первичный" : property.market === "Вторичный"))
        && (category === "all" || property.category === category)
        && (section !== "secondary" || operation === "all" || property.operation === operation)
        && (district === "all" || property.district === district)
        && (!maxPrice || property.price <= Number(maxPrice));
    });
  }, [catalogProperties, category, district, maxPrice, operation, search, section]);

  const visibleProjects = useMemo(() => {
    if (section === "secondary" || (category !== "all" && category !== "Квартира")) return [];
    const query = search.trim().toLocaleLowerCase("ru");
    return shownProjects.filter((project) => {
      const matchesSearch = !query || [project.title, project.address, project.city, project.district, project.developer].some((value) => value.toLocaleLowerCase("ru").includes(query));
      return project.units.some((unit) => unit.status === "Доступен")
        && matchesSearch
        && (developer === "all" || project.developer === developer)
        && (construction === "all" || project.status === construction)
        && (district === "all" || project.district === district)
        && (!maxPrice || project.priceFrom <= Number(maxPrice));
    });
  }, [category, construction, developer, district, maxPrice, search, section, shownProjects]);

  const hasFilters = Boolean(search || section !== "all" || category !== "all" || developer !== "all" || construction !== "all" || operation !== "all" || district !== "all" || maxPrice);
  const resultTotal = visibleProjects.length + visibleProperties.length;
  const catalogTotal = shownProjects.filter((project) => project.units.some((unit) => unit.status === "Доступен")).length
    + catalogProperties.filter((property) => property.status === "Доступен").length;

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
    if (next.id.startsWith("demo-")) return;
    const response = await fetch(`/api/crm/properties/${next.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(propertyPayload(next)) });
    const payload = await response.json() as { property?: ApiProperty; message?: string };
    if (!response.ok || !payload.property) throw new Error(payload.message || "Не удалось сохранить объект.");
    const property = mapApiProperty(payload.property);
    setProperties((current) => current.map((item) => item.id === property.id ? property : item));
  }

  function resetFilters() {
    setSearch(""); setSection("all"); setCategory("all"); setDeveloper("all"); setConstruction("all"); setOperation("all"); setDistrict("all"); setMaxPrice("");
  }

  function changeSection(next: CatalogSection) {
    setSection(next);
    setCategory("all");
    setDeveloper("all");
    setConstruction("all");
    setOperation("all");
  }

  return (
    <section className={styles.page}>
      <header className={styles.topbar}>
        <h1>Объекты</h1>
        <label className={styles.search}><UiIcon name="search" /><input value={search} onChange={(event) => setSearch(event.target.value)} type="search" placeholder="Объект, ЖК или застройщик" /></label>
        <button className={styles.primaryButton} type="button" aria-label="Новый объект" onClick={() => setIsCreating(true)}><span aria-hidden="true">＋</span><span className={styles.actionLabel}>Новый объект</span></button>
      </header>

      <div className={styles.content}>
        <div className={styles.headingRow}>
          <div><span className={styles.eyebrow}>База недвижимости</span><h2>Каталог объектов</h2><p>Новостройки, доступные юниты и вторичная недвижимость</p></div>
          <div className={styles.viewSwitch} aria-label="Режим отображения"><button className={view === "gallery" ? styles.viewActive : ""} type="button" onClick={() => setView("gallery")}>Галерея</button><button className={view === "table" ? styles.viewActive : ""} type="button" onClick={() => setView("table")}>Таблица</button></div>
        </div>

        <div className={styles.catalogTabs} role="tablist" aria-label="Раздел каталога">
          <button className={section === "all" ? styles.catalogTabActive : ""} type="button" onClick={() => changeSection("all")}>Все</button>
          <button className={section === "primary" ? styles.catalogTabActive : ""} type="button" onClick={() => changeSection("primary")}>Новостройки</button>
          <button className={section === "secondary" ? styles.catalogTabActive : ""} type="button" onClick={() => changeSection("secondary")}>Вторичная недвижимость</button>
        </div>

        <div className={styles.filters}>
          <FilterSelect label="Тип" value={category} onChange={(value) => setCategory(value as "all" | PropertyCategory)} options={section === "primary" ? ["Квартира", "Коммерция"] : ["Квартира", "Дом", "Участок", "Коммерция"]} />
          {section === "primary" && <FilterSelect label="Застройщик" value={developer} onChange={setDeveloper} options={developers} />}
          {section === "primary" && <FilterSelect label="Строительство" value={construction} onChange={setConstruction} options={["Строится", "Сдан"]} />}
          {section === "secondary" && <FilterSelect label="Операция" value={operation} onChange={setOperation} options={["Продажа", "Аренда"]} />}
          <FilterSelect label="Район" value={district} onChange={setDistrict} options={["Приморский", "Киевский", "Пересыпский", "Хаджибейский"]} />
          <label className={styles.filter}><span>Цена до</span><input inputMode="numeric" value={maxPrice} onChange={(event) => setMaxPrice(event.target.value.replace(/\D/g, ""))} placeholder="Любая" /></label>
          <span className={styles.resultCount}>{resultTotal} из {catalogTotal}</span>
          {hasFilters && <button className={styles.resetButton} type="button" onClick={resetFilters}>Сбросить</button>}
        </div>

        {demoVisible && <div className={styles.demoBanner}><span>Демо-каталог</span><p>Показываем примеры, пока соответствующий раздел не наполнен данными агентства.</p><button type="button" onClick={() => setDemoEnabled(false)}>Скрыть демо</button></div>}
        {!demoEnabled && (!realPrimaryExists || !realSecondaryExists) && <button className={styles.restoreDemo} type="button" onClick={() => setDemoEnabled(true)}>Показать демонстрационный каталог</button>}

        {loadState === "loading" ? <LoadingState /> : loadState === "error" ? <ErrorState onRetry={loadProperties} /> : resultTotal ? (
          <div className={styles.catalogResults}>
            {visibleProjects.length > 0 && <CatalogGroup title="Новостройки" description="Жилые комплексы и доступные предложения" count={visibleProjects.length}>
              {view === "gallery" ? <div className={styles.gallery}>{visibleProjects.map((project) => <ProjectCard project={project} onOpen={() => setSelectedProjectId(project.id)} key={project.id} />)}</div> : <ProjectTable projects={visibleProjects} onOpen={setSelectedProjectId} />}
            </CatalogGroup>}
            {visibleProperties.length > 0 && <CatalogGroup title={section === "primary" ? "Отдельные юниты" : section === "secondary" ? "Вторичная недвижимость" : "Отдельные объекты"} description={section === "primary" ? "Объекты первичного рынка вне проектного каталога" : "Квартиры, дома, участки и коммерческие помещения"} count={visibleProperties.length}>
              {view === "gallery" ? <div className={styles.gallery}>{visibleProperties.map((property) => <PropertyCard property={property} isDemo={property.id.startsWith("demo-")} onOpen={() => setSelectedId(property.id)} key={property.id} />)}</div> : <PropertyTable properties={visibleProperties} onOpen={setSelectedId} />}
            </CatalogGroup>}
          </div>
        ) : <EmptyState onReset={resetFilters} hasFilters={hasFilters} />}
      </div>

      {selectedProject && <ProjectDrawer project={selectedProject} onClose={() => setSelectedProjectId(null)} />}
      {selectedProperty && <PropertyDrawer property={selectedProperty} readOnly={isSelectedDemo} onSave={saveProperty} onClose={() => setSelectedId(null)} />}
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

function ProjectCard({ project, onOpen }: { project: PropertyProject; onOpen: () => void }) {
  const available = project.units.filter((unit) => unit.status === "Доступен").length;
  return <button className={`${styles.propertyCard} ${styles.projectCard}`} type="button" onClick={onOpen}>
    <div className={styles.propertyImage} role="img" aria-label={`Проект ${project.title}`} style={{ backgroundImage: `linear-gradient(180deg, transparent 55%, rgba(20, 20, 18, .16)), url("${project.imageUrl}")` }}><span className={styles.projectStatus}>{project.status}</span><span className={styles.demoImagePill}>Демо</span></div>
    <div className={styles.cardBody}><div className={styles.cardTitle}><h3>{project.title}</h3><span>›</span></div><p>{project.developer} · {project.city}, {project.district}</p><div className={styles.tags}><span>Новостройка</span><span>{project.completion}</span></div><div className={styles.cardFacts}><strong>от {formatProjectPrice(project.priceFrom, project.currency)}</strong><span>{available} доступно</span></div></div>
  </button>;
}

function PropertyCard({ property, onOpen, isDemo }: { property: PropertyListing; onOpen: () => void; isDemo: boolean }) {
  return <button className={styles.propertyCard} type="button" onClick={onOpen}>
    <div className={styles.propertyImage} role="img" aria-label={`Фото: ${property.title}`} style={{ backgroundImage: `linear-gradient(180deg, transparent 55%, rgba(20, 20, 18, .16)), url("${property.imageUrl}")` }}><span className={`${styles.status} ${styles[`status_${property.status}`]}`}>{property.status}</span>{isDemo ? <span className={styles.demoImagePill}>Демо</span> : <span className={styles.code}>{property.code}</span>}</div>
    <div className={styles.cardBody}><div className={styles.cardTitle}><h3>{property.title}</h3><span>›</span></div><p>{property.address}</p><div className={styles.tags}><span>{property.category}</span><span>{property.market}</span>{property.project && <span>{property.project}</span>}</div><div className={styles.cardFacts}><strong>{formatPrice(property)}</strong><span>{[property.rooms && `${property.rooms} комн.`, `${property.area} м²`, property.floor && `${property.floor}/${property.totalFloors} эт.`].filter(Boolean).join(" · ")}</span></div></div>
  </button>;
}

function ProjectTable({ projects, onOpen }: { projects: PropertyProject[]; onOpen: (id: string) => void }) {
  return <div className={styles.tableWrap}><table><thead><tr><th>Проект</th><th>Застройщик</th><th>Район</th><th>Срок сдачи</th><th>Доступно</th><th>Цена от</th><th>Статус</th></tr></thead><tbody>{projects.map((project) => <tr key={project.id} onClick={() => onOpen(project.id)}><td><span className={styles.tableThumb} style={{ backgroundImage: `url("${project.imageUrl}")` }} /><span><strong>{project.title}</strong><small>{project.address}</small></span></td><td>{project.developer}</td><td>{project.district}</td><td>{project.completion}</td><td>{project.units.filter((unit) => unit.status === "Доступен").length}</td><td><strong>{formatProjectPrice(project.priceFrom, project.currency)}</strong></td><td>{project.status}</td></tr>)}</tbody></table></div>;
}

function PropertyTable({ properties, onOpen }: { properties: PropertyListing[]; onOpen: (id: string) => void }) {
  return <div className={styles.tableWrap}><table><thead><tr><th>Объект</th><th>Тип</th><th>Рынок</th><th>Район</th><th>Параметры</th><th>Цена</th><th>Статус</th></tr></thead><tbody>{properties.map((property) => <tr key={property.id} onClick={() => onOpen(property.id)}><td><span className={styles.tableThumb} style={{ backgroundImage: `url("${property.imageUrl}")` }} /><span><strong>{property.title}</strong><small>{property.code} · {property.address}</small></span></td><td>{property.category}</td><td>{property.market}</td><td>{property.district}</td><td>{[property.rooms && `${property.rooms} комн.`, `${property.area} м²`].filter(Boolean).join(" · ")}</td><td><strong>{formatPrice(property)}</strong></td><td><span className={`${styles.status} ${styles[`status_${property.status}`]}`}>{property.status}</span></td></tr>)}</tbody></table></div>;
}

function LoadingState() { return <div className={styles.emptyState}><span>◌</span><h3>Загружаем объекты</h3></div>; }
function ErrorState({ onRetry }: { onRetry: () => Promise<void> }) { return <div className={styles.emptyState}><span>!</span><h3>Не удалось загрузить объекты</h3><button type="button" onClick={() => { void onRetry(); }}>Повторить</button></div>; }
function EmptyState({ onReset, hasFilters }: { onReset: () => void; hasFilters: boolean }) { return <div className={styles.emptyState}><span><UiIcon name="search" /></span><h3>{hasFilters ? "Объекты не найдены" : "Каталог пока пуст"}</h3><p>{hasFilters ? "Измените параметры поиска или сбросьте фильтры." : "Добавьте объект или включите демонстрационный каталог."}</p>{hasFilters && <button type="button" onClick={onReset}>Сбросить фильтры</button>}</div>; }

export function formatPrice(property: Pick<PropertyListing, "price" | "currency" | "operation">) {
  const symbol = property.currency === "USD" ? "$" : "€";
  const value = new Intl.NumberFormat("ru-RU").format(property.price);
  return property.operation === "Аренда" ? `${symbol}${value} / мес.` : `${symbol}${value}`;
}
