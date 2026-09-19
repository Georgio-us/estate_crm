"use client";

import { useEffect, useMemo, useState } from "react";

import type { PublicSelectionItem } from "./types";
import styles from "./page.module.css";

const categoryLabels = { APARTMENT: "Квартира", HOUSE: "Дом", LAND: "Участок", COMMERCIAL: "Коммерция" } as const;

function images(item: PublicSelectionItem) {
  if (item.photos.length) return item.photos.map((photo) => photo.url);
  if (item.imageUrl && !item.imageUrl.startsWith("/api/crm/")) return [item.imageUrl];
  return [];
}

function operationLabel(operation: PublicSelectionItem["operation"]) {
  if (operation === "RENT") return "Аренда";
  if (operation === "SALE") return "Продажа";
  return "Объект";
}

function facts(item: PublicSelectionItem) {
  const result: string[] = [];
  if (item.category) result.push(categoryLabels[item.category]);
  if (item.rooms) result.push(`${item.rooms} комн.`);
  if (item.area !== null) result.push(`${item.area} м²`);
  if (item.category === "HOUSE" && item.totalFloors) result.push(`${item.totalFloors} эт.`);
  else if (item.floor !== null) result.push(`${item.floor}${item.totalFloors ? `/${item.totalFloors}` : ""} эт.`);
  if (item.landArea !== null) result.push(`${item.landArea} сот.`);
  return result;
}

export function PublicSelectionGallery({ items }: { items: PublicSelectionItem[] }) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [photoIndex, setPhotoIndex] = useState(0);
  const active = useMemo(() => items.find((item) => item.id === activeId) ?? null, [activeId, items]);
  const activeImages = active ? images(active) : [];

  useEffect(() => {
    if (!active) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setActiveId(null);
      if (event.key === "ArrowLeft" && activeImages.length > 1) setPhotoIndex((value) => (value - 1 + activeImages.length) % activeImages.length);
      if (event.key === "ArrowRight" && activeImages.length > 1) setPhotoIndex((value) => (value + 1) % activeImages.length);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => { document.body.style.overflow = previous; window.removeEventListener("keydown", onKeyDown); };
  }, [active, activeImages.length]);

  function open(item: PublicSelectionItem) { setPhotoIndex(0); setActiveId(item.id); }
  function changePhoto(step: number) { setPhotoIndex((value) => (value + step + activeImages.length) % activeImages.length); }

  return <>
    <div className={styles.grid}>{items.map((item) => {
      const itemImages = images(item);
      const itemFacts = facts(item);
      return <button className={styles.card} type="button" onClick={() => open(item)} key={item.id}>
        <span className={styles.image}>{itemImages[0] ? <span className={styles.imageFill} style={{ backgroundImage: `url(${JSON.stringify(itemImages[0])})` }} /> : <span>Фото уточнит менеджер</span>}{itemImages.length > 1 && <i>{itemImages.length} фото</i>}</span>
        <span className={styles.body}>
          <span className={styles.cardTopline}>{operationLabel(item.operation)}{item.district ? ` · ${item.district}` : ""}</span>
          <h3>{item.title}</h3>
          {itemFacts.length > 0 ? <span className={styles.facts}>{itemFacts.map((fact) => <span key={fact}>{fact}</span>)}</span> : <p>{item.subtitle || "Подробности уточнит ваш менеджер."}</p>}
          <span className={styles.cardBottom}><strong>{item.priceLabel || "Цена по запросу"}</strong><span>Подробнее →</span></span>
        </span>
      </button>;
    })}</div>

    {active && <div className={styles.modalLayer} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setActiveId(null); }}>
      <section className={styles.modal} role="dialog" aria-modal="true" aria-label={active.title}>
        <button className={styles.modalClose} type="button" aria-label="Закрыть" onClick={() => setActiveId(null)}>×</button>
        <div className={styles.modalMedia}>
          {activeImages[photoIndex] ? <span className={styles.modalImage} role="img" aria-label={`${active.title}, фото ${photoIndex + 1}`} style={{ backgroundImage: `url(${JSON.stringify(activeImages[photoIndex])})` }} /> : <span>Фотографии уточнит менеджер</span>}
          {activeImages.length > 1 && <>
            <button className={`${styles.photoArrow} ${styles.photoPrev}`} type="button" aria-label="Предыдущее фото" onClick={() => changePhoto(-1)}>‹</button>
            <button className={`${styles.photoArrow} ${styles.photoNext}`} type="button" aria-label="Следующее фото" onClick={() => changePhoto(1)}>›</button>
            <span className={styles.photoCount}>{photoIndex + 1} / {activeImages.length}</span>
          </>}
        </div>
        <div className={styles.modalBody}>
          <span className={styles.modalEyebrow}>{operationLabel(active.operation)}{active.district ? ` · ${active.district}` : ""}</span>
          <h2>{active.title}</h2>
          {active.address && <p className={styles.address}>{active.address}</p>}
          <strong className={styles.modalPrice}>{active.priceLabel || "Цена по запросу"}</strong>
          {facts(active).length > 0 && <div className={styles.modalFacts}>{facts(active).map((fact) => <span key={fact}>{fact}</span>)}</div>}
          <div className={styles.description}><h3>Об объекте</h3><p>{active.description || active.subtitle || "Подробное описание уточнит ваш менеджер."}</p></div>
        </div>
      </section>
    </div>}
  </>;
}
