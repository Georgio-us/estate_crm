import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { UiIcon } from "@/components/ui/UiIcon";
import { localDateKey } from "@/lib/tasks";
import type { ActivityCategory, ActivityEvent, CrmTask, Deal, DealStatus } from "@/types/crm";
import { isValidPhone } from "@/lib/phone";
import styles from "./deal-drawer.module.css";

interface DealDrawerProps {
  deal: Deal;
  stageId: string;
  stages: Array<{ id: string; title: string }>;
  assignees: Array<{ id: string; name: string }>;
  activities: ActivityEvent[];
  tasks: CrmTask[];
  highlightedTaskId?: string;
  contacts: Array<{ id: string; name: string; phone: string | null }>;
  onSave: (deal: Deal, stageId: string) => Promise<{ deal: Deal; stageId: string }>;
  onUpdateContactPhone: (phone: string) => Promise<string>;
  onAddNote: (text: string) => Promise<void>;
  onLinkContact: (contactId: string) => Promise<void>;
  onUnlinkContact: (contactId: string) => Promise<void>;
  onAddTask: (draft: { title: string; dueDate?: string; dueTime?: string }) => Promise<void>;
  onCompleteTask: (taskId: string, result: string) => Promise<void>;
  onLifecycle: (status: DealStatus) => Promise<void>;
  onOpenContact: (contactId: string) => void;
  initialComposerMode?: ComposerMode;
  onClose: () => void;
}

type ComposerMode = "note" | "task";
type ActivityFilter = "all" | ActivityCategory;

const propertyTypes = ["Квартира", "Дом", "Участок", "Коммерческая недвижимость"];
const districts = ["Приморский", "Киевский", "Пересыпский", "Хаджибейский"];
const roomOptions = ["1", "2", "3", "4+"];
const historyPageSize = 7;
const sourceLabels: Record<Deal["source"], string> = { Meta: "Meta", Website: "Сайт", Manual: "Не указан" };

const activityIcons: Record<ActivityCategory, string> = {
  note: "≡",
  task: "✓",
  change: "↔",
  source: "↗",
  object: "⌂",
};

