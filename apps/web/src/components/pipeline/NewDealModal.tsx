import { useEffect, useState } from "react";
import type { Deal } from "@/types/crm";
import { isValidPhone, normalizePhone } from "@/lib/phone";
import styles from "./new-deal-modal.module.css";

export interface NewDealDraft {
  contactId?: string;
  contactName: string;
  phone: string;
  stageId: string;
  assigneeId?: string;
  title?: string;
  source: Deal["source"];
  operation?: Deal["operation"];
  propertyType?: string;
  budget?: string;
  district?: string;
  rooms?: string;
  request?: string;
}

interface NewDealModalProps {
  initialStageId: string;
  initialContactId?: string;
  stages: Array<{ id: string; title: string }>;
  contacts: Array<{ id: string; name: string; phone: string | null; source?: Deal["source"]; dealCount?: number }>;
  assignees: Array<{ id: string; name: string }>;
  onCreate: (draft: NewDealDraft) => Promise<void>;
  onClose: () => void;
}

function activeDealsLabel(count: number) {
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod100 >= 11 && mod100 <= 14) return "активных сделок";
  if (mod10 === 1) return "активная сделка";
  if (mod10 >= 2 && mod10 <= 4) return "активные сделки";
  return "активных сделок";
}

export function NewDealModal({ initialStageId, initialContactId, stages, contacts, assignees, onCreate, onClose }: NewDealModalProps) {
  const initialContact = contacts.find((contact) => contact.id === initialContactId);
  const [contactId, setContactId] = useState(initialContact?.id || "");
  const [contactName, setContactName] = useState(initialContact?.name || "");
  const [phone, setPhone] = useState(initialContact?.phone || "");
  const [stageId, setStageId] = useState(initialStageId);
  const [assigneeId, setAssigneeId] = useState("");
  const [title, setTitle] = useState("");
  const [source, setSource] = useState<Deal["source"]>(initialContact?.source || "Manual");
  const [operation, setOperation] = useState<Deal["operation"]>("Покупка");
  const [propertyType, setPropertyType] = useState("");
  const [budget, setBudget] = useState("");
  const [district, setDistrict] = useState("");
  const [rooms, setRooms] = useState("");
  const [request, setRequest] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const normalizedPhone = normalizePhone(phone);
  const matchingContact = !contactId && normalizedPhone
    ? contacts.find((contact) => normalizePhone(contact.phone || "") === normalizedPhone)
    : undefined;
  const selectedContact = contacts.find((contact) => contact.id === contactId);
  const existingDealCount = selectedContact?.dealCount || 0;

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!contactName.trim()) return;
    if (!contactId && !isValidPhone(phone)) {
      setError("Введите корректный номер телефона.");
      return;
    }
    if (matchingContact) {
      setError(`Контакт «${matchingContact.name}» с таким телефоном уже существует. Сначала выберите его из базы.`);
      return;
    }
    setError("");
    setIsSubmitting(true);
    try {
      await onCreate({
        contactId: contactId || undefined,
        contactName: contactName.trim(),
        phone: phone.trim(),
        stageId,
        assigneeId: assigneeId || undefined,
        title: title.trim() || undefined,
        source,
        operation,
        propertyType: propertyType.trim() || undefined,
        budget: budget.trim() || undefined,
        district: district.trim() || undefined,
        rooms: rooms.trim() || undefined,
        request: request.trim() || undefined,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось создать сделку.");
      setIsSubmitting(false);
    }
  }

  function selectContact(id: string) {
    setContactId(id);
    setError("");
    const contact = contacts.find((item) => item.id === id);
    setContactName(contact?.name || "");
    setPhone(contact?.phone || "");
    setSource(contact?.source || "Manual");
  }

  return (
    <div className={styles.layer}>
      <button className={styles.backdrop} type="button" onClick={onClose} aria-label="Закрыть создание сделки" />
      <form
        className={styles.modal}
        onSubmit={handleSubmit}
        onKeyDown={(event) => {
          const target = event.target as HTMLElement;
          if (event.key === "Enter" && target.tagName !== "TEXTAREA" && target.getAttribute("type") !== "submit") {
            event.preventDefault();
          }
        }}
      >
        <header>
          <div>
            <span>Новая сделка</span>
            <h2>Добавить клиента в воронку</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Закрыть">×</button>
        </header>

        <div className={styles.body}>
          <label>
            <span>Контакт из базы</span>
            <select value={contactId} onChange={(event) => selectContact(event.target.value)}>
              <option value="">Создать новый контакт</option>
              {contacts.map((contact) => <option value={contact.id} key={contact.id}>{contact.name}{contact.phone ? ` · ${contact.phone}` : ""}</option>)}
            </select>
          </label>
          <label className={styles.primaryField}>
            <span>Имя или название лида <b>обязательно</b></span>
            <input autoFocus value={contactName} readOnly={Boolean(contactId)} onChange={(event) => setContactName(event.target.value)} placeholder="Например, Мария Иванова" />
          </label>

          <label>
            <span>Телефон {!contactId && <b>обязательно</b>}</span>
            <input type="tel" value={phone} readOnly={Boolean(contactId)} onChange={(event) => { setPhone(event.target.value); setError(""); }} placeholder="+380 93 888 49 21" />
          </label>
          {matchingContact && <div className={styles.existingContact}><span>Найден существующий контакт: <strong>{matchingContact.name}</strong></span><button type="button" onClick={() => selectContact(matchingContact.id)}>Выбрать контакт</button></div>}
          {existingDealCount > 0 && <div className={styles.existingContact}><span>У контакта уже {existingDealCount} {activeDealsLabel(existingDealCount)}. Новая сделка будет отдельным обращением.</span></div>}

          <label>
            <span>Название сделки <small>необязательно</small></span>
            <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Например, Не берёт телефон — перезвонить вечером" />
          </label>

          <div className={styles.twoColumns}>
            <label>
              <span>Этап</span>
              <select value={stageId} onChange={(event) => setStageId(event.target.value)}>
                {stages.map((stage) => <option value={stage.id} key={stage.id}>{stage.title}</option>)}
              </select>
            </label>
            <label>
              <span>Ответственный</span>
              <select value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)}>
                <option value="">Не назначен</option>
                {assignees.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
              </select>
            </label>
          </div>

          <details className={styles.additional}>
            <summary>Дополнительные данные</summary>
            <div className={styles.additionalFields}>
              <div className={styles.twoColumns}>
                <label>
                  <span>Источник</span>
                  <select value={source} disabled={Boolean(contactId)} onChange={(event) => setSource(event.target.value as Deal["source"])}>
                    <option value="Manual">Не указан</option>
                    <option value="Meta">Meta</option>
                    <option value="Website">Сайт</option>
                  </select>
                </label>
                <label>
                  <span>Операция</span>
                  <select value={operation} onChange={(event) => setOperation(event.target.value as Deal["operation"])}>
                    <option>Покупка</option>
                    <option>Аренда</option>
                    <option>Продажа</option>
                  </select>
                </label>
              </div>
              <div className={styles.twoColumns}>
                <label>
                  <span>Тип объекта</span>
                  <select value={propertyType} onChange={(event) => setPropertyType(event.target.value)}>
                    <option value="">Не выбран</option>
                    <option>Квартира</option>
                    <option>Дом</option>
                    <option>Участок</option>
                    <option>Коммерческая недвижимость</option>
                  </select>
                </label>
                <label><span>Бюджет</span><input value={budget} onChange={(event) => setBudget(event.target.value)} placeholder="до $100 000" /></label>
              </div>
              <div className={styles.twoColumns}>
                <label>
                  <span>Район</span>
                  <select value={district} onChange={(event) => setDistrict(event.target.value)}>
                    <option value="">Не выбран</option>
                    <option>Приморский</option>
                    <option>Киевский</option>
                    <option>Пересыпский</option>
                    <option>Хаджибейский</option>
                  </select>
                </label>
                <label>
                  <span>Комнаты</span>
                  <select value={rooms} onChange={(event) => setRooms(event.target.value)}>
                    <option value="">Не выбрано</option>
                    <option>1</option>
                    <option>2</option>
                    <option>3</option>
                    <option>4+</option>
                  </select>
                </label>
              </div>
              <label><span>Запрос клиента</span><textarea value={request} onChange={(event) => setRequest(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} placeholder="Кратко опишите, что ищет клиент" /></label>
            </div>
          </details>
          {error && <p className={styles.error} role="alert">{error}</p>}
        </div>

        <footer>
          <span>Остальные данные можно заполнить позже</span>
          <div>
            <button type="button" onClick={onClose} disabled={isSubmitting}>Отмена</button>
            <button className={styles.createButton} type="submit" disabled={!contactName.trim() || isSubmitting}>{isSubmitting ? "Создаём…" : existingDealCount > 0 ? "Создать ещё одну сделку" : "Создать сделку"}</button>
          </div>
        </footer>
      </form>
    </div>
  );
}
