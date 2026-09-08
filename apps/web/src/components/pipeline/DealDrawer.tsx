import { useEffect, useMemo, useState } from "react";
import type { ActivityCategory, ActivityEvent, Deal } from "@/types/crm";
import styles from "./deal-drawer.module.css";

interface DealDrawerProps {
  deal: Deal;
  stageId: string;
  stages: Array<{ id: string; title: string }>;
  assignees: Array<{ id: string; name: string }>;
  activities: ActivityEvent[];
  onSave: (deal: Deal, stageId: string) => Promise<{ deal: Deal; stageId: string }>;
  onAddNote: (text: string) => Promise<void>;
  onAddTask: (title: string, dueAt?: string) => void;
  onCompleteTask: (result: string) => void;
  onClose: () => void;
}

type ComposerMode = "note" | "task";
type ActivityFilter = "all" | ActivityCategory;

const propertyTypes = ["Квартира", "Дом", "Участок", "Коммерческая недвижимость"];
const districts = ["Приморский", "Киевский", "Пересыпский", "Хаджибейский"];
const roomOptions = ["1", "2", "3", "4+"];
const dueOptions = ["Без срока", "Сегодня, 18:00", "Завтра, 10:00", "Через 3 дня", "Через неделю"];
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
  onSave,
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
  const [composerError, setComposerError] = useState("");
  const [isComposerSubmitting, setIsComposerSubmitting] = useState(false);
  const [draft, setDraft] = useState(deal);
  const [draftStageId, setDraftStageId] = useState(stageId);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const comparable = (value: Deal) => ({ title: value.title, assigneeId: value.assigneeId, budget: value.budget, operation: value.operation, propertyType: value.propertyType, district: value.district, rooms: value.rooms, request: value.request, comment: value.comment, source: value.source });
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
    setIsSaving(true);
    setSaveError("");
    try {
      const saved = await onSave(draft, draftStageId);
      setDraft(saved.deal);
      setDraftStageId(saved.stageId);
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : "Не удалось сохранить сделку.");
    } finally {
      setIsSaving(false);
    }
  }

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
      onAddTask(text, taskDueAt === "Без срока" ? undefined : taskDueAt);
    }

    setComposerText("");
    setTaskDueAt("Без срока");
    setIsDueMenuOpen(false);
    setIsComposerSubmitting(false);
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
            <InlineTitleEditor value={draft.title || draft.request} onSave={(value) => updateDraft({ title: value })} />
            <div className={styles.headerMeta}>
              <span>#{deal.number}</span>
              <span className={styles.sourceTag}>{sourceLabels[deal.source]}</span>
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
                <button type="button" aria-label="Меню контакта">•••</button>
              </div>
              <PropertyInput label="Телефон" icon="☎" value={deal.phone || ""} readOnly onChange={() => undefined} />
              <SourceSelect value={draft.source} onChange={(value) => updateDraft({ source: value })} />
            </section>

            <section className={styles.notesSection}>
              <h3>Запрос клиента</h3>
              <InlineTextEditor label="Запрос клиента" value={draft.request} placeholder="Запрос ещё не уточнён" onSave={(value) => updateDraft({ request: value })} />
              <h3>Комментарий</h3>
              <InlineTextEditor label="Комментарий" value={draft.comment || ""} placeholder="Добавить комментарий" onSave={(value) => updateDraft({ comment: value })} />
            </section>

            <button className={styles.addContactButton} type="button"><span>＋</span> Добавить связанный контакт</button>
            {isDirty && <div className={styles.saveBar}><div>{saveError || "Есть несохранённые изменения"}</div><button type="button" onClick={discardChanges} disabled={isSaving}>Отменить</button><button type="button" onClick={() => { void saveChanges(); }} disabled={isSaving}>{isSaving ? "Сохраняем…" : "Сохранить"}</button></div>}
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
                  <textarea id="task-result" value={taskResult} onChange={(event) => setTaskResult(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); completeCurrentTask(); } }} placeholder="Например, договорились о просмотре" />
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
              <textarea value={composerText} onChange={(event) => setComposerText(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void submitComposer(); } }} placeholder={composerMode === "note" ? "Добавить примечание к сделке…" : "Что необходимо сделать?"} aria-label={composerMode === "note" ? "Новое примечание" : "Новая задача"} />
              {composerError && <div className={styles.composerError} role="alert">{composerError}</div>}
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
                <button className={styles.saveNoteButton} type="button" disabled={!composerText.trim() || isComposerSubmitting} onClick={() => { void submitComposer(); }}>{isComposerSubmitting ? "Сохраняем…" : composerMode === "note" ? "Сохранить" : "Создать задачу"}</button>
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
