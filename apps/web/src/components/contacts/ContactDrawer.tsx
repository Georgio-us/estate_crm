import { useState } from "react";
import type { ActivityEvent, Contact } from "@/types/crm";
import type { RelatedDeal } from "./ContactsDirectory";
import styles from "./contacts.module.css";

const icons = { note: "≡", task: "✓", change: "↔", source: "↗", object: "⌂" };
const sourceLabels = { Meta: "Meta", Website: "Сайт", Manual: "Вручную" };

export function ContactDrawer({ contact, deals, activities, onAddNote, onClose }: { contact: Contact; deals: RelatedDeal[]; activities: ActivityEvent[]; onAddNote: (text: string) => void; onClose: () => void }) {
  const [note, setNote] = useState("");
  function submitNote() { if (!note.trim()) return; onAddNote(note.trim()); setNote(""); }

  return (
    <div className={styles.drawerLayer}>
      <button className={styles.backdrop} type="button" onClick={onClose} aria-label="Закрыть карточку контакта" />
      <aside className={styles.drawer} role="dialog" aria-modal="true" aria-label={`Контакт ${contact.name}`}>
        <header className={styles.drawerHeader}>
          <div className={styles.identity}><span className={styles.largeAvatar}>{contact.name.slice(0, 1)}</span><div><span>Карточка контакта</span><h2>{contact.name}</h2><p>Добавлен {contact.createdAt}</p></div></div>
          <div className={styles.headerActions}><button type="button" aria-label="Меню контакта">•••</button><button type="button" onClick={onClose} aria-label="Закрыть">×</button></div>
        </header>
        <div className={styles.drawerWorkspace}>
          <div className={styles.detailsPane}>
            <section><h3>Контактные данные</h3><Fact label="Телефон" value={contact.phone || "Не указан"} link={contact.phone ? `tel:${contact.phone.replaceAll(" ", "")}` : undefined} /><Fact label="Telegram" value={contact.telegram || "Не указан"} /><Fact label="Email" value={contact.email || "Не указан"} /></section>
            <section><h3>CRM</h3><Fact label="Ответственный" value={contact.assignee} /><Fact label="Источник" value={sourceLabels[contact.source]} /><Fact label="Последний контакт" value={contact.lastContact} /></section>
            {contact.comment && <section><h3>Комментарий</h3><p className={styles.comment}>{contact.comment}</p></section>}
            <section className={styles.dealsSection}><div className={styles.sectionTitle}><h3>Связанные сделки</h3><span>{deals.length}</span></div>{deals.length ? deals.map(({ deal, stageTitle, stageColor }) => <article className={styles.dealRow} key={deal.id}><span className={styles.dealColor} style={{ background: stageColor }} /><div><strong>{deal.request}</strong><small>Сделка #{deal.number} · {stageTitle}</small></div><span>{deal.budget || "Без бюджета"}</span></article>) : <div className={styles.noDeals}>У контакта пока нет сделок<button type="button">＋ Создать сделку</button></div>}</section>
          </div>
          <div className={styles.activityPane}>
            <div className={styles.activityHeader}><div><h3>История взаимодействия</h3><span>{activities.length} событий по контакту</span></div><button type="button">＋ Задача</button></div>
            <div className={styles.feed}><div className={styles.dateDivider}><span>История контакта</span></div>{activities.length ? <div className={styles.timeline}>{activities.map((event) => <article className={styles.event} key={event.id}><span className={styles.eventIcon}>{icons[event.category]}</span><div><strong>{event.title}</strong>{event.description && <p>{event.description}</p>}{event.author && <small>{event.author}</small>}</div><time>{event.occurredAt}</time></article>)}</div> : <div className={styles.emptyHistory}>История появится после первого действия</div>}</div>
            <div className={styles.composer}><span>Примечание</span><textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Добавить примечание о контакте…" /><div><button type="button">＋</button><button className={styles.saveButton} type="button" disabled={!note.trim()} onClick={submitNote}>Сохранить</button></div></div>
          </div>
        </div>
      </aside>
    </div>
  );
}

function Fact({ label, value, link }: { label: string; value: string; link?: string }) {
  return <div className={styles.fact}><span>{label}</span>{link ? <a href={link}>{value}</a> : <strong>{value}</strong>}</div>;
}
