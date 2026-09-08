"use client";

import { useEffect, useMemo, useState } from "react";
import { useCurrentUser } from "@/components/auth/AuthContext";
import { mapApiActivity, type ApiActivity } from "@/lib/activity";
import type { ActivityEvent, Contact, Deal } from "@/types/crm";
import { ContactDrawer } from "./ContactDrawer";
import { NewContactModal, type NewContactDraft } from "./NewContactModal";
import styles from "./contacts.module.css";

export interface RelatedDeal {
  deal: Deal;
  stageTitle: string;
  stageColor: string;
}

const sourceLabels: Record<Deal["source"], string> = { Meta: "Meta", Website: "Сайт", Manual: "Вручную" };
const sourceFromApi = { META: "Meta", WEBSITE: "Website", MANUAL: "Manual" } as const;
const sourceToApi = { Meta: "META", Website: "WEBSITE", Manual: "MANUAL" } as const;

interface ApiContact {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  telegram: string | null;
  source: keyof typeof sourceFromApi;
  assignee: { id: string; name: string } | null;
  dealIds?: string[];
  deals?: Array<{ id: string; number: number; title: string; request: string; budget: string | null; stage: { id: string; title: string; color: string } }>;
  comment: string | null;
  createdAt: string;
  updatedAt: string;
}

function mapApiContact(contact: ApiContact): Contact {
  return {
    id: contact.id,
    name: contact.name,
    phone: contact.phone || "",
    email: contact.email || undefined,
    telegram: contact.telegram || undefined,
    source: sourceFromApi[contact.source],
    assigneeId: contact.assignee?.id,
    assignee: contact.assignee?.name || "Не назначен",
    dealIds: contact.dealIds || [],
    lastContact: "Нет взаимодействий",
    comment: contact.comment || undefined,
    createdAt: new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(new Date(contact.createdAt)),
  };
}

function mapRelatedDeal(contact: ApiContact, item: NonNullable<ApiContact["deals"]>[number]): RelatedDeal {
  return {
    deal: {
      id: item.id,
      number: item.number,
      contactId: contact.id,
      contactName: contact.name,
      phone: contact.phone || "",
      title: item.title,
      request: item.request,
      budget: item.budget || undefined,
      source: sourceFromApi[contact.source],
      assigneeId: contact.assignee?.id,
      assignee: contact.assignee?.name || "Не назначен",
    },
    stageTitle: item.stage.title,
    stageColor: item.stage.color,
  };
}

async function requestContacts(): Promise<{ contacts: Contact[]; dealsById: Map<string, RelatedDeal> }> {
  const response = await fetch("/api/crm/contacts", { cache: "no-store" });
  if (!response.ok) throw new Error("Не удалось загрузить контакты.");
  const payload = await response.json() as { contacts: ApiContact[] };
  const dealsById = new Map<string, RelatedDeal>();
  for (const contact of payload.contacts) {
    for (const item of contact.deals || []) {
      dealsById.set(item.id, mapRelatedDeal(contact, item));
    }
  }
  return { contacts: payload.contacts.map(mapApiContact), dealsById };
}

async function requestContactActivities(contactId: string): Promise<ActivityEvent[]> {
  const response = await fetch(`/api/crm/contacts/${contactId}/activities`, { cache: "no-store" });
  if (!response.ok) throw new Error("Не удалось загрузить историю контакта.");
  const payload = await response.json() as { activities: ApiActivity[] };
  return payload.activities.map(mapApiActivity);
}

