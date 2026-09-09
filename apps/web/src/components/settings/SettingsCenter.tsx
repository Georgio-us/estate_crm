"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import styles from "./settings.module.css";

type Section = "crm" | "workspace" | "access" | "notifications" | "security" | "data" | "profile";
type ModuleId = "home" | "pipeline" | "contacts" | "objects" | "tasks" | "calendar" | "integrations" | "team";
type CrmModule = { id: ModuleId; name: string; icon: string; description: string; label: string; fields: string[] };
type PipelineStageDraft = { id?: string; key: string; title: string; color: string; dealCount: number };

const stageColors = ["#d6a835", "#d98245", "#d35f63", "#5d8fc9", "#4f9dd5", "#8b6cc2", "#4a9d75", "#55b89b", "#b76ac8", "#76767a"];

function stageKey(id?: string) {
  return id || `new-${crypto.randomUUID()}`;
}

const navigation: { group: string; items: { id: Section; label: string; icon: string }[] }[] = [
  { group: "Рабочее пространство", items: [{ id: "crm", label: "Структура CRM", icon: "▦" }, { id: "workspace", label: "Основные настройки", icon: "◇" }, { id: "access", label: "Доступы", icon: "♙" }, { id: "notifications", label: "Уведомления", icon: "◉" }] },
  { group: "Система", items: [{ id: "security", label: "Безопасность", icon: "⌾" }, { id: "data", label: "Данные", icon: "⇅" }] },
  { group: "Личное", items: [{ id: "profile", label: "Мой профиль", icon: "○" }] },
];

const initialModules: CrmModule[] = [
  { id: "home", name: "Главная", icon: "⌂", description: "Сводка рабочего дня и ключевые показатели.", label: "Виджеты дашборда", fields: ["Просроченные задачи", "Задачи на сегодня", "Сделки без ответственного", "Сделки без следующего шага", "Воронка продаж", "Последние события"] },
  { id: "pipeline", name: "Воронка", icon: "▥", description: "Этапы движения сделки от обращения до результата.", label: "Этапы воронки", fields: ["Неразобранные", "Новый лид", "Не дозвонились", "В работе", "Подбор объектов", "Сделка закрыта"] },
  { id: "contacts", name: "Контакты", icon: "◎", description: "Карточка клиента, каналы связи и источники.", label: "Поля контакта", fields: ["Имя и фамилия", "Телефон", "Email", "Telegram", "Источник", "Ответственный"] },
  { id: "objects", name: "Объекты", icon: "◇", description: "Каталог недвижимости и характеристики объектов.", label: "Поля объекта", fields: ["Тип недвижимости", "Адрес", "Цена", "Площадь", "Количество комнат", "Статус", "Ответственный"] },
  { id: "tasks", name: "Задачи", icon: "✓", description: "Типы действий и правила выполнения задач.", label: "Типы задач", fields: ["Звонок", "Встреча", "Сообщение", "Показ объекта", "Другое"] },
  { id: "calendar", name: "Календарь", icon: "□", description: "Рабочее время и отображение событий.", label: "Типы событий", fields: ["Задача", "Встреча", "Показ объекта", "Личное событие"] },
  { id: "integrations", name: "Интеграции", icon: "↗", description: "Правила создания обращений из внешних каналов.", label: "Правила по умолчанию", fields: ["Создавать новую сделку", "Назначать по очереди", "Помещать в Неразобранные"] },
  { id: "team", name: "Команда", icon: "♙", description: "Распределение работы и правила сотрудников.", label: "Командные правила", fields: ["Распределять новые сделки по очереди", "Уведомлять руководителя о просрочке", "Требовать следующий шаг в сделке"] },
];

