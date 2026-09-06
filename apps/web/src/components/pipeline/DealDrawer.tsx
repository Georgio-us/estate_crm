import { useEffect, useMemo, useState } from "react";
import type { ActivityCategory, ActivityEvent, Deal } from "@/types/crm";
import styles from "./deal-drawer.module.css";

interface DealDrawerProps {
  deal: Deal;
  stageId: string;
  stages: Array<{ id: string; title: string }>;
  activities: ActivityEvent[];
  onChange: (patch: Partial<Deal>) => void;
  onChangeStage: (stageId: string) => void;
  onAddNote: (text: string) => void;
  onAddTask: (title: string, dueAt?: string) => void;
  onCompleteTask: (result: string) => void;
  onClose: () => void;
}

type ComposerMode = "note" | "task";
type ActivityFilter = "all" | ActivityCategory;

const assignees = ["Не назначен", "Георгий", "Елена", "Андрей"];
const propertyTypes = ["Квартира", "Дом", "Участок", "Коммерческая недвижимость"];
const districts = ["Приморский", "Киевский", "Пересыпский", "Хаджибейский"];
const roomOptions = ["1", "2", "3", "4+"];
const dueOptions = ["Без срока", "Сегодня, 18:00", "Завтра, 10:00", "Через 3 дня", "Через неделю"];

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
  activities,
  onChange,
  onChangeStage,
  onAddNote,
  onAddTask,
  onCompleteTask,
  onClose,
}: DealDrawerProps) {
  const [composerMode, setComposerMode] = useState<ComposerMode>("note");
  const [composerText, setComposerText] = useState("");
  const [taskDueAt, setTaskDueAt] = useState("Без срока");
  const [isDueMenuOpen, setIsDueMenuOpen] = useState(false);
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>("all");
  const [isCompletingTask, setIsCompletingTask] = useState(false);
  const [taskResult, setTaskResult] = useState("");

  const visibleActivities = useMemo(
    () => activityFilter === "all" ? activities : activities.filter((event) => event.category === activityFilter),
    [activities, activityFilter],
  );

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  function submitComposer() {
    const text = composerText.trim();
    if (!text) return;

    if (composerMode === "note") {
      onAddNote(text);
    } else {
      onAddTask(text, taskDueAt === "Без срока" ? undefined : taskDueAt);
    }

    setComposerText("");
    setTaskDueAt("Без срока");
    setIsDueMenuOpen(false);
  }

  function completeCurrentTask() {
    onCompleteTask(taskResult.trim());
    setTaskResult("");
    setIsCompletingTask(false);
  }

  return (
    <div className={styles.layer}>
      <button className={styles.backdrop} type="button" onClick={onClose} aria-label="Закрыть карточку" />

      <aside className={styles.drawer} role="dialog" aria-modal="true" aria-label={`Сделка ${deal.contactName}`}>
        <header className={styles.header}>
          <div className={styles.headerIdentity}>
            <span className={styles.eyebrow}>Карточка сделки</span>
            <InlineTitleEditor value={deal.contactName} onSave={(value) => onChange({ contactName: value })} />
            <div className={styles.headerMeta}>
              <span>#{deal.number}</span>
              <span className={styles.sourceTag}>{deal.source}</span>
              <span>{deal.createdAt || "Недавно"}</span>
            </div>
          </div>

          <div className={styles.headerActions}>
            <button type="button" aria-label="Меню сделки">•••</button>
            <button className={styles.closeButton} type="button" onClick={onClose} aria-label="Закрыть">×</button>
          </div>
        </header>

        <div className={styles.workspace}>
          <div className={styles.detailsPane}>
            <section className={styles.statusSection}>
              <label className={styles.statusControl}>
                <span>Этап сделки</span>
                <select value={stageId} onChange={(event) => onChangeStage(event.target.value)}>
                  {stages.map((stage) => <option value={stage.id} key={stage.id}>{stage.title}</option>)}
                </select>
              </label>
              <div className={styles.stageTrack} aria-hidden="true">
                {stages.map((stage) => <span className={stage.id === stageId ? styles.trackActive : ""} key={stage.id} />)}
              </div>
            </section>

            <section className={styles.propertySection}>
              <h3>Основное</h3>
              <PropertySelect label="Ответственный" icon="У" value={deal.assignee} options={assignees} onChange={(value) => onChange({ assignee: value })} />
              <PropertyInput label="Бюджет" icon="$" value={deal.budget || ""} placeholder="Не указан" onChange={(value) => onChange({ budget: value })} />
              <PropertySelect label="Операция" icon="↔" value={deal.operation || "Покупка"} options={["Покупка", "Аренда", "Продажа"]} onChange={(value) => onChange({ operation: value as Deal["operation"] })} />
              <PropertySelect label="Тип объекта" icon="⌂" value={deal.propertyType || ""} placeholder="Выбрать" options={propertyTypes} onChange={(value) => onChange({ propertyType: value })} />
              <PropertySelect label="Район" icon="⌖" value={deal.district || ""} placeholder="Выбрать" options={districts} onChange={(value) => onChange({ district: value })} />
              <PropertySelect label="Комнаты" icon="№" value={deal.rooms || ""} placeholder="Не указано" options={roomOptions} onChange={(value) => onChange({ rooms: value })} />
            </section>

            <section className={styles.contactSection}>
              <div className={styles.contactHeader}>
                <span className={styles.contactAvatar}>{deal.contactName.slice(0, 1)}</span>
                <div>
                  <InlineContactEditor value={deal.contactName} onSave={(value) => onChange({ contactName: value })} />
                  <span>Контакт клиента · нажмите на имя для изменения</span>
                </div>
                <button type="button" aria-label="Меню контакта">•••</button>
              </div>
              <PropertyInput label="Телефон" icon="☎" value={deal.phone} onChange={(value) => onChange({ phone: value })} />
              <PropertyInput label="Источник" icon="↗" value={deal.source} readOnly onChange={() => undefined} />
            </section>

            <section className={styles.notesSection}>
              <h3>Запрос клиента</h3>
              <InlineTextEditor label="Запрос клиента" value={deal.request} placeholder="Запрос ещё не уточнён" onSave={(value) => onChange({ request: value })} />
              <h3>Комментарий</h3>
              <InlineTextEditor label="Комментарий" value={deal.comment || ""} placeholder="Добавить комментарий" onSave={(value) => onChange({ comment: value })} />
            </section>

            <button className={styles.addContactButton} type="button"><span>＋</span> Добавить связанный контакт</button>
          </div>

          <div className={styles.activityPane}>
            <div className={styles.activityToolbar}>
              <div><h2>Работа со сделкой</h2><span>{activities.length} событий в истории</span></div>
              <div className={styles.activityButtons}>
                <button type="button" onClick={() => setComposerMode("task")}>＋ Задача</button>
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

              {deal.task ? (
                <article className={`${styles.activityCard} ${deal.taskState === "overdue" ? styles.overdueCard : ""}`}>
                  <span className={styles.activityIcon}>✓</span>
                  <div><p>{deal.task}</p><span>{deal.assignee} · ближайшее действие</span></div>
                  <button type="button" onClick={() => setIsCompletingTask(true)}>Выполнить</button>
                </article>
              ) : (
                <article className={styles.taskPrompt}>
                  <span>○</span><p>Нет запланированных задач</p><button type="button" onClick={() => setComposerMode("task")}>Добавить</button>
                </article>
              )}

              {isCompletingTask && deal.task && (
                <div className={styles.completionForm}>
                  <label htmlFor="task-result">Результат задачи</label>
                  <textarea id="task-result" value={taskResult} onChange={(event) => setTaskResult(event.target.value)} placeholder="Например, договорились о просмотре" />
                  <div><button type="button" onClick={() => setIsCompletingTask(false)}>Отмена</button><button type="button" onClick={completeCurrentTask}>Подтвердить</button></div>
                </div>
              )}

              <div className={styles.thread}>
                {visibleActivities.length ? (
                  visibleActivities.map((event) => <TimelineItem event={event} key={event.id} />)
                ) : (
                  <div className={styles.emptyThread}>Для выбранного фильтра событий пока нет</div>
                )}
              </div>
            </div>

            <div className={styles.composer}>
              <div className={styles.composerTabs}>
                <button className={composerMode === "note" ? styles.composerTabActive : ""} type="button" onClick={() => setComposerMode("note")}>Примечание</button>
                <button className={composerMode === "task" ? styles.composerTabActive : ""} type="button" onClick={() => setComposerMode("task")}>Задача</button>
              </div>
              <textarea value={composerText} onChange={(event) => setComposerText(event.target.value)} placeholder={composerMode === "note" ? "Добавить примечание к сделке…" : "Что необходимо сделать?"} aria-label={composerMode === "note" ? "Новое примечание" : "Новая задача"} />
              <div className={styles.composerFooter}>
                {composerMode === "task" ? (
                  <div className={styles.duePicker}>
                    <button className={styles.dueButton} type="button" aria-expanded={isDueMenuOpen} onClick={() => setIsDueMenuOpen((current) => !current)}>◷ {taskDueAt}</button>
                    {isDueMenuOpen && (
                      <div className={styles.dueMenu} role="menu" aria-label="Срок задачи">
                        {dueOptions.map((option) => (
                          <button className={option === taskDueAt ? styles.dueOptionActive : ""} type="button" role="menuitem" key={option} onClick={() => { setTaskDueAt(option); setIsDueMenuOpen(false); }}>{option}</button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <button type="button" aria-label="Прикрепить файл">＋</button>
                )}
                <button className={styles.saveNoteButton} type="button" disabled={!composerText.trim()} onClick={submitComposer}>{composerMode === "note" ? "Сохранить" : "Создать задачу"}</button>
              </div>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}

function PropertyInput({ label, icon, value, placeholder, readOnly = false, onChange }: { label: string; icon: string; value: string; placeholder?: string; readOnly?: boolean; onChange: (value: string) => void }) {
  return <label className={styles.propertyRow}><span className={styles.propertyLabel}><i>{icon}</i>{label}</span><input value={value} placeholder={placeholder} readOnly={readOnly} onChange={(event) => onChange(event.target.value)} /></label>;
}

function PropertySelect({ label, icon, value, placeholder, options, onChange }: { label: string; icon: string; value: string; placeholder?: string; options: string[]; onChange: (value: string) => void }) {
  return <label className={styles.propertyRow}><span className={styles.propertyLabel}><i>{icon}</i>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}>{placeholder && <option value="">{placeholder}</option>}{options.map((option) => <option value={option} key={option}>{option}</option>)}</select></label>;
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

function InlineContactEditor({ value, onSave }: { value: string; onSave: (value: string) => void }) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  function save() {
    const nextValue = draft.trim();
    if (nextValue) onSave(nextValue);
    else setDraft(value);
    setIsEditing(false);
  }

  if (!isEditing) return <button className={styles.contactNameButton} type="button" onClick={() => { setDraft(value); setIsEditing(true); }}>{value}</button>;

  return <input className={styles.contactNameInput} autoFocus aria-label="Имя контакта" value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={save} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); save(); } if (event.key === "Escape") { event.stopPropagation(); setDraft(value); setIsEditing(false); } }} />;
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
      <div><span>Enter — сохранить · Shift+Enter — новая строка</span><button type="button" onClick={() => { setDraft(value); setIsEditing(false); }}>Отмена</button><button type="button" onClick={save}>Сохранить</button></div>
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
