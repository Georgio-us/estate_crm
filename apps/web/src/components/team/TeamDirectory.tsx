"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { useCurrentUser } from "@/components/auth/AuthContext";
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
type TelegramAudience = "ALL" | "OWN" | "SELECTED" | "NONE";
type TelegramPreferences = { connected: boolean; role: ApiRole; audience: TelegramAudience; leadNotifications: boolean; taskReminderNotifications: boolean; taskOverdueNotifications: boolean; selectedUserIds: string[]; members: Array<{ id: string; name: string; role: ApiRole }> };
type AuditEvent = { id: string; title: string; description: string | null; occurredAt: string; author: { id: string; name: string } | null };

const roleFromApi: Record<ApiRole, TeamRole> = { ADMIN: "Администратор", LEAD: "Руководитель", MANAGER: "Менеджер" };
const statusFromApi: Record<ApiStatus, TeamStatus> = { ACTIVE: "Активен", INVITED: "Приглашён", SUSPENDED: "Доступ отключён" };
const roleToApi: Record<TeamRole, ApiRole> = { Администратор: "ADMIN", Руководитель: "LEAD", Менеджер: "MANAGER" };
const statusToApi: Record<TeamStatus, ApiStatus> = { Активен: "ACTIVE", Приглашён: "INVITED", "Доступ отключён": "SUSPENDED" };

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
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentUser = useCurrentUser();
  const [rows, setRows] = useState<TeamRow[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [loadError, setLoadError] = useState("");
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

  const requestedTab = searchParams.get("tab");
  const tab: ModuleTab = moduleTabs.some((item) => item.id === requestedTab) ? requestedTab as ModuleTab : "overview";
  const selectedId = searchParams.get("member");
  const selected = rows.find((member) => member.id === selectedId);

  function setTab(nextTab: ModuleTab) { router.push(nextTab === "overview" ? "/team" : `/team?tab=${nextTab}`); }
  function openMember(id: string) { router.push(`/team?member=${id}`); }
  async function refreshTeam() { setRows(await requestTeam()); }

  if (selected) return <MemberPage key={`${selected.id}-${selected.name}-${selected.phone}-${selected.role}-${selected.status}`} member={selected} currentUserId={currentUser.id} currentUserRole={currentUser.organization.role} onBack={() => router.push("/team")} onUpdated={refreshTeam} />;

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
  return <section className={styles.roles}><aside><h3>Роли</h3><p>Наборы прав для участников</p>{roles.map((role) => <button className={selected === role ? styles.selectedRole : ""} type="button" onClick={() => setSelected(role)} key={role}><span><strong>{role}</strong><small>{role === "Администратор" ? "Полный доступ" : role === "Руководитель" ? "Своя команда и её данные" : "Только рабочие данные"}</small></span><i>›</i></button>)}</aside><div className={styles.matrix}><header><div><span>Системная роль</span><h3>{selected}</h3><p>{locked ? "Полный доступ нельзя ограничить" : "Базовая область данных для этой роли"}</p></div><span>{locked ? "Защищена" : "Роль назначается в профиле"}</span></header><div className={styles.matrixRows}>{(Object.keys(accessLabels) as AccessKey[]).map((key) => <label key={key}><span><strong>{accessLabels[key].title}</strong><small>{accessLabels[key].description}</small></span><select disabled value={rules[selected][key]} aria-label={`${accessLabels[key].title}: ${rules[selected][key]}`}><option>Нет доступа</option><option>Только свои</option><option>Своя команда</option><option>Все данные</option></select></label>)}</div></div></section>;
}

function Invites({ members, onResend, onCancel }: { members: TeamRow[]; onResend: (id: string) => Promise<void>; onCancel: (id: string) => Promise<void> }) {
  const invited = members.filter((member) => member.status === "Приглашён");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  async function act(id: string, action: (id: string) => Promise<void>) { setBusyId(id); setError(""); try { await action(id); } catch (caught) { setError(caught instanceof Error ? caught.message : "Не удалось выполнить действие."); } finally { setBusyId(null); } }
  return <section className={styles.invites}><div className={styles.sectionTitle}><div><h3>Приглашения</h3><p>Доступ ещё не активирован сотрудником</p></div><span>Ссылка действует 7 дней</span></div>{error && <p className={styles.inlineError} role="alert">{error}</p>}{invited.length ? <div className={styles.inviteList}>{invited.map((member) => <article key={member.id}><span className={styles.avatar}>{member.initials}</span><span><strong>{member.name}</strong><small>{member.email}</small></span><span><b>{member.role}</b><small>{member.lastActive}</small></span><div><button type="button" disabled={!member.pendingInvitationId || busyId === member.id} onClick={() => member.pendingInvitationId && void act(member.id, () => onResend(member.pendingInvitationId!))}>Новая ссылка</button><button type="button" disabled={!member.pendingInvitationId || busyId === member.id} onClick={() => member.pendingInvitationId && void act(member.id, () => onCancel(member.pendingInvitationId!))}>Отменить</button></div></article>)}</div> : <div className={styles.empty}><span>✓</span><h3>Нет ожидающих приглашений</h3><p>Все приглашённые сотрудники уже подключились.</p></div>}</section>;
}