export function ContactsDirectory() {
  const user = useCurrentUser();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [dealsById, setDealsById] = useState<Map<string, RelatedDeal>>(() => new Map());
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [contactActivities, setContactActivities] = useState<Record<string, ActivityEvent[]>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [search, setSearch] = useState("");
  const [assignee, setAssignee] = useState("all");
  const [source, setSource] = useState("all");
  const [dealFilter, setDealFilter] = useState("all");

  useEffect(() => {
    let active = true;
    void requestContacts().then(
      (result) => { if (active) { setContacts(result.contacts); setDealsById(result.dealsById); setLoadState("ready"); } },
      () => { if (active) setLoadState("error"); },
    );
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    const contactId = selectedId;
    let active = true;
    void requestContactActivities(contactId).then((items) => {
      if (active) setContactActivities((current) => ({ ...current, [contactId]: items }));
    }, () => undefined);
    return () => { active = false; };
  }, [selectedId]);

  async function retryContacts() {
    setLoadState("loading");
    try {
      const result = await requestContacts();
      setContacts(result.contacts);
      setDealsById(result.dealsById);
      setLoadState("ready");
    } catch {
      setLoadState("error");
    }
  }

  const selectedContact = contacts.find((contact) => contact.id === selectedId);
  const selectedDeals = selectedContact?.dealIds.map((id) => dealsById.get(id)).filter((item): item is RelatedDeal => Boolean(item)) || [];
  const selectedActivities = selectedContact ? contactActivities[selectedContact.id] || [] : [];

  const visibleContacts = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("ru");
    return contacts.filter((contact) => {
      const matchesSearch = !query || [contact.name, contact.phone, contact.email, contact.telegram].some((value) => value?.toLocaleLowerCase("ru").includes(query));
      const matchesDeals = dealFilter === "all" || (dealFilter === "with" ? contact.dealIds.length > 0 : contact.dealIds.length === 0);
      return matchesSearch && (assignee === "all" || contact.assignee === assignee) && (source === "all" || contact.source === source) && matchesDeals;
    });
  }, [assignee, contacts, dealFilter, search, source]);

  const hasFilters = Boolean(search || assignee !== "all" || source !== "all" || dealFilter !== "all");
  const assigneeOptions = useMemo(() => Array.from(new Set(contacts.map((contact) => contact.assignee))), [contacts]);

  function resetFilters() { setSearch(""); setAssignee("all"); setSource("all"); setDealFilter("all"); }

  async function createContact(draft: NewContactDraft) {
    const response = await fetch("/api/crm/contacts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: draft.name.trim(),
        phone: draft.phone.trim() || undefined,
        email: draft.email.trim() || undefined,
        telegram: draft.telegram.trim() || undefined,
        source: sourceToApi[draft.source],
        assigneeId: draft.assigneeId || null,
        comment: draft.comment.trim() || undefined,
      }),
    });
    const payload = await response.json() as { contact?: ApiContact; message?: string };
    if (!response.ok || !payload.contact) throw new Error(payload.message || "Не удалось создать контакт.");
    const contact = mapApiContact(payload.contact);
    setContacts((current) => [contact, ...current]);
    setIsCreating(false);
    setSelectedId(contact.id);
  }

  async function saveContact(nextContact: Contact) {
    const response = await fetch(`/api/crm/contacts/${nextContact.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: nextContact.name,
        phone: nextContact.phone,
        email: nextContact.email || null,
        telegram: nextContact.telegram || null,
        source: sourceToApi[nextContact.source],
        assigneeId: nextContact.assigneeId || null,
        comment: nextContact.comment || null,
      }),
    });
    const payload = await response.json() as { contact?: ApiContact; message?: string };
    if (!response.ok || !payload.contact) throw new Error(payload.message || "Не удалось сохранить контакт.");
    const saved = mapApiContact(payload.contact);
    setContacts((current) => current.map((contact) => contact.id === saved.id ? saved : contact));
    setDealsById((current) => {
      const next = new Map(current);
      for (const dealId of saved.dealIds) next.delete(dealId);
      for (const item of payload.contact!.deals || []) next.set(item.id, mapRelatedDeal(payload.contact!, item));
      return next;
    });
    return saved;
  }

  async function addContactNote(text: string) {
    if (!selectedContact) throw new Error("Контакт больше не открыт.");
    const contactId = selectedContact.id;
    const response = await fetch(`/api/crm/contacts/${contactId}/notes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
    });
    const payload = await response.json() as { activity?: ApiActivity; message?: string };
    if (!response.ok || !payload.activity) throw new Error(payload.message || "Не удалось сохранить примечание.");
    const activity = mapApiActivity(payload.activity);
    setContactActivities((current) => ({ ...current, [contactId]: [activity, ...(current[contactId] || [])] }));
    setContacts((current) => current.map((contact) => contact.id === contactId ? { ...contact, lastContact: "Только что" } : contact));
  }

  return (
    <section className={styles.page}>
      <header className={styles.topbar}>
        <h1>Контакты</h1>
        <label className={styles.search}><span>⌕</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Имя, телефон, email или Telegram" /></label>
        <button className={styles.primaryButton} type="button" aria-label="Новый контакт" onClick={() => setIsCreating(true)}>
          <span aria-hidden="true">＋</span><span className={styles.actionLabel}>Новый контакт</span>
        </button>
      </header>

      <div className={styles.content}>
        <div className={styles.heading}>
          <div><span className={styles.eyebrow}>Клиентская база</span><h2>Все контакты</h2><p>Люди и компании независимо от количества обращений</p></div>
          <span>{contacts.length} контактов</span>
        </div>

        <section className={styles.workspace}>
          <div className={styles.filters}>
            <Filter label="Ответственный" value={assignee} onChange={setAssignee} options={assigneeOptions} />
            <Filter label="Источник" value={source} onChange={setSource} options={["Meta", "Website", "Manual"]} optionLabels={{ Website: "Сайт", Manual: "Вручную" }} />
            <Filter label="Сделки" value={dealFilter} onChange={setDealFilter} options={["with", "without"]} optionLabels={{ with: "Есть активные", without: "Без сделок" }} />
            <span className={styles.resultCount}>{visibleContacts.length} из {contacts.length}</span>
            {hasFilters && <button className={styles.resetButton} type="button" onClick={resetFilters}>Сбросить</button>}
          </div>

          {loadState === "loading" ? <StatusState symbol="…" title="Загружаем контакты" text="Получаем клиентскую базу из CRM." /> : loadState === "error" ? <StatusState symbol="!" title="Не удалось загрузить контакты" text="Проверьте соединение с сервером и попробуйте ещё раз." action="Повторить" onAction={() => { void retryContacts(); }} /> : visibleContacts.length ? (
            <div className={styles.tableRegion}>
              <div className={styles.tableWrap}>
                <table>
                  <thead><tr><th>Контакт</th><th>Телефон и каналы</th><th>Ответственный</th><th>Источник</th><th>Активные сделки</th><th>Последний контакт</th><th>Ближайшая задача</th></tr></thead>
                  <tbody>{visibleContacts.map((contact) => {
                    const relatedDeals = contact.dealIds.map((id) => dealsById.get(id)).filter(Boolean);
                    return (
                      <tr key={contact.id} onClick={() => setSelectedId(contact.id)}>
                        <td><div className={styles.contactCell}><span className={styles.avatar}>{initials(contact.name)}</span><span><strong>{contact.name}</strong><small>Добавлен {contact.createdAt}</small></span></div></td>
                        <td>{contact.phone ? <a href={`tel:${contact.phone.replaceAll(" ", "")}`} onClick={(event) => event.stopPropagation()}>{contact.phone}</a> : <span className={styles.muted}>Телефон не указан</span>}<small>{contact.telegram || contact.email || "Дополнительных каналов нет"}</small></td>
                        <td><span className={styles.assigneeDot}>{contact.assignee === "Не назначен" ? "—" : contact.assignee.slice(0, 1)}</span>{contact.assignee}</td>
                        <td><span className={styles.sourceTag}>{sourceLabels[contact.source]}</span></td>
                        <td>{relatedDeals.length ? <><strong>{relatedDeals.length}</strong><small>{relatedDeals.map((item) => item?.stageTitle).join(", ")}</small></> : <span className={styles.muted}>Нет сделок</span>}</td>
                        <td>{contact.lastContact}</td>
                        <td>{contact.nextTask ? <span className={styles.task}>○ {contact.nextTask}</span> : <span className={styles.muted}>Нет задачи</span>}</td>
                      </tr>
                    );
                  })}</tbody>
                </table>
              </div>
            </div>
          ) : hasFilters ? <StatusState symbol="⌕" title="Контакты не найдены" text="Измените запрос или сбросьте фильтры." action="Сбросить фильтры" onAction={resetFilters} /> : <StatusState symbol="＋" title="Контактов пока нет" text="Создайте первый контакт — он сохранится в базе этого пространства." action="Создать контакт" onAction={() => setIsCreating(true)} />}
        </section>
      </div>

      {selectedContact && <ContactDrawer key={selectedContact.id} contact={selectedContact} deals={selectedDeals} activities={selectedActivities} assignees={[{ id: user.id, name: user.name }]} onSave={saveContact} onAddNote={addContactNote} onClose={() => setSelectedId(null)} />}
      {isCreating && <NewContactModal onCreate={createContact} onClose={() => setIsCreating(false)} assignees={[{ id: user.id, name: user.name }]} />}
    </section>
  );
}

function Filter({ label, value, options, optionLabels = {}, onChange }: { label: string; value: string; options: string[]; optionLabels?: Record<string, string>; onChange: (value: string) => void }) {
  return <label className={styles.filter}><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}><option value="all">Все</option>{options.map((option) => <option value={option} key={option}>{optionLabels[option] || option}</option>)}</select></label>;
}

function StatusState({ symbol, title, text, action, onAction }: { symbol: string; title: string; text: string; action?: string; onAction?: () => void }) {
  return <div className={styles.empty}><span>{symbol}</span><h3>{title}</h3><p>{text}</p>{action && onAction && <button type="button" onClick={onAction}>{action}</button>}</div>;
}

function initials(name: string) { return name.split(" ").slice(0, 2).map((part) => part[0]).join(""); }
