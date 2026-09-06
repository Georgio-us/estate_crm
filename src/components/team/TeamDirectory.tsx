"use client";

import { useMemo, useState, type FormEvent } from "react";
import { pipelineStages } from "@/data/mock-pipeline";
import { mockTeam } from "@/data/mock-team";
import { useTasks } from "@/components/tasks/TasksContext";
import type { CrmTask, Deal, TeamMember, TeamRole, TeamStatus } from "@/types/crm";
import styles from "./team.module.css";

type ModuleTab = "overview" | "people" | "roles" | "invites" | "audit";
type MemberTab = "overview" | "deals" | "tasks" | "access";
type StatusFilter = "Все" | TeamStatus;
type AccessKey = keyof TeamMember["access"];
type Scope = "Нет доступа" | "Только свои" | "Своя команда" | "Все данные";

const roles: TeamRole[] = ["Администратор", "Руководитель", "Менеджер"];
const moduleTabs: { id: ModuleTab; label: string }[] = [
  { id: "overview", label: "Обзор" }, { id: "people", label: "Участники" }, { id: "roles", label: "Роли и доступы" }, { id: "invites", label: "Приглашения" }, { id: "audit", label: "Журнал действий" },
];
const accessLabels: Record<AccessKey, { title: string; description: string }> = {
  deals: { title: "Сделки", description: "Воронка и карточки сделок" }, contacts: { title: "Контакты", description: "Клиентская база" }, properties: { title: "Объекты", description: "Каталог недвижимости" }, tasks: { title: "Задачи", description: "Задачи и календарь" }, team: { title: "Команда", description: "Сотрудники и нагрузка" }, settings: { title: "Настройки", description: "Конфигурация CRM" },
};
const initialRules: Record<TeamRole, Record<AccessKey, Scope>> = {
  Администратор: { deals: "Все данные", contacts: "Все данные", properties: "Все данные", tasks: "Все данные", team: "Все данные", settings: "Все данные" },
  Руководитель: { deals: "Своя команда", contacts: "Своя команда", properties: "Все данные", tasks: "Своя команда", team: "Своя команда", settings: "Нет доступа" },
  Менеджер: { deals: "Только свои", contacts: "Только свои", properties: "Все данные", tasks: "Только свои", team: "Нет доступа", settings: "Нет доступа" },
};
const auditEvents = [
  ["Сегодня, 10:32", "Георгий Пузанов", "Изменил роль", "Елена · Менеджер → Руководитель"],
  ["Сегодня, 09:15", "Георгий Пузанов", "Отправил приглашение", "Наталья Савчук · Менеджер"],
  ["Вчера, 18:46", "Елена", "Передала сделки", "3 сделки назначены Андрею"],
  ["28 августа, 15:40", "Георгий Пузанов", "Отключил доступ", "Оксана · доступ приостановлен"],
];

function firstName(name: string) { return name.split(" ")[0]; }
function initials(name: string) { return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toLocaleUpperCase("ru")).join(""); }