function Audit() {
  const [events, setEvents] = useState<AuditEvent[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/crm/team/audit", { cache: "no-store", signal: controller.signal })
      .then(async (response) => { const payload = await response.json() as { events?: AuditEvent[]; message?: string }; if (!response.ok) throw new Error(payload.message || "Не удалось загрузить журнал."); setEvents(payload.events ?? []); })
      .catch((caught: unknown) => { if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "Не удалось загрузить журнал."); });
    return () => controller.abort();
  }, []);
  return <section className={styles.audit}><div className={styles.sectionTitle}><div><h3>Журнал действий</h3><p>Изменения ролей, доступов и уведомлений</p></div><span>{events?.length ?? 0} событий</span></div>{error ? <div className={styles.empty}><h3>Журнал недоступен</h3><p>{error}</p></div> : events === null ? <div className={styles.empty}><h3>Загружаем журнал</h3></div> : events.length ? <div className={styles.auditList}>{events.map((event) => <article key={event.id}><span>↔</span><div><strong>{event.title}</strong><p>{event.description}</p><small>{event.author?.name ?? "Система"}</small></div><time>{new Date(event.occurredAt).toLocaleString("ru")}</time></article>)}</div> : <div className={styles.empty}><span>✓</span><h3>Изменений пока нет</h3><p>Первое изменение роли, профиля или доступа появится здесь.</p></div>}</section>;
}

