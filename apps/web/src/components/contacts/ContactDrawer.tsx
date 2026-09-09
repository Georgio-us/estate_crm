import { useState } from "react";
import type { ActivityEvent, Contact } from "@/types/crm";
import { isValidPhone } from "@/lib/phone";
import type { RelatedDeal } from "./ContactsDirectory";
import styles from "./contacts.module.css";

const icons = { note: "≡", task: "✓", change: "↔", source: "↗", object: "⌂" };
const historyPageSize = 7;

export function ContactDrawer({ contact, contacts, deals, activities, assignees, onSave, onAddNote, onLinkContact, onUnlinkContact, onCreateDeal, onCreateTask, onClose }: { contact: Contact; contacts: Contact[]; deals: RelatedDeal[]; activities: ActivityEvent[]; assignees: Array<{ id: string; name: string }>; onSave: (contact: Contact) => Promise<Contact>; onAddNote: (text: string) => Promise<void>; onLinkContact: (contactId: string, label?: string) => Promise<void>; onUnlinkContact: (contactId: string) => Promise<void>; onCreateDeal: () => void; onCreateTask: () => void; onClose: () => void }) {
  const [note, setNote] = useState("");
  const [noteError, setNoteError] = useState("");
  const [isNoteSaving, setIsNoteSaving] = useState(false);
  const [draft, setDraft] = useState(contact);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveAttempted, setSaveAttempted] = useState(false);
  const [relationPickerOpen, setRelationPickerOpen] = useState(false);
  const [relatedContactId, setRelatedContactId] = useState("");
  const [relationLabel, setRelationLabel] = useState("");
  const [relationError, setRelationError] = useState("");
  const [relationBusy, setRelationBusy] = useState(false);
  const [visibleActivityCount, setVisibleActivityCount] = useState(historyPageSize);
  const editable = (value: Contact) => ({ name: value.name, phone: value.phone, email: value.email, telegram: value.telegram, source: value.source, assigneeId: value.assigneeId, comment: value.comment });
  const isDirty = JSON.stringify(editable(draft)) !== JSON.stringify(editable(contact));
  const emailIsValid = !draft.email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email);
  const phoneIsValid = isValidPhone(draft.phone || "");
  const validationError = !phoneIsValid ? "Введите корректный номер телефона." : !emailIsValid ? "Введите корректный email-адрес." : "";

  function update(patch: Partial<Contact>) { setDraft((current) => ({ ...current, ...patch })); }
  function discard() { setDraft(contact); setSaveError(""); setSaveAttempted(false); }
  async function save() {
    setSaveAttempted(true);
    if (!isDirty || isSaving || !draft.name.trim() || !emailIsValid || !phoneIsValid) return;
    setIsSaving(true);
    setSaveError("");
    try { setDraft(await onSave({ ...draft, name: draft.name.trim() })); setSaveAttempted(false); }
    catch (cause) { setSaveError(cause instanceof Error ? cause.message : "Не удалось сохранить контакт."); }
    finally { setIsSaving(false); }
  }
  async function linkContact() {
    if (!relatedContactId || relationBusy) return;
    setRelationBusy(true);
    setRelationError("");
    try {
      await onLinkContact(relatedContactId, relationLabel.trim() || undefined);
      setRelatedContactId("");
      setRelationLabel("");
      setRelationPickerOpen(false);
    } catch (cause) {
      setRelationError(cause instanceof Error ? cause.message : "Не удалось связать контакты.");
    } finally {
      setRelationBusy(false);
    }
  }
  async function unlinkContact(contactId: string) {
    if (relationBusy) return;
    setRelationBusy(true);
    setRelationError("");
    try { await onUnlinkContact(contactId); }
    catch (cause) { setRelationError(cause instanceof Error ? cause.message : "Не удалось удалить связь."); }
    finally { setRelationBusy(false); }
  }
  const relatedContacts = contact.relatedContacts || [];
  const availableContacts = contacts.filter((item) => item.id !== contact.id && !relatedContacts.some((related) => related.id === item.id));
  const visibleActivities = activities.slice(0, visibleActivityCount);
  async function submitNote() {
    if (!note.trim() || isNoteSaving) return;
    setIsNoteSaving(true);
    setNoteError("");
    try {
      await onAddNote(note.trim());
      setNote("");
    } catch (cause) {
      setNoteError(cause instanceof Error ? cause.message : "Не удалось сохранить примечание.");
    } finally {
      setIsNoteSaving(false);
    }
  }

  return (
    <div className={styles.drawerLayer}>
      <button className={styles.backdrop} type="button" onClick={onClose} aria-label="Закрыть карточку контакта" />
      <aside className={styles.drawer} role="dialog" aria-modal="true" aria-label={`Контакт ${contact.name}`}>
        <header className={styles.drawerHeader}>
          <div className={styles.identity}><span className={styles.largeAvatar}>{draft.name.slice(0, 1)}</span><div><span>Карточка контакта</span><input className={styles.contactTitleInput} value={draft.name} onChange={(event) => update({ name: event.target.value })} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void save(); } }} aria-label="Имя контакта" /><p>Добавлен {contact.createdAt}</p></div></div>
          <div className={styles.headerActions}><button type="button" aria-label="Меню контакта">•••</button><button type="button" onClick={onClose} aria-label="Закрыть">×</button></div>
        </header>
        <div className={styles.drawerWorkspace}>
          <div className={styles.detailsPane}>
            <section><h3>Контактные данные</h3><FactInput label="Телефон" value={draft.phone || ""} placeholder="Обязательное поле" type="tel" invalid={saveAttempted && !phoneIsValid} onChange={(value) => update({ phone: value })} onCommit={() => { void save(); }} /><FactInput label="Telegram" value={draft.telegram || ""} placeholder="Не указан" onChange={(value) => update({ telegram: value || undefined })} onCommit={() => { void save(); }} /><FactInput label="Email" value={draft.email || ""} placeholder="Не указан" type="email" invalid={saveAttempted && !emailIsValid} onChange={(value) => update({ email: value || undefined })} onCommit={() => { void save(); }} /></section>
            <section><h3>CRM</h3><FactSelect label="Ответственный" value={draft.assigneeId || ""} options={[{ value: "", label: "Не назначен" }, ...assignees.map((item) => ({ value: item.id, label: item.name }))]} onChange={(value) => update({ assigneeId: value || undefined, assignee: assignees.find((item) => item.id === value)?.name || "Не назначен" })} /><FactSelect label="Источник" value={draft.source} options={[{ value: "Manual", label: "Не указан" }, { value: "Meta", label: "Meta" }, { value: "Website", label: "Сайт" }]} onChange={(value) => update({ source: value as Contact["source"] })} /><Fact label="Последний контакт" value={contact.lastContact} /></section>
            <section><h3>Комментарий</h3><textarea className={styles.contactCommentInput} value={draft.comment || ""} onChange={(event) => update({ comment: event.target.value || undefined })} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void save(); } }} placeholder="Добавить комментарий" /><small className={styles.keyboardHint}>Enter — сохранить · Shift+Enter — новая строка</small></section>
            <section className={styles.relationsSection}><div className={styles.sectionTitle}><h3>Связанные контакты</h3><span>{contact.relatedContacts.length}</span></div>{contact.relatedContacts.map((related) => <div className={styles.relationRow} key={related.id}><span className={styles.avatar}>{related.name.slice(0, 1)}</span><div><strong>{related.name}</strong><small>{related.label || related.phone || "Связанный клиент"}</small></div><button type="button" disabled={relationBusy} onClick={() => { void unlinkContact(related.id); }} aria-label={`Удалить связь с ${related.name}`}>×</button></div>)}{relationPickerOpen ? <div className={styles.relationPicker}><div className={styles.relationChoices}>{availableContacts.map((item) => <button className={relatedContactId === item.id ? styles.relationChoiceActive : ""} type="button" key={item.id} onClick={() => setRelatedContactId(item.id)}><strong>{item.name}</strong><small>{item.phone || "Телефон не указан"}</small></button>)}</div><input value={relationLabel} onChange={(event) => setRelationLabel(event.target.value)} placeholder="Кем приходится — необязательно" /><div><button type="button" onClick={() => setRelationPickerOpen(false)}>Отмена</button><button type="button" disabled={!relatedContactId || relationBusy} onClick={() => { void linkContact(); }}>{relationBusy ? "Добавляем…" : "Связать"}</button></div></div> : <button className={styles.addRelationButton} type="button" disabled={!availableContacts.length} onClick={() => setRelationPickerOpen(true)}>＋ {availableContacts.length ? "Связать с контактом" : "Нет доступных контактов"}</button>}{relationError && <p className={styles.noteError}>{relationError}</p>}</section>
            <section className={styles.dealsSection}><div className={styles.sectionTitle}><h3>Связанные сделки</h3><span>{deals.length}</span></div>{deals.length ? deals.map(({ deal, stageTitle, stageColor }) => <article className={styles.dealRow} key={deal.id}><span className={styles.dealColor} style={{ background: stageColor }} /><div><strong>{deal.title || deal.request}</strong><small>Сделка #{deal.number} · {stageTitle}</small></div><span>{deal.budget || "Без бюджета"}</span></article>) : <div className={styles.noDeals}>У контакта пока нет сделок</div>}<button className={styles.addRelationButton} type="button" onClick={onCreateDeal}>＋ Создать сделку</button></section>
            {isDirty && <div className={styles.contactSaveBar}><span>{(saveAttempted && validationError) || saveError || "Есть несохранённые изменения"}</span><button type="button" onClick={discard} disabled={isSaving}>Отменить</button><button type="button" onClick={() => { void save(); }} disabled={isSaving || !draft.name.trim()}>{isSaving ? "Сохраняем…" : "Сохранить"}</button></div>}
          </div>
          <div className={styles.activityPane}>
            <div className={styles.activityHeader}><div><h3>История взаимодействия</h3><span>{activities.length} событий по контакту</span></div><button type="button" onClick={onCreateTask}>＋ Задача</button></div>
            <div className={styles.feed}><div className={styles.dateDivider}><span>История контакта</span></div>{activities.length ? <><div className={styles.timeline}>{visibleActivities.map((event) => <article className={styles.event} key={event.id}><span className={styles.eventIcon}>{icons[event.category]}</span><div><strong>{event.title}</strong>{event.description && <p>{event.description}</p>}{event.author && <small>{event.author}</small>}</div><time>{event.occurredAt}</time></article>)}</div>{activities.length > visibleActivityCount && <button className={styles.showMoreHistory} type="button" onClick={() => setVisibleActivityCount((count) => count + historyPageSize)}>Показать предыдущие · {activities.length - visibleActivityCount}</button>}</> : <div className={styles.emptyHistory}>История появится после первого действия</div>}</div>
            <div className={styles.composer}><span>Примечание</span><textarea value={note} onChange={(event) => setNote(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void submitNote(); } }} placeholder="Добавить примечание о контакте…" />{noteError && <p className={styles.noteError} role="alert">{noteError}</p>}<div><button type="button">＋</button><button className={styles.saveButton} type="button" disabled={!note.trim() || isNoteSaving} onClick={() => { void submitNote(); }}>{isNoteSaving ? "Сохраняем…" : "Сохранить"}</button></div></div>
          </div>
        </div>
      </aside>
    </div>
  );
}

function Fact({ label, value, link }: { label: string; value: string; link?: string }) {
  return <div className={styles.fact}><span>{label}</span>{link ? <a href={link}>{value}</a> : <strong>{value}</strong>}</div>;
}

function FactInput({ label, value, placeholder, type = "text", invalid = false, onChange, onCommit }: { label: string; value: string; placeholder: string; type?: string; invalid?: boolean; onChange: (value: string) => void; onCommit: () => void }) {
  return <label className={styles.fact}><span>{label}</span><input type={type} value={value} placeholder={placeholder} aria-invalid={invalid} onChange={(event) => onChange(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); onCommit(); } }} /></label>;
}

function FactSelect({ label, value, options, onChange }: { label: string; value: string; options: Array<{ value: string; label: string }>; onChange: (value: string) => void }) {
  return <label className={styles.fact}><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>;
}
