import { useMemo, useState } from "react";
import type { PropertyProject, ProjectUnit } from "./demoCatalog";
import styles from "./properties.module.css";

export function ProjectDrawer({ project, onClose }: { project: PropertyProject; onClose: () => void }) {
  const [availability, setAvailability] = useState<"all" | ProjectUnit["status"]>("all");
  const [rooms, setRooms] = useState("all");
  const units = useMemo(() => project.units.filter((unit) =>
    (availability === "all" || unit.status === availability) && (rooms === "all" || String(unit.rooms) === rooms)
  ), [availability, project.units, rooms]);
  const availableCount = project.units.filter((unit) => unit.status === "Доступен").length;

  return (
    <div className={styles.drawerLayer}>
      <button className={styles.drawerBackdrop} type="button" onClick={onClose} aria-label="Закрыть карточку проекта" />
      <aside className={`${styles.drawer} ${styles.projectDrawer}`} role="dialog" aria-modal="true" aria-label={`Проект ${project.title}`}>
        <header className={styles.drawerHeader}>
          <div><span>Объекты / Новостройки</span><h2>{project.title}</h2><p>{project.developer} · {project.city}, {project.district}</p></div>
          <div><span className={styles.demoPill}>Демо</span><button type="button" onClick={onClose} aria-label="Закрыть">×</button></div>
        </header>
        <div className={styles.projectDrawerBody}>
          <div className={styles.projectHero} style={{ backgroundImage: `linear-gradient(180deg, transparent 45%, rgba(14, 18, 22, .58)), url("${project.imageUrl}")` }}>
            <div><span>{project.status}</span><h3>{project.title}</h3><p>{project.address}</p></div>
          </div>

          <section className={styles.projectOverview}>
            <div className={styles.projectIntro}><span className={styles.eyebrow}>О проекте</span><p>{project.description}</p></div>
            <div className={styles.projectStats}>
              <ProjectFact label="Цена от" value={formatProjectPrice(project.priceFrom, project.currency)} />
              <ProjectFact label="Доступно" value={`${availableCount} ${unitWord(availableCount)}`} />
              <ProjectFact label="Срок сдачи" value={project.completion} />
              <ProjectFact label="Застройщик" value={project.developer} />
            </div>
          </section>

          <section className={styles.unitsSection}>
            <div className={styles.unitsHeading}>
              <div><span className={styles.eyebrow}>Предложения</span><h3>Юниты</h3><p>{project.units.length} вариантов в проекте</p></div>
              <div className={styles.unitFilters}>
                <label><span>Статус</span><select value={availability} onChange={(event) => setAvailability(event.target.value as typeof availability)}><option value="all">Все</option><option>Доступен</option><option>Резерв</option><option>Продан</option></select></label>
                <label><span>Комнаты</span><select value={rooms} onChange={(event) => setRooms(event.target.value)}><option value="all">Все</option><option value="1">1</option><option value="2">2</option><option value="3">3</option></select></label>
              </div>
            </div>
            <div className={`${styles.tableWrap} ${styles.unitsTable}`}>
              <table>
                <thead><tr><th>Юнит</th><th>Статус</th><th>Комнаты</th><th>Этаж</th><th>Площадь</th><th>Терраса</th><th>Ориентация</th><th>Цена</th><th>Обновлён</th></tr></thead>
                <tbody>{units.map((unit) => <tr key={unit.id}><td><strong>{unit.name}</strong></td><td><span className={`${styles.status} ${styles[`status_${unit.status}`]}`}>{unit.status}</span></td><td>{unit.rooms}</td><td>{unit.floor}</td><td>{unit.area} м²</td><td>{unit.terraceArea ? `${unit.terraceArea} м²` : "—"}</td><td>{unit.orientation}</td><td><strong>{formatProjectPrice(unit.price, unit.currency)}</strong></td><td>{unit.updatedAt}</td></tr>)}</tbody>
              </table>
            </div>
            {!units.length && <div className={styles.unitsEmpty}>По выбранным параметрам юнитов нет.</div>}
          </section>
        </div>
      </aside>
    </div>
  );
}

function ProjectFact({ label, value }: { label: string; value: string }) {
  return <div><span>{label}</span><strong>{value}</strong></div>;
}

export function formatProjectPrice(price: number, currency: "USD" | "EUR" | "UAH") {
  return `${currency === "USD" ? "$" : currency === "EUR" ? "€" : "₴"}${new Intl.NumberFormat("ru-RU").format(price)}`;
}

function unitWord(count: number) {
  if (count === 1) return "юнит";
  if (count > 1 && count < 5) return "юнита";
  return "юнитов";
}