export function SettingsCenter() {
  const [section, setSection] = useState<Section>("crm");
  const [modules, setModules] = useState<CrmModule[]>(initialModules);
  const [savedModules, setSavedModules] = useState<CrmModule[]>(initialModules);
  const [moduleId, setModuleId] = useState<ModuleId>("pipeline");
  const [pipelineStages, setPipelineStages] = useState<PipelineStageDraft[]>([]);
  const [savedPipelineStages, setSavedPipelineStages] = useState<PipelineStageDraft[]>([]);
  const [pipelineLoadState, setPipelineLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const currentModule = useMemo(() => modules.find((item) => item.id === moduleId)!, [moduleId, modules]);
  const hasChanges = JSON.stringify(modules) !== JSON.stringify(savedModules) || JSON.stringify(pipelineStages) !== JSON.stringify(savedPipelineStages);

  useEffect(() => {
    let active = true;
    void fetch("/api/crm/pipeline/configuration", { cache: "no-store" }).then(async (response) => {
      const payload = await response.json() as { pipeline?: { stages: Array<{ id: string; title: string; color: string; dealCount: number }> }; message?: string };
      if (!response.ok || !payload.pipeline) throw new Error(payload.message || "Не удалось загрузить этапы.");
      if (!active) return;
      const stages = payload.pipeline.stages.map((stage) => ({ ...stage, key: stageKey(stage.id) }));
      setPipelineStages(stages);
      setSavedPipelineStages(stages);
      setModules((current) => current.map((module) => module.id === "pipeline" ? { ...module, fields: stages.map((stage) => stage.title) } : module));
      setSavedModules((current) => current.map((module) => module.id === "pipeline" ? { ...module, fields: stages.map((stage) => stage.title) } : module));
      setPipelineLoadState("ready");
    }).catch(() => { if (active) setPipelineLoadState("error"); });
    return () => { active = false; };
  }, []);

  const notify = useCallback((message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2500);
  }, []);

  function updateModule(patch: Partial<CrmModule>) {
    setModules((current) => current.map((item) => item.id === moduleId ? { ...item, ...patch } : item));
  }

  function addField() {
    updateModule({ fields: [...currentModule.fields, "Новое поле"] });
  }

  function updateField(index: number, value: string) {
    updateModule({ fields: currentModule.fields.map((field, fieldIndex) => fieldIndex === index ? value : field) });
  }

  function removeField(index: number) {
    updateModule({ fields: currentModule.fields.filter((_, fieldIndex) => fieldIndex !== index) });
  }

  function moveField(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= currentModule.fields.length) return;
    const fields = [...currentModule.fields];
    [fields[index], fields[nextIndex]] = [fields[nextIndex], fields[index]];
    updateModule({ fields });
  }

  function cancelChanges() {
    setModules(savedModules);
    setPipelineStages(savedPipelineStages);
  }

  async function saveModules() {
    if (pipelineStages.some((stage) => !stage.title.trim())) {
      notify("Укажите название каждого этапа");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/crm/pipeline/configuration", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stages: pipelineStages.map(({ id, title, color }) => ({ id, title: title.trim(), color })) }),
      });
      const payload = await response.json() as { pipeline?: { stages: Array<{ id: string; title: string; color: string; dealCount: number }> }; message?: string };
      if (!response.ok || !payload.pipeline) throw new Error(payload.message || "Не удалось сохранить этапы.");
      const stages = payload.pipeline.stages.map((stage) => ({ ...stage, key: stageKey(stage.id) }));
      const nextModules = modules.map((module) => module.id === "pipeline" ? { ...module, fields: stages.map((stage) => stage.title) } : module);
      setPipelineStages(stages);
      setSavedPipelineStages(stages);
      setModules(nextModules);
      setSavedModules(nextModules);
      notify("Этапы воронки сохранены");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Не удалось сохранить изменения");
    } finally {
      setSaving(false);
    }
  }

  return <section className={styles.page}>
    <header className={styles.topbar}><div><span>Администрирование</span><h1>Настройки</h1></div>{section === "crm" && hasChanges && <div className={styles.headerActions}><button type="button" disabled={saving} aria-label="Сбросить изменения" onClick={cancelChanges}><span>Отменить</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7H4v-5M4 7a9 9 0 1 1-1 7" /></svg></button><button className={styles.saveButton} type="button" disabled={saving} aria-label="Сохранить изменения" onClick={() => { void saveModules(); }}><span>{saving ? "Сохраняем…" : "Сохранить изменения"}</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h12l2 2v16H5zM8 3v6h8V3M8 21v-7h8v7" /></svg></button></div>}</header>

    <div className={styles.settingsLayout}>
      <aside className={styles.settingsNav}>{navigation.map((group) => <section key={group.group}><span>{group.group}</span>{group.items.map((item) => <button className={section === item.id ? styles.activeNav : ""} type="button" onClick={() => setSection(item.id)} key={item.id}><i>{item.icon}</i>{item.label}</button>)}</section>)}</aside>
      <div className={styles.content}>
        {section === "crm" && <CrmSettings modules={modules} currentModule={currentModule} moduleId={moduleId} setModuleId={setModuleId} updateModule={updateModule} addField={addField} updateField={updateField} removeField={removeField} moveField={moveField} pipelineStages={pipelineStages} setPipelineStages={setPipelineStages} pipelineLoadState={pipelineLoadState} hasChanges={hasChanges} saving={saving} onSave={() => { void saveModules(); }} />}
        {section === "workspace" && <WorkspaceSettings onNotify={notify} />}
        {section === "access" && <AccessSettings onNotify={notify} />}
        {section === "notifications" && <NotificationsSettings onNotify={notify} />}
        {section === "security" && <SecuritySettings onNotify={notify} />}
        {section === "data" && <DataSettings onNotify={notify} />}
        {section === "profile" && <ProfileSettings onNotify={notify} />}
      </div>
    </div>
    {notice && <div className={styles.notice} role="status">✓ {notice}</div>}
  </section>;
}