export function DealDrawer({
  deal,
  stageId,
  stages,
  assignees,
  activities,
  tasks,
  highlightedTaskId,
  contacts,
  onSave,
  onUpdateContactPhone,
  onAddNote,
  onLinkContact,
  onUnlinkContact,
  onAddTask,
  onCompleteTask,
  onLifecycle,
  onOpenContact,
  initialComposerMode = "note",
  onClose,
}: DealDrawerProps) {
  const [composerMode, setComposerMode] = useState<ComposerMode>(initialComposerMode);
  const [composerText, setComposerText] = useState("");
  const [taskDueDate, setTaskDueDate] = useState("");
  const [taskDueTime, setTaskDueTime] = useState("");
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>("all");
  const [completingTaskId, setCompletingTaskId] = useState<string | null>(null);
  const [taskResult, setTaskResult] = useState("");
  const [composerError, setComposerError] = useState("");
  const [isComposerSubmitting, setIsComposerSubmitting] = useState(false);
  const [draft, setDraft] = useState(deal);
  const [draftStageId, setDraftStageId] = useState(stageId);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [relatedPickerOpen, setRelatedPickerOpen] = useState(false);
  const [relatedContactId, setRelatedContactId] = useState("");
  const [relatedError, setRelatedError] = useState("");
  const [relatedBusy, setRelatedBusy] = useState(false);
  const [dealMenuOpen, setDealMenuOpen] = useState(false);
  const [contactMenuOpen, setContactMenuOpen] = useState(false);
  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  const [visibleActivityCount, setVisibleActivityCount] = useState(historyPageSize);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  const comparable = (value: Deal) => ({ title: value.title, phone: value.phone, assigneeId: value.assigneeId, budget: value.budget, operation: value.operation, propertyType: value.propertyType, district: value.district, rooms: value.rooms, request: value.request, comment: value.comment, source: value.source });
  const isDirty = draftStageId !== stageId || JSON.stringify(comparable(draft)) !== JSON.stringify(comparable(deal));

  function updateDraft(patch: Partial<Deal>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function discardChanges() {
    setDraft(deal);
    setDraftStageId(stageId);
    setSaveError("");
  }

  async function saveChanges() {
    if (!isDirty || isSaving) return;
    if (draft.phone !== deal.phone && !isValidPhone(draft.phone)) {
      setSaveError("Введите корректный номер телефона.");
      return;
    }
    setIsSaving(true);
    setSaveError("");
    try {
      let nextDraft = draft;
      if (draft.phone !== deal.phone) {
        const phone = await onUpdateContactPhone(draft.phone);
        nextDraft = { ...draft, phone };
      }
      const saved = await onSave(nextDraft, draftStageId);
      setDraft(saved.deal);
      setDraftStageId(saved.stageId);
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : "Не удалось сохранить сделку.");
    } finally {
      setIsSaving(false);
    }
  }

  async function changeLifecycle(status: DealStatus) {
    if (lifecycleBusy) return;
    setLifecycleBusy(true);
    setDealMenuOpen(false);
    try {
      await onLifecycle(status);
    } finally {
      setLifecycleBusy(false);
    }
  }

  const visibleActivities = useMemo(
    () => activityFilter === "all" ? activities : activities.filter((event) => event.category === activityFilter),
    [activities, activityFilter],
  );
  const displayedActivities = visibleActivities.slice(0, visibleActivityCount);
  const relatedContacts = deal.relatedContacts || [];
  const availableContacts = contacts.filter((contact) => contact.id !== deal.contactId && !relatedContacts.some((linked) => linked.id === contact.id));

  async function linkRelatedContact() {
    if (!relatedContactId || relatedBusy) return;
    setRelatedBusy(true);
    setRelatedError("");
    try {
      await onLinkContact(relatedContactId);
      setRelatedContactId("");
      setRelatedPickerOpen(false);
    } catch (cause) {
      setRelatedError(cause instanceof Error ? cause.message : "Не удалось связать контакт.");
    } finally {
      setRelatedBusy(false);
    }
  }

  async function unlinkRelatedContact(contactId: string) {
    if (relatedBusy) return;
    setRelatedBusy(true);
    setRelatedError("");
    try { await onUnlinkContact(contactId); }
    catch (cause) { setRelatedError(cause instanceof Error ? cause.message : "Не удалось удалить связь."); }
    finally { setRelatedBusy(false); }
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (composerMode === "task") composerRef.current?.focus();
  }, [composerMode]);

  useEffect(() => {
    if (!highlightedTaskId) return;
    window.setTimeout(() => document.getElementById(`deal-task-${highlightedTaskId}`)?.scrollIntoView({ block: "center", behavior: "smooth" }), 120);
  }, [highlightedTaskId, tasks.length]);

  function activateTaskComposer() {
    setComposerMode("task");
    window.setTimeout(() => composerRef.current?.focus(), 0);
  }

  function applyQuickDue(days: number, time = "") {
    const now = new Date();
    setTaskDueDate(localDateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + days)));
    setTaskDueTime(time);
  }

  async function submitComposer() {
    const text = composerText.trim();
    if (!text || isComposerSubmitting) return;

    if (composerMode === "note") {
      setIsComposerSubmitting(true);
      setComposerError("");
      try {
        await onAddNote(text);
      } catch (cause) {
        setComposerError(cause instanceof Error ? cause.message : "Не удалось сохранить примечание.");
        setIsComposerSubmitting(false);
        return;
      }
    } else {
      setIsComposerSubmitting(true);
      setComposerError("");
      try { await onAddTask({ title: text, dueDate: taskDueDate || undefined, dueTime: taskDueTime || undefined }); }
      catch (cause) { setComposerError(cause instanceof Error ? cause.message : "Не удалось создать задачу."); setIsComposerSubmitting(false); return; }
    }

    setComposerText("");
    setTaskDueDate("");
    setTaskDueTime("");
    setIsComposerSubmitting(false);
  }

  async function completeCurrentTask() {
    if (!completingTaskId) return;
    await onCompleteTask(completingTaskId, taskResult.trim());
    setTaskResult("");
    setCompletingTaskId(null);
  }

  return (
    <div className={styles.layer}>
      <button className={styles.backdrop} type="button" onClick={onClose} aria-label="Закрыть карточку" />

      <aside className={styles.drawer} role="dialog" aria-modal="true" aria-label={`Сделка ${deal.contactName}`}>
        <header className={styles.header}>
          <div className={styles.headerIdentity}>
            <span className={styles.eyebrow}>Карточка сделки</span>
            <InlineTitleEditor value={draft.title || draft.request} onSave={(value) => updateDraft({ title: value })} />
            <div className={styles.headerMeta}>
              <span>#{deal.number}</span>
              <span className={styles.sourceTag}>{sourceLabels[deal.source]}</span>
              <span>{deal.createdAt || "Недавно"}</span>
            </div>
          </div>

          <div className={styles.headerActions}>
            <button type="button" aria-label="Меню сделки" aria-expanded={dealMenuOpen} onClick={() => setDealMenuOpen((value) => !value)}>•••</button>
            {dealMenuOpen && <div className={styles.entityMenu}>
              {(deal.status ?? "ACTIVE") === "ACTIVE" ? <>
                <button type="button" onClick={() => { setDealMenuOpen(false); activateTaskComposer(); }}>Поставить задачу</button>
                <span />
                <button type="button" disabled={lifecycleBusy} onClick={() => { void changeLifecycle("WON"); }}>Завершить успешно</button>
                <button type="button" disabled={lifecycleBusy} onClick={() => { void changeLifecycle("LOST"); }}>Закрыть неуспешно</button>
                <button className={styles.entityMenuMuted} type="button" disabled={lifecycleBusy} onClick={() => { void changeLifecycle("ARCHIVED"); }}>В архив</button>
              </> : <button type="button" disabled={lifecycleBusy} onClick={() => { void changeLifecycle("ACTIVE"); }}>Вернуть в работу</button>}
            </div>}
            <button className={styles.closeButton} type="button" onClick={onClose} aria-label="Закрыть">×</button>
          </div>
        </header>

        <div className={styles.workspace}>
          <div className={styles.detailsPane}>
            <section className={styles.statusSection}>
              <label className={styles.statusControl}>
                <span>Этап сделки</span>
                <select value={draftStageId} onChange={(event) => setDraftStageId(event.target.value)}>
                  {stages.map((stage) => <option value={stage.id} key={stage.id}>{stage.title}</option>)}
                </select>
              </label>
              <div className={styles.stageTrack} aria-hidden="true">
                {stages.map((stage) => <span className={stage.id === draftStageId ? styles.trackActive : ""} key={stage.id} />)}
              </div>
            </section>

            <section className={styles.propertySection}>
              <h3>Основное</h3>
              <AssigneeSelect value={draft.assigneeId || ""} options={assignees} onChange={(id) => updateDraft({ assigneeId: id || undefined, assignee: assignees.find((item) => item.id === id)?.name || "Не назначен" })} />
              <PropertyInput label="Бюджет" icon="$" value={draft.budget || ""} placeholder="Не указан" onChange={(value) => updateDraft({ budget: value })} />
              <PropertySelect label="Операция" icon="↔" value={draft.operation || "Покупка"} options={["Покупка", "Аренда", "Продажа"]} onChange={(value) => updateDraft({ operation: value as Deal["operation"] })} />
              <PropertySelect label="Тип объекта" icon="⌂" value={draft.propertyType || ""} placeholder="Выбрать" options={propertyTypes} onChange={(value) => updateDraft({ propertyType: value })} />
              <PropertySelect label="Район" icon="⌖" value={draft.district || ""} placeholder="Выбрать" options={districts} onChange={(value) => updateDraft({ district: value })} />
              <PropertySelect label="Комнаты" icon="№" value={draft.rooms || ""} placeholder="Не указано" options={roomOptions} onChange={(value) => updateDraft({ rooms: value })} />
            </section>

            <section className={styles.contactSection}>
              <div className={styles.contactHeader}>
                <span className={styles.contactAvatar}>{deal.contactName.slice(0, 1)}</span>
                <div>
                  <strong className={styles.contactName}>{deal.contactName}</strong>
                  <span>Основной контакт сделки</span>
                </div>
                <button type="button" aria-label="Меню контакта" aria-expanded={contactMenuOpen} onClick={() => setContactMenuOpen((value) => !value)}>•••</button>
                {contactMenuOpen && <div className={`${styles.entityMenu} ${styles.contactMenu}`}>
                  <button type="button" onClick={() => onOpenContact(deal.contactId!)}>Открыть карточку контакта</button>
                  <button type="button" onClick={() => { void navigator.clipboard.writeText(draft.phone || ""); setContactMenuOpen(false); }}>Скопировать телефон</button>
                  <a href={`tel:${(draft.phone || "").replaceAll(" ", "")}`}>Позвонить</a>
                </div>}
              </div>
              <PropertyInput label="Телефон" icon={<UiIcon name="phone" />} value={draft.phone || ""} onChange={(value) => updateDraft({ phone: value })} />
              <SourceSelect value={draft.source} onChange={(value) => updateDraft({ source: value })} />
            </section>

            <section className={styles.notesSection}>
              <h3>Запрос клиента</h3>
              <InlineTextEditor label="Запрос клиента" value={draft.request} placeholder="Запрос ещё не уточнён" onSave={(value) => updateDraft({ request: value })} />
              <h3>Комментарий</h3>
              <InlineTextEditor label="Комментарий" value={draft.comment || ""} placeholder="Добавить комментарий" onSave={(value) => updateDraft({ comment: value })} />
            </section>

            <section className={styles.relatedSection}>
              <div className={styles.relatedHeader}><h3>Связанные контакты</h3><span>{relatedContacts.length}</span></div>
              {relatedContacts.map((contact) => <div className={styles.relatedContact} key={contact.id}><i>{contact.name.slice(0, 1)}</i><div><strong>{contact.name}</strong><small>{contact.phone || "Телефон не указан"}</small></div><button type="button" disabled={relatedBusy} onClick={() => { void unlinkRelatedContact(contact.id); }} aria-label={`Удалить связь с ${contact.name}`}>×</button></div>)}
              {relatedPickerOpen ? <div className={styles.relatedPicker}><div className={styles.relatedChoices}>{availableContacts.map((contact) => <button className={relatedContactId === contact.id ? styles.relatedChoiceActive : ""} type="button" key={contact.id} onClick={() => setRelatedContactId(contact.id)}><strong>{contact.name}</strong><small>{contact.phone || "Телефон не указан"}</small></button>)}</div><button type="button" onClick={() => setRelatedPickerOpen(false)} disabled={relatedBusy}>Отмена</button><button type="button" onClick={() => { void linkRelatedContact(); }} disabled={!relatedContactId || relatedBusy}>{relatedBusy ? "Добавляем…" : "Добавить"}</button></div> : <button className={styles.addContactButton} type="button" disabled={!availableContacts.length} onClick={() => setRelatedPickerOpen(true)}><span>＋</span>{availableContacts.length ? "Добавить участника сделки" : "Нет доступных контактов"}</button>}
              {relatedError && <p className={styles.relatedError} role="alert">{relatedError}</p>}
            </section>
            {isDirty && <div className={styles.saveBar}><div>{saveError || "Есть несохранённые изменения"}</div><button type="button" onClick={discardChanges} disabled={isSaving}>Отменить</button><button type="button" onClick={() => { void saveChanges(); }} disabled={isSaving}>{isSaving ? "Сохраняем…" : "Сохранить"}</button></div>}
          </div>

          <div className={styles.activityPane}>
            <div className={styles.activityToolbar}>
              <div><h2>Работа со сделкой</h2><span>{activities.length} событий в истории</span></div>
              <div className={styles.activityButtons}>
                <button type="button" onClick={activateTaskComposer}>＋ Задача</button>
                <select aria-label="Фильтр истории" value={activityFilter} onChange={(event) => setActivityFilter(event.target.value as ActivityFilter)}>
                  <option value="all">Все события</option>
                  <option value="note">Примечания</option>
                  <option value="task">Задачи</option>
                  <option value="change">Изменения</option>
                  <option value="source">Источники</option>
                  <option value="object">Объекты</option>
                </select>
              </div>
            </div>

            <div className={styles.activityFeed}>
              <div className={styles.dateDivider}><span>Сегодня</span></div>

              {tasks.length ? (
                <section className={styles.activeTasks} aria-label="Активные задачи сделки">
                  <header><div><strong>Активные задачи</strong><span>{tasks.length}</span></div><button type="button" onClick={activateTaskComposer}>＋ Добавить</button></header>
                  {tasks.map((task) => (
                    <div className={styles.taskUnit} key={task.id}>
                      <article id={`deal-task-${task.id}`} className={`${styles.activityCard} ${task.period === "overdue" ? styles.overdueCard : ""} ${highlightedTaskId === task.id ? styles.highlightedTask : ""}`}>
                        <span className={styles.activityIcon}>✓</span>
                        <div><p>{task.title}</p><span className={styles[`taskDue_${task.period}`]}>{task.dueLabel}{task.dueTime ? `, ${task.dueTime}` : ""} · {task.assignee}</span></div>
                        <button type="button" onClick={() => { setCompletingTaskId(task.id); setTaskResult(""); }}>Выполнить</button>
                      </article>
                      {completingTaskId === task.id && (
                        <div className={styles.completionForm}>
                          <label htmlFor={`task-result-${task.id}`}>Результат задачи</label>
                          <textarea id={`task-result-${task.id}`} autoFocus value={taskResult} onChange={(event) => setTaskResult(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void completeCurrentTask(); } }} placeholder="Например, договорились о просмотре" />
                          <div><button type="button" onClick={() => setCompletingTaskId(null)}>Отмена</button><button type="button" onClick={() => { void completeCurrentTask(); }}>Подтвердить</button></div>
                        </div>
                      )}
                    </div>
                  ))}
                </section>
              ) : (
                <article className={styles.taskPrompt}>
                  <span>○</span><p>Нет запланированных задач</p><button type="button" onClick={activateTaskComposer}>Добавить</button>
                </article>
              )}

              <div className={styles.thread}>
                {visibleActivities.length ? (
                  <>
                    {displayedActivities.map((event) => <TimelineItem event={event} key={event.id} />)}
                    {visibleActivities.length > visibleActivityCount && <button className={styles.showMoreHistory} type="button" onClick={() => setVisibleActivityCount((count) => count + historyPageSize)}>Показать предыдущие · {visibleActivities.length - visibleActivityCount}</button>}
                  </>
                ) : (
                  <div className={styles.emptyThread}>Для выбранного фильтра событий пока нет</div>
                )}
              </div>
            </div>

            <div className={`${styles.composer} ${composerMode === "task" ? styles.composerTask : ""}`}>
              <div className={styles.composerTabs}>
                <button className={composerMode === "note" ? styles.composerTabActive : ""} type="button" onClick={() => setComposerMode("note")}>Примечание</button>
                <button className={composerMode === "task" ? styles.composerTabActive : ""} type="button" onClick={activateTaskComposer}>Задача</button>
              </div>
              <textarea ref={composerRef} value={composerText} onChange={(event) => setComposerText(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void submitComposer(); } }} placeholder={composerMode === "note" ? "Добавить примечание к сделке…" : "Что необходимо сделать?"} aria-label={composerMode === "note" ? "Новое примечание" : "Новая задача"} />
              {composerError && <div className={styles.composerError} role="alert">{composerError}</div>}
              {composerMode === "task" && <div className={styles.taskSchedule}>
                <div className={styles.quickDates}><button type="button" onClick={() => { setTaskDueDate(""); setTaskDueTime(""); }}>Без срока</button><button type="button" onClick={() => applyQuickDue(0, "18:00")}>Сегодня</button><button type="button" onClick={() => applyQuickDue(1, "10:00")}>Завтра</button><button type="button" onClick={() => applyQuickDue(3)}>Через 3 дня</button></div>
                <label><span>Дата</span><input type="date" value={taskDueDate} onChange={(event) => setTaskDueDate(event.target.value)} /></label>
                <label><span>Время</span><input type="time" value={taskDueTime} onChange={(event) => setTaskDueTime(event.target.value)} /></label>
              </div>}
              <div className={styles.composerFooter}>
                {composerMode === "note" ? (
                  <button type="button" aria-label="Прикрепить файл">＋</button>
                ) : <span className={styles.scheduleSummary}>{taskDueDate ? `◷ ${taskDueDate}${taskDueTime ? `, ${taskDueTime}` : ""}` : "◷ Без срока"}</span>}
                <button className={styles.saveNoteButton} type="button" disabled={!composerText.trim() || isComposerSubmitting} onClick={() => { void submitComposer(); }}>{isComposerSubmitting ? "Сохраняем…" : composerMode === "note" ? "Сохранить" : "Создать задачу"}</button>
              </div>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}