export function TeamDirectory() {
  const { tasks } = useTasks();
  const [members, setMembers] = useState(mockTeam);
  const [tab, setTab] = useState<ModuleTab>("overview");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"Все" | TeamRole>("Все");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("Все");
  const [rules, setRules] = useState(initialRules);
  const deals = useMemo(() => pipelineStages.flatMap((stage) => stage.deals), []);
  const rows = useMemo(() => members.map((member) => {
    const name = firstName(member.name);
    const memberTasks = tasks.filter((task) => task.assignee === name);
    return { ...member, activeDeals: deals.filter((deal) => deal.assignee === name).length, activeTasks: memberTasks.filter((task) => task.period !== "completed").length, todayTasks: memberTasks.filter((task) => task.period === "today").length, overdueTasks: memberTasks.filter((task) => task.period === "overdue").length };
  }), [deals, members, tasks]);
  const selected = members.find((member) => member.id === selectedId);

  function openMember(id: string) { setSelectedId(id); }
  function invite(draft: { name: string; email: string; role: TeamRole }) {
    const access = draft.role === "Администратор" ? { deals: true, contacts: true, properties: true, tasks: true, team: true, settings: true } : draft.role === "Руководитель" ? { deals: true, contacts: true, properties: true, tasks: true, team: true, settings: false } : { deals: true, contacts: true, properties: true, tasks: true, team: false, settings: false };
    setMembers((current) => [...current, { id: `member-${Date.now()}`, name: draft.name.trim(), initials: initials(draft.name), email: draft.email.trim(), role: draft.role, status: "Приглашён", lastActive: "Только что", access }]); setInviteOpen(false); setTab("invites");
  }

  if (selected) return <MemberPage member={selected} deals={deals.filter((deal) => deal.assignee === firstName(selected.name))} tasks={tasks.filter((task) => task.assignee === firstName(selected.name))} onBack={() => setSelectedId(null)} onSave={(updated) => { setMembers((current) => current.map((member) => member.id === updated.id ? updated : member)); setSelectedId(null); }} />;

  return <section className={styles.page}>
    <header className={styles.topbar}><h1>Команда</h1><label className={styles.search}><span>⌕</span><input type="search" value={search} onFocus={() => setTab("people")} onChange={(event) => setSearch(event.target.value)} placeholder="Сотрудник или email" /></label><button className={styles.primaryButton} type="button" aria-label="Пригласить сотрудника" onClick={() => setInviteOpen(true)}><span>＋</span><b>Пригласить</b></button></header>
    <main className={styles.content}>
      <div className={styles.heading}><div><span className={styles.eyebrow}>Рабочее пространство</span><h2>Управление командой</h2><p>Люди, нагрузка, роли и доступ к данным CRM.</p></div><span>{members.filter((member) => member.status === "Активен").length} активных сотрудников</span></div>
      <nav className={styles.tabs} aria-label="Разделы команды">{moduleTabs.map((item) => <button className={tab === item.id ? styles.tabActive : ""} type="button" onClick={() => setTab(item.id)} key={item.id}>{item.label}{item.id === "invites" && members.some((member) => member.status === "Приглашён") && <i>{members.filter((member) => member.status === "Приглашён").length}</i>}</button>)}</nav>
      {tab === "overview" && <Overview rows={rows} onOpen={openMember} />}
      {tab === "people" && <People rows={rows} search={search} role={roleFilter} status={statusFilter} onSearch={setSearch} onRole={setRoleFilter} onStatus={setStatusFilter} onOpen={openMember} />}
      {tab === "roles" && <Roles rules={rules} onChange={setRules} />}
      {tab === "invites" && <Invites members={members} onOpenInvite={() => setInviteOpen(true)} onResend={(id) => setMembers((current) => current.map((member) => member.id === id ? { ...member, lastActive: "Повторно отправлено только что" } : member))} onCancel={(id) => setMembers((current) => current.filter((member) => member.id !== id))} />}
      {tab === "audit" && <Audit />}
    </main>
    {inviteOpen && <InviteModal onInvite={invite} onClose={() => setInviteOpen(false)} />}
  </section>;
}

type TeamRow = TeamMember & { activeDeals: number; activeTasks: number; todayTasks: number; overdueTasks: number };

