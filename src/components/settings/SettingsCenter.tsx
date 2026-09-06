"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import styles from "./settings.module.css";

type Section = "crm" | "workspace" | "access" | "notifications" | "security" | "data" | "profile";
type ModuleId = "home" | "pipeline" | "contacts" | "objects" | "tasks" | "calendar" | "integrations" | "team";
type CrmModule = { id: ModuleId; name: string; icon: string; description: string; label: string; fields: string[] };

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
  const [notice, setNotice] = useState("");
  const currentModule = useMemo(() => modules.find((item) => item.id === moduleId)!, [moduleId, modules]);
  const hasChanges = JSON.stringify(modules) !== JSON.stringify(savedModules);

  function notify(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2500);
  }

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

  function saveModules() {
    setSavedModules(modules);
    notify("Изменения структуры CRM сохранены");
  }

  return <section className={styles.page}>
    <header className={styles.topbar}><div><span>Администрирование</span><h1>Настройки</h1></div>{section === "crm" && hasChanges && <div className={styles.headerActions}><button type="button" aria-label="Сбросить изменения" onClick={() => setModules(savedModules)}><span>Отменить</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7H4v-5M4 7a9 9 0 1 1-1 7" /></svg></button><button className={styles.saveButton} type="button" aria-label="Сохранить изменения" onClick={saveModules}><span>Сохранить изменения</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h12l2 2v16H5zM8 3v6h8V3M8 21v-7h8v7" /></svg></button></div>}</header>

    <div className={styles.settingsLayout}>
      <aside className={styles.settingsNav}>{navigation.map((group) => <section key={group.group}><span>{group.group}</span>{group.items.map((item) => <button className={section === item.id ? styles.activeNav : ""} type="button" onClick={() => setSection(item.id)} key={item.id}><i>{item.icon}</i>{item.label}</button>)}</section>)}</aside>
      <div className={styles.content}>
        {section === "crm" && <CrmSettings modules={modules} currentModule={currentModule} moduleId={moduleId} setModuleId={setModuleId} updateModule={updateModule} addField={addField} updateField={updateField} removeField={removeField} moveField={moveField} />}
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

function CrmSettings({ modules, currentModule, moduleId, setModuleId, updateModule, addField, updateField, removeField, moveField }: { modules: CrmModule[]; currentModule: CrmModule; moduleId: ModuleId; setModuleId: (id: ModuleId) => void; updateModule: (patch: Partial<CrmModule>) => void; addField: () => void; updateField: (index: number, value: string) => void; removeField: (index: number) => void; moveField: (index: number, direction: -1 | 1) => void }) {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const router = useRouter();

  function dropField(targetIndex: number) {
    if (draggedIndex === null || draggedIndex === targetIndex) return setDraggedIndex(null);
    const fields = [...currentModule.fields];
    const [moved] = fields.splice(draggedIndex, 1);
    fields.splice(targetIndex, 0, moved);
    updateModule({ fields });
    setDraggedIndex(null);
  }

  return <main><PageIntro eyebrow="Конфигурация" title="Структура CRM" description="Настройте названия, поля и правила модулей текущего рабочего пространства." />
    <section className={styles.crmWorkspace}>
      <aside className={styles.moduleList}><header><strong>Модули</strong><span>{modules.length} базовых разделов</span></header>{modules.map((item) => <button className={moduleId === item.id ? styles.activeModule : ""} type="button" onClick={() => setModuleId(item.id)} key={item.id}><i>{item.icon}</i><span><strong>{item.name}</strong><small>{item.description}</small></span><b>›</b></button>)}<button className={styles.addCustomModule} type="button" onClick={() => router.push("/subscription?tab=extensions")}><i>＋</i><span><strong>Добавить кастомный модуль</strong><small>Новая сущность или раздел под процесс компании</small></span><b>↗</b></button></aside>
      <section className={styles.moduleEditor}>
        <header><div className={styles.moduleTitle}><i>{currentModule.icon}</i><span><small>Базовый модуль CRM</small><input aria-label="Название модуля" value={currentModule.name} onChange={(event) => updateModule({ name: event.target.value })} /></span></div><button className={styles.moduleMenu} type="button" aria-label="Расширенные настройки" title="Расширенные настройки">•••</button></header>
        <label className={styles.descriptionField}><span>Описание</span><input value={currentModule.description} onChange={(event) => updateModule({ description: event.target.value })} /></label>
        <div className={styles.fieldHeader}><div><strong>{currentModule.label}</strong><span>Порядок используется во всех формах и карточках.</span></div><button type="button" onClick={addField}>＋ Добавить</button></div>
        <div className={styles.fieldList}>{currentModule.fields.map((field, index) => <div className={draggedIndex === index ? styles.draggingRow : ""} onDragOver={(event) => event.preventDefault()} onDrop={() => dropField(index)} key={`${moduleId}-${index}`}><span className={styles.drag} draggable onDragStart={() => setDraggedIndex(index)} onDragEnd={() => setDraggedIndex(null)} title="Перетащить">⠿</span><input aria-label={`${currentModule.label}: ${index + 1}`} value={field} onChange={(event) => updateField(index, event.target.value)} /><span className={styles.fieldType}>{moduleId === "pipeline" ? "Этап" : moduleId === "contacts" || moduleId === "objects" ? "Поле" : "Правило"}</span><div className={styles.rowActions}><button type="button" disabled={index === 0} aria-label="Переместить выше" onClick={() => moveField(index, -1)}>↑</button><button type="button" disabled={index === currentModule.fields.length - 1} aria-label="Переместить ниже" onClick={() => moveField(index, 1)}>↓</button><button className={styles.removeButton} type="button" aria-label="Удалить" onClick={() => removeField(index)}>×</button></div></div>)}</div>
        <footer><span>Изменения применятся ко всему рабочему пространству.</span><button type="button" onClick={addField}>Добавить {moduleId === "pipeline" ? "этап" : "элемент"}</button></footer>
      </section>
    </section>
  </main>;
}