function PropertyInput({ label, icon, value, placeholder, readOnly = false, onChange }: { label: string; icon: ReactNode; value: string; placeholder?: string; readOnly?: boolean; onChange: (value: string) => void }) {
  return <label className={styles.propertyRow}><span className={styles.propertyLabel}><i>{icon}</i>{label}</span><input value={value} placeholder={placeholder} readOnly={readOnly} onChange={(event) => onChange(event.target.value)} /></label>;
}

function PropertySelect({ label, icon, value, placeholder, options, onChange }: { label: string; icon: string; value: string; placeholder?: string; options: string[]; onChange: (value: string) => void }) {
  return <label className={styles.propertyRow}><span className={styles.propertyLabel}><i>{icon}</i>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}>{placeholder && <option value="">{placeholder}</option>}{options.map((option) => <option value={option} key={option}>{option}</option>)}</select></label>;
}

function SourceSelect({ value, onChange }: { value: Deal["source"]; onChange: (value: Deal["source"]) => void }) {
  return <label className={styles.propertyRow}><span className={styles.propertyLabel}><i>↗</i>Источник</span><select value={value} onChange={(event) => onChange(event.target.value as Deal["source"])}><option value="Manual">Не указан</option><option value="Meta">Meta</option><option value="Website">Сайт</option></select></label>;
}