function PageIntro({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <header className={styles.pageIntro}><span>{eyebrow}</span><h2>{title}</h2><p>{description}</p></header>;
}

function CrmSettings({ modules, currentModule, moduleId, setModuleId, updateModule, addField, updateField, removeField, moveField, pipelineStages, setPipelineStages, pipelineLoadState, hasChanges, saving, onSave }: { modules: CrmModule[]; currentModule: CrmModule; moduleId: ModuleId; setModuleId: (id: ModuleId) => void; updateModule: (patch: Partial<CrmModule>) => void; addField: () => void; updateField: (index: number, value: string) => void; removeField: (index: number) => void; moveField: (index: number, direction: -1 | 1) => void; pipelineStages: PipelineStageDraft[]; setPipelineStages: (stages: PipelineStageDraft[] | ((current: PipelineStageDraft[]) => PipelineStageDraft[])) => void; pipelineLoadState: "loading" | "ready" | "error"; hasChanges: boolean; saving: boolean; onSave: () => void }) {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [colorPickerKey, setColorPickerKey] = useState<string | null>(null);
  const router = useRouter();

  function dropField(targetIndex: number) {
    if (draggedIndex === null || draggedIndex === targetIndex) return setDraggedIndex(null);
    const fields = [...currentModule.fields];
    const [moved] = fields.splice(draggedIndex, 1);
    fields.splice(targetIndex, 0, moved);
    updateModule({ fields });
    setDraggedIndex(null);
  }

  function updatePipelineStage(key: string, patch: Partial<PipelineStageDraft>) {
    setPipelineStages((current) => current.map((stage) => stage.key === key ? { ...stage, ...patch } : stage));
  }

  function addPipelineStage() {
    setPipelineStages((current) => [...current, { key: stageKey(), title: "Новый этап", color: stageColors[current.length % stageColors.length]!, dealCount: 0 }]);
  }

  function movePipelineStage(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= pipelineStages.length) return;
    const stages = [...pipelineStages];
    [stages[index], stages[nextIndex]] = [stages[nextIndex]!, stages[index]!];
    setPipelineStages(stages);
  }

  function dropPipelineStage(targetIndex: number) {
    if (draggedIndex === null || draggedIndex === targetIndex) return setDraggedIndex(null);
    const stages = [...pipelineStages];
    const [moved] = stages.splice(draggedIndex, 1);
    if (moved) stages.splice(targetIndex, 0, moved);
    setPipelineStages(stages);
    setDraggedIndex(null);
  }

  return <main><PageIntro eyebrow="Конфигурация" title="Структура CRM" description="Настройте названия, поля и правила модулей текущего рабочего пространства." />
    <section className={styles.crmWorkspace}>
      <aside className={styles.moduleList}><header><strong>Модули</strong><span>{modules.length} базовых разделов</span></header>{modules.map((item) => <button className={moduleId === item.id ? styles.activeModule : ""} type="button" onClick={() => setModuleId(item.id)} key={item.id}><i>{item.icon}</i><span><strong>{item.name}</strong><small>{item.description}</small></span><b>›</b></button>)}<button className={styles.addCustomModule} type="button" onClick={() => router.push("/subscription?tab=extensions")}><i>＋</i><span><strong>Добавить кастомный модуль</strong><small>Новая сущность или раздел под процесс компании</small></span><b>↗</b></button></aside>
      <section className={styles.moduleEditor}>
        <header><div className={styles.moduleTitle}><i>{currentModule.icon}</i><span><small>Базовый модуль CRM</small><input aria-label="Название модуля" value={currentModule.name} onChange={(event) => updateModule({ name: event.target.value })} /></span></div>{moduleId !== "pipeline" && <button className={styles.moduleMenu} type="button" aria-label="Расширенные настройки" title="Расширенные настройки">•••</button>}</header>
        <label className={styles.descriptionField}><span>Описание</span><input value={currentModule.description} onChange={(event) => updateModule({ description: event.target.value })} /></label>
        <div className={styles.fieldHeader}><div><strong>{currentModule.label}</strong><span>Порядок используется во всех формах и карточках.</span></div><button type="button" disabled={moduleId === "pipeline" && pipelineLoadState !== "ready"} onClick={moduleId === "pipeline" ? addPipelineStage : addField}>＋ Добавить</button></div>
        {moduleId === "pipeline" ? pipelineLoadState === "loading" ? <div className={styles.editorState}>Загружаем этапы воронки…</div> : pipelineLoadState === "error" ? <div className={styles.editorState}>Не удалось загрузить этапы. Обновите страницу.</div> : <div className={`${styles.fieldList} ${styles.stageFieldList}`}>{pipelineStages.map((stage, index) => <div className={draggedIndex === index ? styles.draggingRow : ""} onDragOver={(event) => event.preventDefault()} onDrop={() => dropPipelineStage(index)} key={stage.key}>
          <span className={styles.drag} draggable onDragStart={() => setDraggedIndex(index)} onDragEnd={() => setDraggedIndex(null)} title="Перетащить">⠿</span>
          <input aria-label={`Название этапа ${index + 1}`} value={stage.title} onChange={(event) => updatePipelineStage(stage.key, { title: event.target.value })} />
          <div className={styles.stageColorWrap}>
            <button className={styles.stageColorButton} type="button" aria-label={`Цвет этапа ${stage.title}`} aria-expanded={colorPickerKey === stage.key} style={{ backgroundColor: stage.color }} onClick={() => setColorPickerKey((current) => current === stage.key ? null : stage.key)} />
            {colorPickerKey === stage.key && <div className={styles.colorPalette} role="group" aria-label="Выберите цвет этапа">{stageColors.map((color) => <button className={stage.color === color ? styles.selectedColor : ""} type="button" aria-label={`Выбрать цвет ${color}`} style={{ backgroundColor: color }} onClick={() => { updatePipelineStage(stage.key, { color }); setColorPickerKey(null); }} key={color} />)}</div>}
          </div>
          <span className={styles.fieldType}>{stage.dealCount ? `${stage.dealCount} сделок` : "Этап"}</span>
          <div className={styles.rowActions}><button type="button" disabled={index === 0} aria-label="Переместить выше" onClick={() => movePipelineStage(index, -1)}>↑</button><button type="button" disabled={index === pipelineStages.length - 1} aria-label="Переместить ниже" onClick={() => movePipelineStage(index, 1)}>↓</button><button className={styles.removeButton} type="button" disabled={pipelineStages.length === 1 || stage.dealCount > 0} title={stage.dealCount > 0 ? "Сначала перенесите сделки из этого этапа" : undefined} aria-label="Удалить" onClick={() => setPipelineStages((current) => current.filter((item) => item.key !== stage.key))}>×</button></div>
        </div>)}</div> : <div className={styles.fieldList}>{currentModule.fields.map((field, index) => <div className={draggedIndex === index ? styles.draggingRow : ""} onDragOver={(event) => event.preventDefault()} onDrop={() => dropField(index)} key={`${moduleId}-${index}`}><span className={styles.drag} draggable onDragStart={() => setDraggedIndex(index)} onDragEnd={() => setDraggedIndex(null)} title="Перетащить">⠿</span><input aria-label={`${currentModule.label}: ${index + 1}`} value={field} onChange={(event) => updateField(index, event.target.value)} /><span className={styles.fieldType}>{moduleId === "contacts" || moduleId === "objects" ? "Поле" : "Правило"}</span><div className={styles.rowActions}><button type="button" disabled={index === 0} aria-label="Переместить выше" onClick={() => moveField(index, -1)}>↑</button><button type="button" disabled={index === currentModule.fields.length - 1} aria-label="Переместить ниже" onClick={() => moveField(index, 1)}>↓</button><button className={styles.removeButton} type="button" aria-label="Удалить" onClick={() => removeField(index)}>×</button></div></div>)}</div>}
        <footer><span>{moduleId === "pipeline" ? "Сохранённые этапы сразу появятся в воронке." : "Изменения применятся ко всему рабочему пространству."}</span>{moduleId === "pipeline" ? <button className={styles.footerSaveButton} type="button" disabled={!hasChanges || saving || pipelineLoadState !== "ready"} onClick={onSave}>{saving ? "Сохраняем…" : "Сохранить изменения"}</button> : <button type="button" onClick={addField}>Добавить элемент</button>}</footer>
      </section>
    </section>
  </main>;
}