function Overview({ rows, onOpen }: { rows: TeamRow[]; onOpen: (id: string) => void }) {
  const active = rows.filter((row) => row.status === "Активен");
  return <div className={styles.overview}>
    <section className={styles.composition}><header><div><h3>Состав команды</h3><p>Роли и состояние доступов</p></div><span>{rows.length} участников</span></header><div className={styles.roleSummary}>{roles.map((role) => <div key={role}><strong>{rows.filter((row) => row.role === role).length}</strong><span>{role === "Администратор" ? "Администратор" : role === "Руководитель" ? "Руководитель" : "Менеджеры"}</span></div>)}<div><strong>{rows.filter((row) => row.status !== "Активен").length}</strong><span>Неактивны</span></div></div></section>
    <div className={styles.workspaceSurface}>
      <section className={styles.loadSection}><header><div><h3>Рабочая нагрузка</h3><p>Кому можно назначать новые обращения</p></div><span>{active.reduce((sum, row) => sum + row.activeDeals, 0)} распределённых сделок</span></header><div className={styles.loadList}>{active.map((member) => { const load = Math.min(100, member.activeDeals * 18 + member.activeTasks * 11); return <button type="button" onClick={() => onOpen(member.id)} key={member.id}><span className={styles.avatar}>{member.initials}</span><span className={styles.person}><strong>{member.name}</strong><small>{member.role} · {member.lastActive}</small></span><span className={styles.loadValue}><b>{member.activeDeals}</b><small>сделок</small></span><span className={styles.loadValue}><b>{member.activeTasks}</b><small>задач</small></span><span className={styles.loadBar}><i style={{ width: `${load}%` }} /><small>{load < 35 ? "Свободен" : load < 70 ? "Нормальная нагрузка" : "Высокая нагрузка"}</small></span>{member.overdueTasks ? <span className={styles.alert}>{member.overdueTasks} просрочена</span> : <span className={styles.ok}>Без просрочек</span>}<span className={styles.chevron}>›</span></button>; })}</div></section>
      <section className={styles.decisions}><header><div><h3>Требует решения</h3><p>Административные действия</p></div></header><div><button type="button"><strong>1</strong><span><b>Сотрудник с просроченной задачей</b><small>Проверьте нагрузку Елены</small></span><i>›</i></button><button type="button"><strong>{rows.filter((row) => row.status === "Приглашён").length}</strong><span><b>Ожидают приглашения</b><small>Можно отправить приглашение повторно</small></span><i>›</i></button><button type="button"><strong>{rows.filter((row) => row.status === "Доступ отключён").length}</strong><span><b>Доступ отключён</b><small>Сделки необходимо перераспределить</small></span><i>›</i></button></div></section>
    </div>
  </div>;
}

function People({ rows, search, role, status, onSearch, onRole, onStatus, onOpen }: { rows: TeamRow[]; search: string; role: "Все" | TeamRole; status: StatusFilter; onSearch: (v: string) => void; onRole: (v: "Все" | TeamRole) => void; onStatus: (v: StatusFilter) => void; onOpen: (id: string) => void }) {
  const query = search.trim().toLocaleLowerCase("ru");
  const visible = rows.filter((member) => (!query || [member.name, member.email, member.phone].some((value) => value?.toLocaleLowerCase("ru").includes(query))) && (role === "Все" || member.role === role) && (status === "Все" || member.status === status));
  return <section className={styles.people}><div className={styles.sectionTitle}><div><h3>Все участники</h3><p>Профили сотрудников и состояние доступа</p></div><span>{visible.length} из {rows.length}</span></div><div className={styles.filters}><label><span>Роль</span><select value={role} onChange={(event) => onRole(event.target.value as "Все" | TeamRole)}><option>Все</option>{roles.map((item) => <option key={item}>{item}</option>)}</select></label><label><span>Статус</span><select value={status} onChange={(event) => onStatus(event.target.value as StatusFilter)}><option>Все</option><option>Активен</option><option>Приглашён</option><option>Доступ отключён</option></select></label>{(search || role !== "Все" || status !== "Все") && <button type="button" onClick={() => { onSearch(""); onRole("Все"); onStatus("Все"); }}>Сбросить</button>}</div><div className={styles.peopleGrid}>{roles.map((groupRole) => { const group = visible.filter((member) => member.role === groupRole); return group.length ? <section key={groupRole}><h4>{groupRole === "Менеджер" ? "Менеджеры" : groupRole}</h4>{group.map((member) => <button type="button" onClick={() => onOpen(member.id)} key={member.id}><span className={styles.avatar}>{member.initials}</span><span><strong>{member.name}</strong><small>{member.email}</small></span><span className={`${styles.memberStatus} ${member.status === "Активен" ? styles.active : member.status === "Приглашён" ? styles.invited : ""}`}>{member.status}</span><span className={styles.memberNumbers}>{member.activeDeals} сделок · {member.activeTasks} задач{member.overdueTasks ? ` · ${member.overdueTasks} просрочена` : ""}</span><i>›</i></button>)}</section> : null; })}</div></section>;
}

