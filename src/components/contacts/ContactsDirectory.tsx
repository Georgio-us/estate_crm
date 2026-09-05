"use client";

import { useMemo, useState } from "react";
import { mockActivities } from "@/data/mock-activities";
import { mockContacts } from "@/data/mock-contacts";
import { pipelineStages } from "@/data/mock-pipeline";
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

export function ContactsDirectory() {
  const [contacts, setContacts] = useState(mockContacts);
  const [contactNotes, setContactNotes] = useState<Record<string, ActivityEvent[]>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [search, setSearch] = useState("");
  const [assignee, setAssignee] = useState("all");
  const [source, setSource] = useState("all");
  const [dealFilter, setDealFilter] = useState("all");

  const dealsById = useMemo(() => new Map(pipelineStages.flatMap((stage) => stage.deals.map((deal) => [deal.id, { deal, stageTitle: stage.title, stageColor: stage.color }] as const))), []);
  const selectedContact = contacts.find((contact) => contact.id === selectedId);
  const selectedDeals = selectedContact?.dealIds.map((id) => dealsById.get(id)).filter((item): item is RelatedDeal => Boolean(item)) || [];
  const selectedActivities = selectedContact
    ? [...(contactNotes[selectedContact.id] || []), ...selectedContact.dealIds.flatMap((id) => mockActivities[id] || [])]
    : [];

  const visibleContacts = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("ru");
    return contacts.filter((contact) => {
      const matchesSearch = !query || [contact.name, contact.phone, contact.email, contact.telegram].some((value) => value?.toLocaleLowerCase("ru").includes(query));
      const matchesDeals = dealFilter === "all" || (dealFilter === "with" ? contact.dealIds.length > 0 : contact.dealIds.length === 0);
      return matchesSearch && (assignee === "all" || contact.assignee === assignee) && (source === "all" || contact.source === source) && matchesDeals;
    });
  }, [assignee, contacts, dealFilter, search, source]);

  const hasFilters = Boolean(search || assignee !== "all" || source !== "all" || dealFilter !== "all");

  function resetFilters() { setSearch(""); setAssignee("all"); setSource("all"); setDealFilter("all"); }

  function createContact(draft: NewContactDraft) {
    const contact: Contact = {
      id: `contact-${Date.now()}`,
      name: draft.name.trim(),
      phone: draft.phone.trim(),
      email: draft.email.trim() || undefined,
      telegram: draft.telegram.trim() || undefined,
      source: draft.source,
      assignee: draft.assignee,
      dealIds: [],
      lastContact: "Только что",
      comment: draft.comment.trim() || undefined,
      createdAt: "Только что",
    };
    setContacts((current) => [contact, ...current]);
    setIsCreating(false);
    setSelectedId(contact.id);
  }

  function addContactNote(text: string) {
    if (!selectedContact) return;
    const event: ActivityEvent = { id: `contact-note-${Date.now()}`, dealId: "", category: "note", title: "Добавлено примечание", description: text, author: "Георгий", occurredAt: new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(new Date()) };
    setContactNotes((current) => ({ ...current, [selectedContact.id]: [event, ...(current[selectedContact.id] || [])] }));
    setContacts((current) => current.map((contact) => contact.id === selectedContact.id ? { ...contact, lastContact: "Только что" } : contact));
  }

  return (
    <section className={styles.page}>
      <header className={styles.topbar}>
        <h1>Контакты</h1>
        <label className={styles.search}><span>⌕</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Имя, телефон, email или Telegram" /></label>
        <button className={styles.primaryButton} type="button" onClick={() => setIsCreating(true)}>＋ Новый контакт</button>
      </header>

      <div className={styles.content}>
        <div className={styles.heading}>
          <div><span className={styles.eyebrow}>Клиентская база</span><h2>Все контакты</h2><p>Люди и компании независимо от количества обращений</p></div>
          <span>{contacts.length} контактов</span>
        </div>

        <div className={styles.filters}>
          <Filter label="Ответственный" value={assignee} onChange={setAssignee} options={["Не назначен", "Георгий", "Елена", "Андрей"]} />
          <Filter label="Источник" value={source} onChange={setSource} options={["Meta", "Website", "Manual"]} optionLabels={{ Website: "Сайт", Manual: "Вручную" }} />
          <Filter label="Сделки" value={dealFilter} onChange={setDealFilter} options={["with", "without"]} optionLabels={{ with: "Есть активные", without: "Без сделок" }} />
          <span className={styles.resultCount}>{visibleContacts.length} из {contacts.length}</span>
          {hasFilters && <button className={styles.resetButton} type="button" onClick={resetFilters}>Сбросить</button>}
        </div>

        {visibleContacts.length ? (
          <div className={styles.tableWrap}>
            <table>
              <thead><tr><th>Контакт</th><th>Телефон и каналы</th><th>Ответственный</th><th>Источник</th><th>Активные сделки</th><th>Последний контакт</th><th>Ближайшая задача</th></tr></thead>
              <tbody>{visibleContacts.map((contact) => {
                const relatedDeals = contact.dealIds.map((id) => dealsById.get(id)).filter(Boolean);
                return (
                  <tr key={contact.id} onClick={() => setSelectedId(contact.id)}>
                    <td><span className={styles.avatar}>{initials(contact.name)}</span><span><strong>{contact.name}</strong><small>Добавлен {contact.createdAt}</small></span></td>
                    <td><a href={`tel:${contact.phone.replaceAll(" ", "")}`} onClick={(event) => event.stopPropagation()}>{contact.phone}</a><small>{contact.telegram || contact.email || "Дополнительных каналов нет"}</small></td>
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
        ) : <div className={styles.empty}><span>⌕</span><h3>Контакты не найдены</h3><p>Измените запрос или сбросьте фильтры.</p><button type="button" onClick={resetFilters}>Сбросить фильтры</button></div>}
      </div>

      {selectedContact && <ContactDrawer contact={selectedContact} deals={selectedDeals} activities={selectedActivities} onAddNote={addContactNote} onClose={() => setSelectedId(null)} />}
      {isCreating && <NewContactModal onCreate={createContact} onClose={() => setIsCreating(false)} />}
    </section>
  );
}

function Filter({ label, value, options, optionLabels = {}, onChange }: { label: string; value: string; options: string[]; optionLabels?: Record<string, string>; onChange: (value: string) => void }) {
  return <label className={styles.filter}><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}><option value="all">Все</option>{options.map((option) => <option value={option} key={option}>{optionLabels[option] || option}</option>)}</select></label>;
}

function initials(name: string) { return name.split(" ").slice(0, 2).map((part) => part[0]).join(""); }