function WorkspaceSettings({ onNotify }: { onNotify: (message: string) => void }) {
  const [form, setForm] = useState({ name: "", companyName: "", phone: "", email: "", timezone: "Europe/Madrid", currency: "USD" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  useEffect(() => { let active = true; void fetch("/api/crm/settings", { cache: "no-store" }).then(async (response) => { const payload = await response.json() as { workspace?: typeof form; message?: string }; if (!response.ok || !payload.workspace) throw new Error(payload.message); if (active) setForm({ ...payload.workspace, companyName: payload.workspace.companyName || "", phone: payload.workspace.phone || "", email: payload.workspace.email || "" }); }).catch(() => onNotify("Не удалось загрузить настройки пространства")).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [onNotify]);
  async function save() { setSaving(true); try { const response = await fetch("/api/crm/settings/workspace", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...form, companyName: form.companyName || null, phone: form.phone || null, email: form.email || null }) }); const payload = await response.json() as typeof form & { message?: string }; if (!response.ok) throw new Error(payload.message || "Не удалось сохранить настройки"); setForm({ ...payload, companyName: payload.companyName || "", phone: payload.phone || "", email: payload.email || "" }); onNotify("Настройки пространства сохранены"); } catch (error) { onNotify(error instanceof Error ? error.message : "Не удалось сохранить настройки"); } finally { setSaving(false); } }
  return <main><PageIntro eyebrow="Рабочее пространство" title="Основные настройки" description="Общие параметры компании, которые используются во всей CRM." />{loading ? <div className={styles.editorState}>Загружаем настройки…</div> : <><FormSection title="О компании"><div className={styles.formGrid}><ControlledField label="Название пространства" value={form.name} onChange={(name) => setForm((current) => ({ ...current, name }))} /><ControlledField label="Название компании" value={form.companyName} onChange={(companyName) => setForm((current) => ({ ...current, companyName }))} /><ControlledField label="Рабочий телефон" value={form.phone} onChange={(phone) => setForm((current) => ({ ...current, phone }))} /><ControlledField label="Email компании" type="email" value={form.email} onChange={(email) => setForm((current) => ({ ...current, email }))} /></div></FormSection><FormSection title="Регион и формат"><div className={styles.formGrid}><ControlledSelect label="Часовой пояс" value={form.timezone} options={[{ value: "Europe/Madrid", label: "Europe/Madrid" }, { value: "Europe/Kyiv", label: "Europe/Kyiv" }, { value: "UTC", label: "UTC" }]} onChange={(timezone) => setForm((current) => ({ ...current, timezone }))} /><ControlledSelect label="Валюта" value={form.currency} options={[{ value: "USD", label: "USD — $" }, { value: "EUR", label: "EUR — €" }]} onChange={(currency) => setForm((current) => ({ ...current, currency }))} /></div></FormSection><SaveBar disabled={saving || !form.name.trim()} label={saving ? "Сохраняем…" : "Сохранить"} onSave={() => { void save(); }} /></>}</main>;
}