function Roles({ rules, onChange }: { rules: Record<TeamRole, Record<AccessKey, Scope>>; onChange: (rules: Record<TeamRole, Record<AccessKey, Scope>>) => void }) {
  const [selected, setSelected] = useState<TeamRole>("Менеджер"); const locked = selected === "Администратор";
  return <section className={styles.roles}><aside><h3>Роли</h3><p>Наборы прав для участников</p>{roles.map((role) => <button className={selected === role ? styles.selectedRole : ""} type="button" onClick={() => setSelected(role)} key={role}><span><strong>{role}</strong><small>{role === "Администратор" ? "Полный доступ" : role === "Руководитель" ? "Команда и её данные" : "Только рабочие данные"}</small></span><i>›</i></button>)}</aside><div className={styles.matrix}><header><div><span>Системная роль</span><h3>{selected}</h3><p>{locked ? "Полный доступ нельзя ограничить" : "Укажите область данных для каждого раздела"}</p></div><span>{locked ? "Защищена" : "Изменения локальные"}</span></header><div className={styles.matrixRows}>{(Object.keys(accessLabels) as AccessKey[]).map((key) => <label key={key}><span><strong>{accessLabels[key].title}</strong><small>{accessLabels[key].description}</small></span><select disabled={locked} value={rules[selected][key]} onChange={(event) => onChange({ ...rules, [selected]: { ...rules[selected], [key]: event.target.value as Scope } })}><option>Нет доступа</option><option>Только свои</option><option>Своя команда</option><option>Все данные</option></select></label>)}</div></div></section>;
}

function Invites({ members, onOpenInvite, onResend, onCancel }: { members: TeamMember[]; onOpenInvite: () => void; onResend: (id: string) => void; onCancel: (id: string) => void }) {
  const invited = members.filter((member) => member.status === "Приглашён");
  return <section className={styles.invites}><div className={styles.sectionTitle}><div><h3>Приглашения</h3><p>Доступ ещё не активирован сотрудником</p></div><button type="button" onClick={onOpenInvite}>＋ Новое приглашение</button></div>{invited.length ? <div className={styles.inviteList}>{invited.map((member) => <article key={member.id}><span className={styles.avatar}>{member.initials}</span><span><strong>{member.name}</strong><small>{member.email}</small></span><span><b>{member.role}</b><small>{member.lastActive}</small></span><div><button type="button" onClick={() => onResend(member.id)}>Отправить повторно</button><button type="button" onClick={() => onCancel(member.id)}>Отменить</button></div></article>)}</div> : <div className={styles.empty}><span>✓</span><h3>Нет ожидающих приглашений</h3><p>Все приглашённые сотрудники уже подключились.</p></div>}</section>;
}

function Audit() { return <section className={styles.audit}><div className={styles.sectionTitle}><div><h3>Журнал действий</h3><p>Изменения ролей, доступов и состава команды</p></div><span>Последние 30 дней</span></div><div className={styles.auditList}>{auditEvents.map(([date, author, action, detail]) => <article key={`${date}-${action}`}><span className={styles.auditIcon}>↔</span><span><strong>{action}</strong><small>{detail}</small></span><span><b>{author}</b><time>{date}</time></span></article>)}</div></section>; }

