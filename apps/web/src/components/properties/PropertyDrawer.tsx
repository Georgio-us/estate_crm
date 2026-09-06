import type { PropertyListing } from "@/types/crm";
import styles from "./properties.module.css";

export function PropertyDrawer({ property, onClose }: { property: PropertyListing; onClose: () => void }) {
  return (
    <div className={styles.drawerLayer}>
      <button className={styles.drawerBackdrop} type="button" onClick={onClose} aria-label="Закрыть карточку объекта" />
      <aside className={styles.drawer} role="dialog" aria-modal="true" aria-label={`Объект ${property.title}`}>
        <header className={styles.drawerHeader}>
          <div><span>Объекты / {property.category}</span><h2>{property.title}</h2><p>{property.code} · обновлён {property.updatedAt}</p></div>
          <div><button type="button" aria-label="Меню объекта">•••</button><button type="button" onClick={onClose} aria-label="Закрыть">×</button></div>
        </header>
        <div className={styles.drawerBody}>
          <div className={styles.visualPane}>
            <div className={styles.heroImage} role="img" aria-label={`Фото: ${property.title}`} style={{ backgroundImage: `url("${property.imageUrl}")` }} />
            <div className={styles.thumbnailRow}><span style={{ backgroundImage: `url("${property.imageUrl}")` }} /><button type="button">＋ Добавить фото</button></div>
            <section className={styles.description}><h3>Описание</h3><p>{property.description}</p></section>
          </div>
          <div className={styles.propertyPane}>
            <div className={styles.priceBlock}><span>{property.operation}</span><strong>{formatPrice(property)}</strong><span className={`${styles.status} ${styles[`status_${property.status}`]}`}>{property.status}</span></div>
            <section className={styles.factSection}>
              <h3>Характеристики</h3>
              <Fact label="Тип объекта" value={property.category} />
              <Fact label="Рынок" value={property.market} />
              <Fact label="Площадь" value={`${property.area} м²`} />
              {property.rooms && <Fact label="Комнаты" value={property.rooms} />}
              {property.floor && <Fact label="Этаж" value={`${property.floor} из ${property.totalFloors}`} />}
              {property.landArea && <Fact label="Участок" value={`${property.landArea} сот.`} />}
            </section>
            <section className={styles.factSection}>
              <h3>Расположение</h3>
              <Fact label="Адрес" value={property.address} />
              <Fact label="Район" value={property.district} />
            </section>
            {(property.project || property.developer) && <section className={styles.factSection}><h3>Новостройка</h3>{property.project && <Fact label="Жилой комплекс" value={property.project} />}{property.developer && <Fact label="Застройщик" value={property.developer} />}</section>}
            <button className={styles.offerButton} type="button">Предложить клиенту</button>
          </div>
        </div>
      </aside>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div className={styles.fact}><span>{label}</span><strong>{value}</strong></div>;
}

function formatPrice(property: Pick<PropertyListing, "price" | "currency" | "operation">) {
  const symbol = property.currency === "USD" ? "$" : "€";
  const value = new Intl.NumberFormat("ru-RU").format(property.price);
  return property.operation === "Аренда" ? `${symbol}${value} / мес.` : `${symbol}${value}`;
}