function AccessSettings({ onNotify }: { onNotify: (message: string) => void }) {
  return <main><PageIntro eyebrow="Контроль" title="Доступы" description="Системные правила защищают рабочие данные независимо от интерфейса." /><section className={styles.ruleList}><Rule title="Менеджеры видят свои сделки и общую очередь" description="Неназначенные лиды доступны для первого касания; после назначения чужая сделка скрывается." defaultChecked /><Rule title="Экспорт ограничен" description="Экспорт рабочих данных доступен администраторам и руководителям." defaultChecked /><Rule title="Удаление только из закрытых" description="Безвозвратно удалить закрытую или архивную сделку смогут администратор и руководитель." defaultChecked /></section><div className={styles.linkCard}><span><strong>Роли и доступы сотрудников</strong><small>Роли и персональные Telegram-уведомления управляются в разделе «Команда».</small></span><a href="/team">Перейти в команду →</a></div><SaveBar onSave={() => onNotify("Эти правила являются системными и уже применяются")} /></main>;
}

function NotificationsSettings({ onNotify }: { onNotify: (message: string) => void }) {
  return <main><PageIntro eyebrow="События" title="Уведомления" description="Уведомления настраиваются персонально для каждого сотрудника." /><div className={styles.linkCard}><span><strong>Telegram и рабочие события</strong><small>Выберите участника команды и укажите, какие лиды, задачи и просрочки он получает.</small></span><a href="/team?tab=people">Открыть команду →</a></div><section className={styles.dataActions}><ActionCard title="Email-уведомления" description="Отдельный канал доставки появится после подключения почтового сервиса." action="В разработке" onClick={() => onNotify("Email-уведомления находятся в разработке")} /></section></main>;
}