function MemberPage({ member, deals, tasks, onBack, onSave }: { member: TeamMember; deals: Deal[]; tasks: CrmTask[]; onBack: () => void; onSave: (member: TeamMember) => void }) {
  const [tab, setTab] = useState<MemberTab>("overview"); const [draft, setDraft] = useState(member); const activeTasks = tasks.filter((task) => task.period !== "completed");
  return <section className={styles.page}><header className={styles.topbar}><button className={styles.backLink} type="button" onClick={onBack}>← Команда</button><button className={styles.saveMember} type="button" onClick={() => onSave({ ...draft, initials: initials(draft.name) })}>Сохранить</button></header><main className={styles.memberPage}><div className={styles.memberHero}><span className={styles.heroAvatar}>{draft.initials}</span><div><span>Участник команды</span><h2>{draft.name}</h2><p>{draft.email} · {draft.role}</p></div><span className={`${styles.memberStatus} ${draft.status === "Активен" ? styles.active : ""}`}>{draft.status}</span></div><nav className={styles.tabs}>{(["overview", "deals", "tasks", "access"] as MemberTab[]).map((item) => <button className={tab === item ? styles.tabActive : ""} type="button" onClick={() => setTab(item)} key={item}>{item === "overview" ? "Обзор" : item === "deals" ? `Сделки ${deals.length}` : item === "tasks" ? `Задачи ${activeTasks.length}` : "Доступ"}</button>)}</nav>{tab === "overview" && <div className={styles.memberOverview}><section><h3>Рабочая нагрузка</h3><div className={styles.memberMetrics}><div><strong>{deals.length}</strong><span>активных сделок</span></div><div><strong>{activeTasks.length}</strong><span>активных задач</span></div><div><strong>{tasks.filter((task) => task.period === "overdue").length}</strong><span>просрочено</span></div></div></section><section><h3>Профиль</h3><div className={styles.profileRows}><label><span>Имя</span><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label><label><span>Email</span><input value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} /></label><label><span>Телефон</span><input value={draft.phone || ""} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} /></label><label><span>Роль</span><select value={draft.role} onChange={(event) => setDraft({ ...draft, role: event.target.value as TeamRole })}>{roles.map((role) => <option key={role}>{role}</option>)}</select></label><label><span>Статус</span><select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as TeamStatus })}><option>Активен</option><option>Приглашён</option><option>Доступ отключён</option></select></label></div></section></div>}{tab === "deals" && <EntityList items={deals.map((deal) => ({ title: deal.contactName, subtitle: deal.request, meta: deal.task || "Следующая задача не назначена" }))} empty="Активных сделок нет" />}{tab === "tasks" && <EntityList items={tasks.map((task) => ({ title: task.title, subtitle: task.contactName || "Без контакта", meta: task.completedAt || `${task.dueLabel}${task.dueTime ? `, ${task.dueTime}` : ""}` }))} empty="Задач нет" />}{tab === "access" && <div className={styles.memberAccess}><header><h3>Индивидуальные права</h3><p>Переопределяют стандартные права роли «{draft.role}».</p></header>{(Object.keys(accessLabels) as AccessKey[]).map((key) => <label key={key}><span><strong>{accessLabels[key].title}</strong><small>{accessLabels[key].description}</small></span><input type="checkbox" checked={draft.access[key]} disabled={draft.role === "Администратор"} onChange={(event) => setDraft({ ...draft, access: { ...draft.access, [key]: event.target.checked } })} /></label>)}</div>}</main></section>;
}

function EntityList({ items, empty }: { items: { title: string; subtitle: string; meta: string }[]; empty: string }) { return items.length ? <div className={styles.entityList}>{items.map((item, index) => <article key={`${item.title}-${index}`}><span>◇</span><span><strong>{item.title}</strong><small>{item.subtitle}</small></span><time>{item.meta}</time></article>)}</div> : <div className={styles.empty}><h3>{empty}</h3></div>; }

function InviteModal({ onInvite, onClose }: { onInvite: (draft: { name: string; email: string; role: TeamRole }) => void; onClose: () => void }) {
  const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [role, setRole] = useState<TeamRole>("Менеджер");
  function submit(event: FormEvent) { event.preventDefault(); if (name.trim() && email.trim()) onInvite({ name, email, role }); }
  return <div className={styles.modalLayer}><button className={styles.backdrop} type="button" aria-label="Закрыть приглашение" onClick={onClose} /><form className={styles.modal} onSubmit={submit}><header><div><span>Новый участник</span><h2>Пригласить сотрудника</h2></div><button type="button" onClick={onClose}>×</button></header><div className={styles.modalBody}><label><span>Имя</span><input autoFocus value={name} onChange={(event) => setName(event.target.value)} /></label><label><span>Рабочий email</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label><label><span>Роль</span><select value={role} onChange={(event) => setRole(event.target.value as TeamRole)}>{roles.map((item) => <option key={item}>{item}</option>)}</select></label></div><footer><button type="button" onClick={onClose}>Отмена</button><button className={styles.modalPrimary} type="submit" disabled={!name.trim() || !email.trim()}>Отправить приглашение</button></footer></form></div>;
}