function WorkspaceSettings({ onNotify }: { onNotify: (message: string) => void }) {
  return <main><PageIntro eyebrow="Рабочее пространство" title="Основные настройки" description="Общие параметры компании, которые используются во всей CRM." /><FormSection title="О компании"><div className={styles.formGrid}><Field label="Название пространства" defaultValue="Estate CRM" /><Field label="Название компании" defaultValue="Shepit House" /><Field label="Рабочий телефон" defaultValue="+38 048 700 00 00" /><Field label="Email компании" defaultValue="office@estate-crm.com" /></div></FormSection><FormSection title="Регион и формат"><div className={styles.formGrid}><SelectField label="Язык пространства" options={["Русский", "Українська", "English"]} /><SelectField label="Часовой пояс" options={["Europe/Kyiv (UTC+3)", "Europe/Madrid (UTC+2)"]} /><SelectField label="Валюта" options={["USD — $", "EUR — €", "UAH — ₴"]} /><SelectField label="Формат даты" options={["5 сентября 2026", "05.09.2026"]} /></div></FormSection><SaveBar onSave={() => onNotify("Настройки пространства сохранены")} /></main>;
}

function AccessSettings({ onNotify }: { onNotify: (message: string) => void }) {
  return <main><PageIntro eyebrow="Контроль" title="Доступы" description="Общие правила доступа. Роли конкретных сотрудников настраиваются в разделе «Команда»." /><section className={styles.ruleList}><Rule title="Менеджеры видят только свои сделки" description="Руководители и администраторы видят данные своей команды." defaultChecked /><Rule title="Запретить экспорт менеджерам" description="Экспорт контактов, сделок и объектов доступен только администраторам." defaultChecked /><Rule title="Разрешить удаление сделок" description="Менеджер сможет безвозвратно удалить доступную ему сделку." /><Rule title="Скрывать телефоны клиентов" description="Номер отображается частично до начала звонка." /></section><div className={styles.linkCard}><span><strong>Роли и доступы сотрудников</strong><small>Настройте область данных для администратора, руководителя и менеджеров.</small></span><a href="/team">Перейти в команду →</a></div><SaveBar onSave={() => onNotify("Правила доступа сохранены")} /></main>;
}

function NotificationsSettings({ onNotify }: { onNotify: (message: string) => void }) {
  return <main><PageIntro eyebrow="События" title="Уведомления" description="Выберите только те ситуации, которые требуют реакции команды." /><section className={styles.notificationTable}><header><span>Событие</span><span>В CRM</span><span>Email</span><span>Telegram</span></header><NotificationRow title="Мне назначили сделку" description="Новый ответственный в карточке сделки" values={[true, false, true]} /><NotificationRow title="Задача просрочена" description="Срок прошёл, а результат не зафиксирован" values={[true, true, true]} /><NotificationRow title="Новое сообщение или звонок" description="Обращение из подключённого канала" values={[true, false, true]} /><NotificationRow title="Административная проблема" description="Доступ отключён или интеграция остановилась" values={[true, true, false]} /></section><SaveBar onSave={() => onNotify("Настройки уведомлений сохранены")} /></main>;
}