function SecuritySettings({ onNotify }: { onNotify: (message: string) => void }) {
  const [sessions, setSessions] = useState<Array<{ id: string; current: boolean; device: string; browser: string; ipAddress: string | null; lastSeenAt: string }>>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(() => fetch("/api/crm/settings/sessions", { cache: "no-store" }).then(async (response) => { const payload = await response.json() as { sessions?: typeof sessions; message?: string }; if (!response.ok || !payload.sessions) throw new Error(payload.message); setSessions(payload.sessions); }).catch(() => onNotify("Не удалось загрузить активные сеансы")).finally(() => setLoading(false)), [onNotify]);
  useEffect(() => { void load(); }, [load]);
  async function revoke(sessionId: string) { const response = await fetch(`/api/crm/settings/sessions/${sessionId}`, { method: "DELETE" }); if (!response.ok) { const payload = await response.json() as { message?: string }; return onNotify(payload.message || "Не удалось завершить сеанс"); } onNotify("Сеанс завершён"); await load(); }
  async function revokeOthers() { const response = await fetch("/api/crm/settings/sessions/revoke-others", { method: "POST" }); if (!response.ok) return onNotify("Не удалось завершить другие сеансы"); onNotify("Все другие сеансы завершены"); await load(); }
  return <main><PageIntro eyebrow="Защита аккаунта" title="Безопасность" description="Пароль, двухфакторная авторизация и активные устройства." /><section className={styles.securityCards}><ActionCard title="Пароль" description="Смена пароля будет добавлена отдельным защищённым сценарием." action="В разработке" onClick={() => onNotify("Смена пароля находится в разработке")} /><ActionCard title="Двухфакторная авторизация" description="Дополнительное подтверждение входа через приложение." action="В разработке" onClick={() => onNotify("Двухфакторная авторизация находится в разработке")} /></section><FormSection title="Активные сеансы">{loading ? <div className={styles.editorState}>Загружаем сеансы…</div> : sessions.map((session) => <div className={styles.session} key={session.id}><i>▯</i><span><strong>{session.device} · {session.browser}</strong><small>{session.ipAddress || "Адрес не определён"} · {new Date(session.lastSeenAt).toLocaleString("ru-RU")}</small></span>{session.current ? <b>Сейчас</b> : <button type="button" onClick={() => { void revoke(session.id); }}>Завершить</button>}</div>)}<button className={styles.dangerText} type="button" disabled={!sessions.some((session) => !session.current)} onClick={() => { void revokeOthers(); }}>Выйти на всех других устройствах</button></FormSection></main>;
}

