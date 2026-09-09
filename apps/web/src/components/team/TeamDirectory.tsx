"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { TeamMember, TeamRole, TeamStatus } from "@/types/crm";
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
function initials(name: string) { return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toLocaleUpperCase("ru")).join(""); }

type ApiRole = "ADMIN" | "LEAD" | "MANAGER";
type ApiStatus = "ACTIVE" | "INVITED" | "SUSPENDED";
type MemberDeal = { id: string; number: number; title: string; request: string };
type MemberTask = { id: string; title: string; dueDate: string | null; dueTime: string | null; contactName: string | null; dealId: string | null; dealNumber: number | null; dealTitle: string | null };
type TeamRow = TeamMember & { pendingInvitationId: string | null; activeDeals: number; activeTasks: number; todayTasks: number; overdueTasks: number; deals: MemberDeal[]; tasks: MemberTask[] };

type TeamApiResponse = {
  members: Array<{
    id: string; name: string; email: string; phone: string | null; role: ApiRole; status: ApiStatus;
    joinedAt: string; updatedAt: string; pendingInvitationId: string | null; activeDeals: number; activeTasks: number; todayTasks: number; overdueTasks: number;
    deals: MemberDeal[]; tasks: MemberTask[];
  }>;
};

type InvitationLink = { invitationId: string; connectUrl: string; expiresAt: string };

const roleFromApi: Record<ApiRole, TeamRole> = { ADMIN: "Администратор", LEAD: "Руководитель", MANAGER: "Менеджер" };
const statusFromApi: Record<ApiStatus, TeamStatus> = { ACTIVE: "Активен", INVITED: "Приглашён", SUSPENDED: "Доступ отключён" };

function accessForRole(role: TeamRole): TeamMember["access"] {
  if (role === "Администратор") return { deals: true, contacts: true, properties: true, tasks: true, team: true, settings: true };
  if (role === "Руководитель") return { deals: true, contacts: true, properties: true, tasks: true, team: true, settings: false };
  return { deals: true, contacts: true, properties: true, tasks: true, team: false, settings: false };
}

function mapMember(member: TeamApiResponse["members"][number]): TeamRow {
  const role = roleFromApi[member.role];
  return {
    ...member,
    phone: member.phone ?? undefined,
    role,
    status: statusFromApi[member.status],
    initials: initials(member.name),
    lastActive: member.status === "ACTIVE" ? "Доступ активен" : member.status === "INVITED" ? "Ожидает активации" : "Доступ приостановлен",
    access: accessForRole(role),
  };
}

async function requestTeam(): Promise<TeamRow[]> {
  const response = await fetch("/api/crm/team", { cache: "no-store" });
  const payload = await response.json() as TeamApiResponse & { message?: string };
  if (!response.ok) throw new Error(payload.message || "Не удалось загрузить команду.");
  return payload.members.map(mapMember);
}