function MemberPage({ member, currentUserId, currentUserRole, onBack, onUpdated }: { member: TeamRow; currentUserId: string; currentUserRole: ApiRole; onBack: () => void; onUpdated: () => Promise<void> }) {
  const [tab, setTab] = useState<MemberTab>("overview");
  const [name, setName] = useState(member.name);
  const [phone, setPhone] = useState(member.phone ?? "");
  const [role, setRole] = useState<TeamRole>(member.role);
  const [status, setStatus] = useState<TeamStatus>(member.status);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [confirmSuspension, setConfirmSuspension] = useState(false);
  const editable = currentUserRole === "ADMIN" && member.status !== "Приглашён";
  const changed = name.trim() !== member.name || phone.trim() !== (member.phone ?? "") || role !== member.role || status !== member.status;

  async function save(confirmAssignedWork = false) {
    if (!editable || !changed) return;
    if (status === "Доступ отключён" && member.status === "Активен" && (member.activeDeals > 0 || member.activeTasks > 0) && !confirmAssignedWork) { setConfirmSuspension(true); return; }
    setSaving(true); setFeedback("");
    try {
      const response = await fetch(`/api/crm/team/${member.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: name.trim(), phone: phone.trim() || null, role: roleToApi[role], status: statusToApi[status], confirmAssignedWork }) });
      const payload = await response.json() as { message?: string; error?: string };
      if (!response.ok) {
        if (payload.error === "assigned_work_confirmation_required") { setConfirmSuspension(true); return; }
        throw new Error(payload.message || "Не удалось сохранить сотрудника.");
      }
      await onUpdated(); setConfirmSuspension(false); setFeedback("Изменения сохранены.");
    } catch (caught) { setFeedback(caught instanceof Error ? caught.message : "Не удалось сохранить сотрудника."); }
    finally { setSaving(false); }
  }

  return <section className={styles.page}><header className={styles.topbar}><button className={styles.backLink} type="button" onClick={onBack}>← Команда</button><span className={styles.readOnlyNote}>{editable ? "Управление профилем и доступом" : "Просмотр профиля"}</span>{editable && <button className={styles.saveMember} type="button" disabled={!changed || saving} onClick={() => { void save(); }}>{saving ? "Сохраняем…" : "Сохранить"}</button>}</header><main className={styles.memberPage}><div className={styles.memberHero}><span className={styles.heroAvatar}>{member.initials}</span><div><span>Участник команды</span><h2>{member.name}</h2><p>{member.email} · {member.role}</p></div><span className={`${styles.memberStatus} ${member.status === "Активен" ? styles.active : ""}`}>{member.status}</span></div>{feedback && <p className={styles.memberFeedback} role="status">{feedback}</p>}<nav className={styles.tabs}>{(["overview", "deals", "tasks", "access"] as MemberTab[]).map((item) => <button className={tab === item ? styles.tabActive : ""} type="button" onClick={() => setTab(item)} key={item}>{item === "overview" ? "Обзор" : item === "deals" ? `Сделки ${member.activeDeals}` : item === "tasks" ? `Задачи ${member.activeTasks}` : "Доступ и уведомления"}</button>)}</nav>{tab === "overview" && <div className={styles.memberOverview}><section><h3>Рабочая нагрузка</h3><div className={styles.memberMetrics}><div><strong>{member.activeDeals}</strong><span>активных сделок</span></div><div><strong>{member.activeTasks}</strong><span>активных задач</span></div><div><strong>{member.overdueTasks}</strong><span>просрочено</span></div></div></section><section><h3>Профиль</h3><div className={styles.profileRows}><label><span>Имя</span><input readOnly={!editable} value={name} onChange={(event) => setName(event.target.value)} /></label><label><span>Email</span><input readOnly value={member.email} /></label><label><span>Телефон</span><input readOnly={!editable} value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Не указан" /></label><label><span>Роль</span><select disabled={!editable || member.id === currentUserId} value={role} onChange={(event) => setRole(event.target.value as TeamRole)}>{roles.map((item) => <option key={item}>{item}</option>)}</select></label><label><span>Статус</span><select disabled={!editable || member.id === currentUserId} value={status} onChange={(event) => setStatus(event.target.value as TeamStatus)}><option>Активен</option><option>Доступ отключён</option></select></label></div>{member.id === currentUserId && editable && <p className={styles.fieldNote}>Собственную роль и доступ должен изменять другой администратор. Это защищает рабочее пространство от случайной блокировки.</p>}</section></div>}{tab === "deals" && <EntityList items={member.deals.map((deal) => ({ title: `Сделка #${deal.number} · ${deal.title}`, subtitle: deal.request, meta: "Активна" }))} empty="Активных сделок нет" />}{tab === "tasks" && <EntityList items={member.tasks.map((task) => ({ title: task.title, subtitle: task.contactName || task.dealTitle || "Без контакта", meta: task.dueDate ? `${task.dueDate}${task.dueTime ? `, ${task.dueTime}` : ""}` : "Без срока" }))} empty="Задач нет" />}{tab === "access" && <div className={styles.accessStack}><div className={styles.memberAccess}><header><h3>Права роли</h3><p>Базовый набор роли «{role}». Изменение роли применяется после сохранения профиля.</p></header>{(Object.keys(accessLabels) as AccessKey[]).map((key) => <label key={key}><span><strong>{accessLabels[key].title}</strong><small>{accessLabels[key].description}</small></span><input type="checkbox" checked={accessForRole(role)[key]} disabled readOnly /></label>)}</div><MemberNotifications member={member} currentUserId={currentUserId} currentUserRole={currentUserRole} /></div>}</main>{confirmSuspension && <ConfirmSuspension member={member} busy={saving} onCancel={() => setConfirmSuspension(false)} onConfirm={() => { void save(true); }} />}</section>;
}

function ConfirmSuspension({ member, busy, onCancel, onConfirm }: { member: TeamRow; busy: boolean; onCancel: () => void; onConfirm: () => void }) {
  return <div className={styles.modalLayer}><button className={styles.backdrop} type="button" aria-label="Закрыть" onClick={onCancel} /><section className={styles.modal}><header><div><span>Отключение доступа</span><h2>Приостановить доступ для {member.name}?</h2></div><button type="button" onClick={onCancel}>×</button></header><div className={styles.modalBody}><p className={styles.modalHint}>Сотрудник сразу выйдет из CRM и перестанет получать Telegram-уведомления.</p><div className={styles.suspensionFacts}><span><strong>{member.activeDeals}</strong> активных сделок</span><span><strong>{member.activeTasks}</strong> активных задач</span></div><p className={styles.modalHint}>Рабочие данные не удалятся. Их можно будет переназначить другому сотруднику.</p></div><footer><button type="button" onClick={onCancel}>Отмена</button><button className={styles.dangerButton} type="button" disabled={busy} onClick={onConfirm}>{busy ? "Отключаем…" : "Отключить доступ"}</button></footer></section></div>;
}

function MemberNotifications({ member, currentUserId, currentUserRole }: { member: TeamRow; currentUserId: string; currentUserRole: ApiRole }) {
  const [saved, setSaved] = useState<TelegramPreferences | null>(null);
  const [draft, setDraft] = useState<TelegramPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");
  const canManage = currentUserId === member.id || currentUserRole === "ADMIN" || (currentUserRole === "LEAD" && member.role !== "Администратор");
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/crm/team/${member.id}/notifications`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => { const payload = await response.json() as TelegramPreferences & { message?: string }; if (!response.ok) throw new Error(payload.message || "Не удалось загрузить настройки уведомлений."); setSaved(payload); setDraft(payload); })
      .catch((caught: unknown) => { if (!controller.signal.aborted) setFeedback(caught instanceof Error ? caught.message : "Не удалось загрузить настройки уведомлений."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [member.id]);
  async function save() {
    if (!draft) return;
    setSaving(true); setFeedback("");
    try {
      const response = await fetch(`/api/crm/team/${member.id}/notifications`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ audience: draft.audience, leadNotifications: draft.leadNotifications, taskReminderNotifications: draft.taskReminderNotifications, taskOverdueNotifications: draft.taskOverdueNotifications, selectedUserIds: draft.selectedUserIds }) });
      const payload = await response.json() as TelegramPreferences & { message?: string };
      if (!response.ok) throw new Error(payload.message || "Не удалось сохранить уведомления.");
      setSaved(payload); setDraft(payload); setFeedback("Настройки уведомлений сохранены.");
    } catch (caught) { setFeedback(caught instanceof Error ? caught.message : "Не удалось сохранить уведомления."); }
    finally { setSaving(false); }
  }
  if (loading) return <section className={styles.notificationPanel}><h3>Telegram-уведомления</h3><p>Загружаем настройки…</p></section>;
  if (!draft) return <section className={styles.notificationPanel}><h3>Telegram-уведомления</h3><p>{feedback}</p></section>;
  if (!draft.connected) return <section className={styles.notificationPanel}><header><div><h3>Telegram-уведомления</h3><p>Сотрудник ещё не связал свой Telegram с CRM.</p></div><span className={styles.disconnected}>Не подключён</span></header>{member.id === currentUserId ? <Link href="/integrations">Подключить Telegram →</Link> : <p>Попросите сотрудника войти под своим аккаунтом и подключить бота в разделе «Интеграции».</p>}</section>;
  const manager = draft.role === "MANAGER";
  const changed = JSON.stringify(draft) !== JSON.stringify(saved);
  return <section className={styles.notificationPanel}><header><div><h3>Telegram-уведомления</h3><p>Что бот отправляет этому сотруднику и по чьей работе.</p></div><span className={styles.connected}>Подключён</span></header><label className={styles.notificationScope}><span>Охват событий</span><select disabled={!canManage} value={draft.audience} onChange={(event) => setDraft({ ...draft, audience: event.target.value as TelegramAudience, selectedUserIds: event.target.value === "SELECTED" ? draft.selectedUserIds : [] })}>{!manager && <option value="ALL">Вся команда</option>}<option value="OWN">Только свои</option>{!manager && <option value="SELECTED">Выбранные сотрудники</option>}<option value="NONE">Не присылать</option></select></label>{draft.audience === "SELECTED" && <div className={styles.notificationMembers}>{draft.members.map((item) => <label key={item.id}><input disabled={!canManage} type="checkbox" checked={draft.selectedUserIds.includes(item.id)} onChange={(event) => setDraft({ ...draft, selectedUserIds: event.target.checked ? [...draft.selectedUserIds, item.id] : draft.selectedUserIds.filter((id) => id !== item.id) })} /><span><strong>{item.name}</strong><small>{roleFromApi[item.role]}</small></span></label>)}</div>}<div className={styles.notificationKinds}><NotificationToggle disabled={!canManage} label="Назначение и срок задачи" description="Сразу при назначении и за 30 минут до срока" checked={draft.taskReminderNotifications} onChange={(checked) => setDraft({ ...draft, taskReminderNotifications: checked })} /><NotificationToggle disabled={!canManage} label="Новые лиды" description="Короткое сообщение с номером сделки" checked={draft.leadNotifications} onChange={(checked) => setDraft({ ...draft, leadNotifications: checked })} /><NotificationToggle disabled={!canManage} label="Просроченные задачи" description="Отдельный сигнал после наступления срока" checked={draft.taskOverdueNotifications} onChange={(checked) => setDraft({ ...draft, taskOverdueNotifications: checked })} /></div>{canManage && <button className={styles.saveNotifications} type="button" disabled={saving || !changed || (draft.audience === "SELECTED" && !draft.selectedUserIds.length)} onClick={() => { void save(); }}>{saving ? "Сохраняем…" : "Сохранить уведомления"}</button>}{feedback && <p className={styles.notificationFeedback}>{feedback}</p>}</section>;
}

function NotificationToggle({ label, description, checked, disabled, onChange }: { label: string; description: string; checked: boolean; disabled: boolean; onChange: (checked: boolean) => void }) {
  return <label><span><strong>{label}</strong><small>{description}</small></span><input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} /></label>;
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