function DataSettings({ onNotify }: { onNotify: (message: string) => void }) {
  const router = useRouter();
  return <main><PageIntro eyebrow="Система" title="Данные" description="Перенос, выгрузка и управление рабочим пространством." /><section className={styles.dataActions}><ActionCard title="Импорт и экспорт сделок" description="Рабочий перенос CSV и Excel уже доступен из меню воронки." action="Открыть воронку" onClick={() => router.push("/")} /><ActionCard title="Полный экспорт пространства" description="Единый архив контактов, задач, объектов и истории." action="В разработке" onClick={() => onNotify("Полный экспорт находится в разработке")} /><ActionCard title="Резервные копии" description="Автоматические снимки базы и ручное восстановление." action="В разработке" onClick={() => onNotify("Резервные копии находятся в разработке")} /></section><section className={styles.dangerZone}><span><strong>Деактивировать рабочее пространство</strong><small>Безопасное отключение сотрудников и автоматизаций будет добавлено перед запуском подписки.</small></span><button type="button" onClick={() => onNotify("Деактивация пространства находится в разработке")}>В разработке</button></section></main>;
}

function ProfileSettings({ onNotify }: { onNotify: (message: string) => void }) {
  const [profile, setProfile] = useState({ name: "", email: "", phone: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  useEffect(() => { let active = true; void fetch("/api/crm/settings", { cache: "no-store" }).then(async (response) => { const payload = await response.json() as { profile?: typeof profile; message?: string }; if (!response.ok || !payload.profile) throw new Error(payload.message); if (active) setProfile({ ...payload.profile, phone: payload.profile.phone || "" }); }).catch(() => onNotify("Не удалось загрузить профиль")).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [onNotify]);
  async function save() { setSaving(true); try { const response = await fetch("/api/crm/settings/profile", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: profile.name, phone: profile.phone || null }) }); const payload = await response.json() as typeof profile & { message?: string }; if (!response.ok) throw new Error(payload.message || "Не удалось сохранить профиль"); setProfile({ ...payload, phone: payload.phone || "" }); onNotify("Профиль сохранён"); } catch (error) { onNotify(error instanceof Error ? error.message : "Не удалось сохранить профиль"); } finally { setSaving(false); } }
  const initials = profile.name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "—";
  return <main><PageIntro eyebrow="Личное" title="Мой профиль" description="Контактные данные вашего аккаунта." />{loading ? <div className={styles.editorState}>Загружаем профиль…</div> : <><section className={styles.profileHeader}><div className={styles.profileAvatar}>{initials}</div><span><strong>{profile.name}</strong><small>{profile.email}</small></span><button type="button" onClick={() => onNotify("Фотография профиля находится в разработке")}>Фото — в разработке</button></section><FormSection title="Контактные данные"><div className={styles.formGrid}><ControlledField label="Имя и фамилия" value={profile.name} onChange={(name) => setProfile((current) => ({ ...current, name }))} /><ControlledField label="Телефон" value={profile.phone} onChange={(phone) => setProfile((current) => ({ ...current, phone }))} /><ControlledField label="Email" type="email" value={profile.email} readOnly onChange={() => undefined} /></div></FormSection><SaveBar disabled={saving || !profile.name.trim()} label={saving ? "Сохраняем…" : "Сохранить"} onSave={() => { void save(); }} /></>}</main>;
}

function FormSection({ title, children }: { title: string; children: ReactNode }) { return <section className={styles.formSection}><h3>{title}</h3>{children}</section>; }
function ControlledField({ label, value, type = "text", readOnly = false, onChange }: { label: string; value: string; type?: string; readOnly?: boolean; onChange: (value: string) => void }) { return <label className={styles.field}><span>{label}</span><input type={type} value={value} readOnly={readOnly} onChange={(event) => onChange(event.target.value)} /></label>; }
function ControlledSelect({ label, value, options, onChange }: { label: string; value: string; options: Array<{ value: string; label: string }>; onChange: (value: string) => void }) { return <label className={styles.field}><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>; }
function SaveBar({ onSave, disabled = false, label = "Сохранить" }: { onSave: () => void; disabled?: boolean; label?: string }) { return <div className={styles.saveBar}><span>Изменения применятся после сохранения.</span><button type="button" disabled={disabled} onClick={onSave}>{label}</button></div>; }
function Rule({ title, description, defaultChecked = false }: { title: string; description: string; defaultChecked?: boolean }) { return <label><span><strong>{title}</strong><small>{description}</small></span><input type="checkbox" defaultChecked={defaultChecked} /></label>; }
function ActionCard({ title, description, action, onClick }: { title: string; description: string; action: string; onClick: () => void }) { return <article className={styles.actionCard}><span><strong>{title}</strong><small>{description}</small></span><button type="button" onClick={onClick}>{action} →</button></article>; }