function SecuritySettings({ onNotify }: { onNotify: (message: string) => void }) {
  return <main><PageIntro eyebrow="Защита аккаунта" title="Безопасность" description="Пароль, двухфакторная авторизация и активные устройства." /><section className={styles.securityCards}><ActionCard title="Пароль" description="Изменён 42 дня назад" action="Изменить пароль" onClick={() => onNotify("Форма смены пароля открыта")} /><ActionCard title="Двухфакторная авторизация" description="Добавьте подтверждение входа через приложение" action="Подключить" onClick={() => onNotify("Настройка 2FA открыта")} /></section><FormSection title="Активные сеансы"><div className={styles.session}><i>⌘</i><span><strong>Mac · Codex Browser</strong><small>Madrid, Spain · текущий сеанс</small></span><b>Сейчас</b></div><div className={styles.session}><i>▯</i><span><strong>iPhone · Safari</strong><small>Madrid, Spain</small></span><b>Вчера, 22:16</b></div><button className={styles.dangerText} type="button" onClick={() => onNotify("Остальные сеансы завершены")}>Выйти на всех других устройствах</button></FormSection></main>;
}

function DataSettings({ onNotify }: { onNotify: (message: string) => void }) {
  return <main><PageIntro eyebrow="Система" title="Данные" description="Перенос, выгрузка и управление рабочим пространством." /><section className={styles.dataActions}><ActionCard title="Импорт данных" description="Контакты, объекты и сделки из CSV или Excel" action="Начать импорт" onClick={() => onNotify("Мастер импорта открыт")} /><ActionCard title="Экспорт данных" description="Подготовить архив данных текущего пространства" action="Создать экспорт" onClick={() => onNotify("Экспорт поставлен в очередь")} /><ActionCard title="Резервная копия" description="Последняя копия: сегодня, 04:00" action="Скачать копию" onClick={() => onNotify("Резервная копия подготовлена")} /></section><section className={styles.dangerZone}><span><strong>Деактивировать рабочее пространство</strong><small>Сотрудники потеряют доступ, а автоматизации остановятся. Данные сохранятся 30 дней.</small></span><button type="button" onClick={() => onNotify("Для деактивации потребуется подтверждение")}>Деактивировать</button></section></main>;
}

function ProfileSettings({ onNotify }: { onNotify: (message: string) => void }) {
  return <main><PageIntro eyebrow="Личное" title="Мой профиль" description="Контактные данные и параметры вашего аккаунта." /><section className={styles.profileHeader}><div className={styles.profileAvatar}>ГП</div><span><strong>Георгий Пузанов</strong><small>Администратор рабочего пространства</small></span><button type="button" onClick={() => onNotify("Выбор фотографии открыт")}>Изменить фото</button></section><FormSection title="Контактные данные"><div className={styles.formGrid}><Field label="Имя" defaultValue="Георгий" /><Field label="Фамилия" defaultValue="Пузанов" /><Field label="Телефон" defaultValue="+38 093 000 00 00" /><Field label="Email" defaultValue="georgiy@estate-crm.com" /><SelectField label="Язык интерфейса" options={["Русский", "Українська", "English"]} /></div></FormSection><SaveBar onSave={() => onNotify("Профиль сохранён")} /></main>;
}

function FormSection({ title, children }: { title: string; children: ReactNode }) { return <section className={styles.formSection}><h3>{title}</h3>{children}</section>; }
function Field({ label, defaultValue }: { label: string; defaultValue: string }) { return <label className={styles.field}><span>{label}</span><input defaultValue={defaultValue} /></label>; }
function SelectField({ label, options }: { label: string; options: string[] }) { return <label className={styles.field}><span>{label}</span><select>{options.map((option) => <option key={option}>{option}</option>)}</select></label>; }
function SaveBar({ onSave }: { onSave: () => void }) { return <div className={styles.saveBar}><span>Изменения применятся после сохранения.</span><button type="button" onClick={onSave}>Сохранить</button></div>; }
function Rule({ title, description, defaultChecked = false }: { title: string; description: string; defaultChecked?: boolean }) { return <label><span><strong>{title}</strong><small>{description}</small></span><input type="checkbox" defaultChecked={defaultChecked} /></label>; }
function NotificationRow({ title, description, values }: { title: string; description: string; values: boolean[] }) { return <div><span><strong>{title}</strong><small>{description}</small></span>{values.map((checked, index) => <label key={index}><input type="checkbox" defaultChecked={checked} /><i /></label>)}</div>; }
function ActionCard({ title, description, action, onClick }: { title: string; description: string; action: string; onClick: () => void }) { return <article className={styles.actionCard}><span><strong>{title}</strong><small>{description}</small></span><button type="button" onClick={onClick}>{action} →</button></article>; }