export function TeamDirectory() {
  const [rows, setRows] = useState<TeamRow[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [loadError, setLoadError] = useState("");
  const [tab, setTab] = useState<ModuleTab>("overview");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invitationLink, setInvitationLink] = useState<InvitationLink | null>(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"Все" | TeamRole>("Все");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("Все");

  useEffect(() => {
    let active = true;
    void requestTeam().then((members) => {
      if (!active) return;
      setRows(members);
      setLoadState("ready");
    }).catch((error: unknown) => {
      if (!active) return;
      setLoadError(error instanceof Error ? error.message : "Не удалось загрузить команду.");
      setLoadState("error");
    });
    return () => { active = false; };
  }, []);

  const selected = rows.find((member) => member.id === selectedId);

  function openMember(id: string) { setSelectedId(id); }
  async function refreshTeam() { setRows(await requestTeam()); }

  if (selected) return <MemberPage member={selected} onBack={() => setSelectedId(null)} />;

  return <section className={styles.page}>
    <header className={styles.topbar}><h1>Команда</h1><label className={styles.search}><span>⌕</span><input type="search" value={search} onFocus={() => setTab("people")} onChange={(event) => setSearch(event.target.value)} placeholder="Сотрудник или email" /></label><button className={styles.primaryButton} type="button" aria-label="Пригласить сотрудника" onClick={() => setInviteOpen(true)}><span>＋</span><b>Пригласить</b></button></header>
    <main className={styles.content}>
      <div className={styles.heading}><div><span className={styles.eyebrow}>Рабочее пространство</span><h2>Управление командой</h2><p>Люди, нагрузка, роли и доступ к данным CRM.</p></div><span>{rows.filter((member) => member.status === "Активен").length} активных сотрудников</span></div>
      <nav className={styles.tabs} aria-label="Разделы команды">{moduleTabs.map((item) => <button className={tab === item.id ? styles.tabActive : ""} type="button" onClick={() => setTab(item.id)} key={item.id}>{item.label}{item.id === "invites" && rows.some((member) => member.status === "Приглашён") && <i>{rows.filter((member) => member.status === "Приглашён").length}</i>}</button>)}</nav>
      {loadState === "loading" && <StatePanel title="Загружаем команду" description="Собираем реальные данные сотрудников и их рабочую нагрузку." />}
      {loadState === "error" && <StatePanel title="Не удалось загрузить команду" description={loadError} />}
      {loadState === "ready" && tab === "overview" && <Overview rows={rows} onOpen={openMember} />}
      {loadState === "ready" && tab === "people" && <People rows={rows} search={search} role={roleFilter} status={statusFilter} onSearch={setSearch} onRole={setRoleFilter} onStatus={setStatusFilter} onOpen={openMember} />}
      {loadState === "ready" && tab === "roles" && <Roles rules={initialRules} />}
      {loadState === "ready" && tab === "invites" && <Invites members={rows} onResend={async (invitationId) => { const response = await fetch(`/api/crm/team/invitations/${invitationId}/resend`, { method: "POST" }); const payload = await response.json() as InvitationLink & { message?: string }; if (!response.ok) throw new Error(payload.message || "Не удалось обновить приглашение."); setInvitationLink(payload); await refreshTeam(); }} onCancel={async (invitationId) => { const response = await fetch(`/api/crm/team/invitations/${invitationId}`, { method: "DELETE" }); const payload = await response.json() as { message?: string }; if (!response.ok) throw new Error(payload.message || "Не удалось отменить приглашение."); await refreshTeam(); }} />}
      {tab === "audit" && <Audit />}
    </main>
    {inviteOpen && <InviteModal onClose={() => setInviteOpen(false)} onCreated={async (link) => { setInviteOpen(false); setInvitationLink(link); setTab("invites"); await refreshTeam(); }} />}
    {invitationLink && <InvitationLinkModal invitation={invitationLink} onClose={() => setInvitationLink(null)} />}
  </section>;
}

function Overview({ rows, onOpen }: { rows: TeamRow[]; onOpen: (id: string) => void }) {
  const active = rows.filter((row) => row.status === "Активен");
  const overdueMembers = active.filter((row) => row.overdueTasks > 0);
  const overdueTasks = overdueMembers.reduce((sum, row) => sum + row.overdueTasks, 0);
  return <div className={styles.overview}>
    <section className={styles.composition}><header><div><h3>Состав команды</h3><p>Роли и состояние доступов</p></div><span>{rows.length} участников</span></header><div className={styles.roleSummary}>{roles.map((role) => <div key={role}><strong>{rows.filter((row) => row.role === role).length}</strong><span>{role === "Администратор" ? "Администратор" : role === "Руководитель" ? "Руководитель" : "Менеджеры"}</span></div>)}<div><strong>{rows.filter((row) => row.status !== "Активен").length}</strong><span>Неактивны</span></div></div></section>
    <div className={styles.workspaceSurface}>
      <section className={styles.loadSection}><header><div><h3>Рабочая нагрузка</h3><p>Кому можно назначать новые обращения</p></div><span>{active.reduce((sum, row) => sum + row.activeDeals, 0)} распределённых сделок</span></header><div className={styles.loadList}>{active.map((member) => { const load = Math.min(100, member.activeDeals * 18 + member.activeTasks * 11); return <button type="button" onClick={() => onOpen(member.id)} key={member.id}><span className={styles.avatar}>{member.initials}</span><span className={styles.person}><strong>{member.name}</strong><small>{member.role} · {member.lastActive}</small></span><span className={styles.loadValue}><b>{member.activeDeals}</b><small>сделок</small></span><span className={styles.loadValue}><b>{member.activeTasks}</b><small>задач</small></span><span className={styles.loadBar}><i style={{ width: `${load}%` }} /><small>{load < 35 ? "Свободен" : load < 70 ? "Нормальная нагрузка" : "Высокая нагрузка"}</small></span>{member.overdueTasks ? <span className={styles.alert}>{member.overdueTasks} просрочена</span> : <span className={styles.ok}>Без просрочек</span>}<span className={styles.chevron}>›</span></button>; })}</div></section>
      <section className={styles.decisions}><header><div><h3>Требует решения</h3><p>Административные действия</p></div></header><div><button type="button" onClick={() => overdueMembers[0] && onOpen(overdueMembers[0].id)} disabled={!overdueMembers.length}><strong>{overdueTasks}</strong><span><b>Просроченные задачи</b><small>{overdueMembers.length ? `У ${overdueMembers.length} сотрудников требуется внимание` : "У команды нет просрочек"}</small></span><i>›</i></button><button type="button" disabled><strong>{rows.filter((row) => row.status === "Приглашён").length}</strong><span><b>Ожидают приглашения</b><small>Показываются реальные членства со статусом ожидания</small></span><i>›</i></button><button type="button" disabled><strong>{rows.filter((row) => row.status === "Доступ отключён").length}</strong><span><b>Доступ отключён</b><small>Сделки таких сотрудников потребуется перераспределить</small></span><i>›</i></button></div></section>
    </div>
  </div>;
}

function People({ rows, search, role, status, onSearch, onRole, onStatus, onOpen }: { rows: TeamRow[]; search: string; role: "Все" | TeamRole; status: StatusFilter; onSearch: (v: string) => void; onRole: (v: "Все" | TeamRole) => void; onStatus: (v: StatusFilter) => void; onOpen: (id: string) => void }) {
  const query = search.trim().toLocaleLowerCase("ru");
  const visible = rows.filter((member) => (!query || [member.name, member.email, member.phone].some((value) => value?.toLocaleLowerCase("ru").includes(query))) && (role === "Все" || member.role === role) && (status === "Все" || member.status === status));
  return <section className={styles.people}><div className={styles.sectionTitle}><div><h3>Все участники</h3><p>Профили сотрудников и состояние доступа</p></div><span>{visible.length} из {rows.length}</span></div><div className={styles.filters}><label><span>Роль</span><select value={role} onChange={(event) => onRole(event.target.value as "Все" | TeamRole)}><option>Все</option>{roles.map((item) => <option key={item}>{item}</option>)}</select></label><label><span>Статус</span><select value={status} onChange={(event) => onStatus(event.target.value as StatusFilter)}><option>Все</option><option>Активен</option><option>Приглашён</option><option>Доступ отключён</option></select></label>{(search || role !== "Все" || status !== "Все") && <button type="button" onClick={() => { onSearch(""); onRole("Все"); onStatus("Все"); }}>Сбросить</button>}</div><div className={styles.peopleGrid}>{roles.map((groupRole) => { const group = visible.filter((member) => member.role === groupRole); return group.length ? <section key={groupRole}><h4>{groupRole === "Менеджер" ? "Менеджеры" : groupRole}</h4>{group.map((member) => <button type="button" onClick={() => onOpen(member.id)} key={member.id}><span className={styles.avatar}>{member.initials}</span><span><strong>{member.name}</strong><small>{member.email}</small></span><span className={`${styles.memberStatus} ${member.status === "Активен" ? styles.active : member.status === "Приглашён" ? styles.invited : ""}`}>{member.status}</span><span className={styles.memberNumbers}>{member.activeDeals} сделок · {member.activeTasks} задач{member.overdueTasks ? ` · ${member.overdueTasks} просрочена` : ""}</span><i>›</i></button>)}</section> : null; })}</div></section>;
}

function Roles({ rules }: { rules: Record<TeamRole, Record<AccessKey, Scope>> }) {
  const [selected, setSelected] = useState<TeamRole>("Менеджер"); const locked = selected === "Администратор";
  return <section className={styles.roles}><aside><h3>Роли</h3><p>Наборы прав для участников</p>{roles.map((role) => <button className={selected === role ? styles.selectedRole : ""} type="button" onClick={() => setSelected(role)} key={role}><span><strong>{role}</strong><small>{role === "Администратор" ? "Полный доступ" : role === "Руководитель" ? "Своя команда и её данные" : "Только рабочие данные"}</small></span><i>›</i></button>)}</aside><div className={styles.matrix}><header><div><span>Системная роль</span><h3>{selected}</h3><p>{locked ? "Полный доступ нельзя ограничить" : "Базовая область данных для этой роли"}</p></div><span>{locked ? "Защищена" : "Сохранение — следующий этап"}</span></header><div className={styles.matrixRows}>{(Object.keys(accessLabels) as AccessKey[]).map((key) => <label key={key}><span><strong>{accessLabels[key].title}</strong><small>{accessLabels[key].description}</small></span><select disabled value={rules[selected][key]} aria-label={`${accessLabels[key].title}: ${rules[selected][key]}`}><option>Нет доступа</option><option>Только свои</option><option>Своя команда</option><option>Все данные</option></select></label>)}</div></div></section>;
}

function Invites({ members, onResend, onCancel }: { members: TeamRow[]; onResend: (id: string) => Promise<void>; onCancel: (id: string) => Promise<void> }) {
  const invited = members.filter((member) => member.status === "Приглашён");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  async function act(id: string, action: (id: string) => Promise<void>) { setBusyId(id); setError(""); try { await action(id); } catch (caught) { setError(caught instanceof Error ? caught.message : "Не удалось выполнить действие."); } finally { setBusyId(null); } }
  return <section className={styles.invites}><div className={styles.sectionTitle}><div><h3>Приглашения</h3><p>Доступ ещё не активирован сотрудником</p></div><span>Ссылка действует 7 дней</span></div>{error && <p className={styles.inlineError} role="alert">{error}</p>}{invited.length ? <div className={styles.inviteList}>{invited.map((member) => <article key={member.id}><span className={styles.avatar}>{member.initials}</span><span><strong>{member.name}</strong><small>{member.email}</small></span><span><b>{member.role}</b><small>{member.lastActive}</small></span><div><button type="button" disabled={!member.pendingInvitationId || busyId === member.id} onClick={() => member.pendingInvitationId && void act(member.id, () => onResend(member.pendingInvitationId!))}>Новая ссылка</button><button type="button" disabled={!member.pendingInvitationId || busyId === member.id} onClick={() => member.pendingInvitationId && void act(member.id, () => onCancel(member.pendingInvitationId!))}>Отменить</button></div></article>)}</div> : <div className={styles.empty}><span>✓</span><h3>Нет ожидающих приглашений</h3><p>Все приглашённые сотрудники уже подключились.</p></div>}</section>;
}

function Audit() { return <section className={styles.audit}><div className={styles.sectionTitle}><div><h3>Журнал действий</h3><p>Изменения ролей, доступов и состава команды</p></div><span>Подключим вместе с управлением командой</span></div><div className={styles.empty}><span>↔</span><h3>Действий пока нет</h3><p>Здесь появятся реальные изменения, а не демонстрационные записи.</p></div></section>; }

function MemberPage({ member, onBack }: { member: TeamRow; onBack: () => void }) {
  const [tab, setTab] = useState<MemberTab>("overview");
  return <section className={styles.page}><header className={styles.topbar}><button className={styles.backLink} type="button" onClick={onBack}>← Команда</button><span className={styles.readOnlyNote}>Профиль из реальной учётной записи</span></header><main className={styles.memberPage}><div className={styles.memberHero}><span className={styles.heroAvatar}>{member.initials}</span><div><span>Участник команды</span><h2>{member.name}</h2><p>{member.email} · {member.role}</p></div><span className={`${styles.memberStatus} ${member.status === "Активен" ? styles.active : ""}`}>{member.status}</span></div><nav className={styles.tabs}>{(["overview", "deals", "tasks", "access"] as MemberTab[]).map((item) => <button className={tab === item ? styles.tabActive : ""} type="button" onClick={() => setTab(item)} key={item}>{item === "overview" ? "Обзор" : item === "deals" ? `Сделки ${member.activeDeals}` : item === "tasks" ? `Задачи ${member.activeTasks}` : "Доступ"}</button>)}</nav>{tab === "overview" && <div className={styles.memberOverview}><section><h3>Рабочая нагрузка</h3><div className={styles.memberMetrics}><div><strong>{member.activeDeals}</strong><span>активных сделок</span></div><div><strong>{member.activeTasks}</strong><span>активных задач</span></div><div><strong>{member.overdueTasks}</strong><span>просрочено</span></div></div></section><section><h3>Профиль</h3><div className={styles.profileRows}><label><span>Имя</span><input readOnly value={member.name} /></label><label><span>Email</span><input readOnly value={member.email} /></label><label><span>Телефон</span><input readOnly value={member.phone || "Не указан"} /></label><label><span>Роль</span><select disabled value={member.role}>{roles.map((role) => <option key={role}>{role}</option>)}</select></label><label><span>Статус</span><select disabled value={member.status}><option>Активен</option><option>Приглашён</option><option>Доступ отключён</option></select></label></div></section></div>}{tab === "deals" && <EntityList items={member.deals.map((deal) => ({ title: `Сделка #${deal.number} · ${deal.title}`, subtitle: deal.request, meta: "Активна" }))} empty="Активных сделок нет" />}{tab === "tasks" && <EntityList items={member.tasks.map((task) => ({ title: task.title, subtitle: task.contactName || task.dealTitle || "Без контакта", meta: task.dueDate ? `${task.dueDate}${task.dueTime ? `, ${task.dueTime}` : ""}` : "Без срока" }))} empty="Задач нет" />}{tab === "access" && <div className={styles.memberAccess}><header><h3>Права роли</h3><p>Сейчас показан базовый набор роли «{member.role}». Индивидуальные настройки подключим следующим этапом.</p></header>{(Object.keys(accessLabels) as AccessKey[]).map((key) => <label key={key}><span><strong>{accessLabels[key].title}</strong><small>{accessLabels[key].description}</small></span><input type="checkbox" checked={member.access[key]} disabled readOnly /></label>)}</div>}</main></section>;
}

function EntityList({ items, empty }: { items: { title: string; subtitle: string; meta: string }[]; empty: string }) { return items.length ? <div className={styles.entityList}>{items.map((item, index) => <article key={`${item.title}-${index}`}><span>◇</span><span><strong>{item.title}</strong><small>{item.subtitle}</small></span><time>{item.meta}</time></article>)}</div> : <div className={styles.empty}><h3>{empty}</h3></div>; }

function StatePanel({ title, description }: { title: string; description: string }) {
  return <div className={styles.empty}><h3>{title}</h3><p>{description}</p></div>;
}

function InviteModal({ onClose, onCreated }: { onClose: () => void; onCreated: (link: InvitationLink) => Promise<void> }) {
  const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [role, setRole] = useState<"LEAD" | "MANAGER">("MANAGER"); const [submitting, setSubmitting] = useState(false); const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setSubmitting(true); setError(""); try { const response = await fetch("/api/crm/team/invitations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, email, role }) }); const payload = await response.json() as InvitationLink & { message?: string }; if (!response.ok) throw new Error(payload.message || "Не удалось создать приглашение."); await onCreated(payload); } catch (caught) { setError(caught instanceof Error ? caught.message : "Не удалось создать приглашение."); } finally { setSubmitting(false); } }
  return <div className={styles.modalLayer}><button className={styles.backdrop} type="button" aria-label="Закрыть" onClick={onClose} /><form className={styles.modal} onSubmit={submit}><header><div><span>Новый участник</span><h2>Пригласить сотрудника</h2></div><button type="button" onClick={onClose}>×</button></header><div className={styles.modalBody}><label><span>Имя</span><input autoFocus required minLength={2} value={name} onChange={(event) => setName(event.target.value)} /></label><label><span>Рабочий email</span><input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label><label><span>Роль</span><select value={role} onChange={(event) => setRole(event.target.value as "LEAD" | "MANAGER")}><option value="MANAGER">Менеджер</option><option value="LEAD">Руководитель</option></select></label>{error && <p className={styles.formError} role="alert">{error}</p>}</div><footer><button type="button" onClick={onClose}>Отмена</button><button className={styles.modalPrimary} type="submit" disabled={submitting}>{submitting ? "Создаём…" : "Создать приглашение"}</button></footer></form></div>;
}

function InvitationLinkModal({ invitation, onClose }: { invitation: InvitationLink; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  async function copy() { await navigator.clipboard.writeText(invitation.connectUrl); setCopied(true); }
  return <div className={styles.modalLayer}><button className={styles.backdrop} type="button" aria-label="Закрыть" onClick={onClose} /><section className={styles.modal}><header><div><span>Приглашение создано</span><h2>Передайте ссылку сотруднику</h2></div><button type="button" onClick={onClose}>×</button></header><div className={styles.modalBody}><p className={styles.modalHint}>Ссылка одноразовая и действует 7 дней. После регистрации сотрудник автоматически появится в активной команде.</p><label><span>Ссылка приглашения</span><input readOnly value={invitation.connectUrl} onFocus={(event) => event.currentTarget.select()} /></label></div><footer><button type="button" onClick={onClose}>Готово</button><button className={styles.modalPrimary} type="button" onClick={() => void copy()}>{copied ? "Скопировано" : "Скопировать ссылку"}</button></footer></section></div>;
}