function AssigneeSelect({ value, options, onChange }: { value: string; options: Array<{ id: string; name: string }>; onChange: (value: string) => void }) {
  return <label className={styles.propertyRow}><span className={styles.propertyLabel}><i>У</i>Ответственный</span><select value={value} onChange={(event) => onChange(event.target.value)}><option value="">Не назначен</option>{options.map((option) => <option value={option.id} key={option.id}>{option.name}</option>)}</select></label>;
}

function InlineTitleEditor({ value, onSave }: { value: string; onSave: (value: string) => void }) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  function save() {
    const nextValue = draft.trim();
    if (nextValue) onSave(nextValue);
    else setDraft(value);
    setIsEditing(false);
  }

  if (!isEditing) {
    return <button className={styles.titleValue} type="button" title="Нажмите, чтобы изменить имя" onClick={() => { setDraft(value); setIsEditing(true); }}>{value}<span>✎</span></button>;
  }

  return <input className={styles.titleInput} autoFocus aria-label="Название сделки" value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={save} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); save(); } if (event.key === "Escape") { event.stopPropagation(); setDraft(value); setIsEditing(false); } }} />;
}

function InlineTextEditor({ label, value, placeholder, onSave }: { label: string; value: string; placeholder: string; onSave: (value: string) => void }) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  function save() {
    onSave(draft.trim());
    setIsEditing(false);
  }

  if (!isEditing) {
    return <button className={`${styles.textValue} ${value ? "" : styles.textValueEmpty}`} type="button" onClick={() => { setDraft(value); setIsEditing(true); }}>{value || placeholder}<span>✎</span></button>;
  }

  return (
    <div className={styles.inlineTextEditor}>
      <textarea autoFocus value={draft} onChange={(event) => setDraft(event.target.value)} aria-label={label} onKeyDown={(event) => {
        if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); save(); }
        if (event.key === "Escape") { event.stopPropagation(); setDraft(value); setIsEditing(false); }
      }} />
      <div><span className={styles.keyboardHint}>Enter — сохранить · Shift+Enter — новая строка</span><button type="button" onClick={() => { setDraft(value); setIsEditing(false); }}>Отмена</button><button type="button" onClick={save}>Сохранить</button></div>
    </div>
  );
}

function TimelineItem({ event }: { event: ActivityEvent }) {
  return (
    <article className={`${styles.timelineItem} ${styles[`event_${event.category}`]}`}>
      <span className={styles.timelineIcon}>{activityIcons[event.category]}</span>
      <div>
        <p>{event.title}</p>
        {event.description && <span>{event.description}</span>}
        {event.author && <small>{event.author}</small>}
      </div>
      <time>{event.occurredAt}</time>
    </article>
  );
}
