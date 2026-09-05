import { useEffect, useState } from "react";
import type { Deal } from "@/types/crm";
import styles from "./new-deal-modal.module.css";

export interface NewDealDraft {
  contactName: string;
  phone: string;
  stageId: string;
  assignee: string;
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
  stages: Array<{ id: string; title: string }>;
  onCreate: (draft: NewDealDraft) => void;
  onClose: () => void;
}

const assignees = ["Не назначен", "Георгий", "Елена", "Андрей"];

export function NewDealModal({ initialStageId, stages, onCreate, onClose }: NewDealModalProps) {
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [stageId, setStageId] = useState(initialStageId);
  const [assignee, setAssignee] = useState("Не назначен");
  const [operation, setOperation] = useState<Deal["operation"]>("Покупка");
  const [propertyType, setPropertyType] = useState("");
  const [budget, setBudget] = useState("");
  const [district, setDistrict] = useState("");
  const [rooms, setRooms] = useState("");
  const [request, setRequest] = useState("");

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!contactName.trim()) return;

    onCreate({
      contactName: contactName.trim(),
      phone: phone.trim(),
      stageId,
      assignee,
      source: "Manual",
      operation,
      propertyType: propertyType.trim() || undefined,
      budget: budget.trim() || undefined,
      district: district.trim() || undefined,
      rooms: rooms.trim() || undefined,
      request: request.trim() || undefined,
    });
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
          <label className={styles.primaryField}>
            <span>Имя или название лида <b>обязательно</b></span>
            <input autoFocus value={contactName} onChange={(event) => setContactName(event.target.value)} placeholder="Например, Мария Иванова" />
          </label>

          <label>
            <span>Телефон <small>необязательно</small></span>
            <input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+38 000 000 00 00" />
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
              <select value={assignee} onChange={(event) => setAssignee(event.target.value)}>
                {assignees.map((item) => <option value={item} key={item}>{item}</option>)}
              </select>
            </label>
          </div>

          <details className={styles.additional}>
            <summary>Дополнительные данные</summary>
            <div className={styles.additionalFields}>
              <div className={styles.twoColumns}>
                <label>
                  <span>Источник</span>
                  <input value="Вручную" readOnly aria-label="Источник: вручную" />
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
              <label><span>Запрос клиента</span><textarea value={request} onChange={(event) => setRequest(event.target.value)} placeholder="Кратко опишите, что ищет клиент" /></label>
            </div>
          </details>
        </div>

        <footer>
          <span>Остальные данные можно заполнить позже</span>
          <div>
            <button type="button" onClick={onClose}>Отмена</button>
            <button className={styles.createButton} type="submit" disabled={!contactName.trim()}>Создать сделку</button>
          </div>
        </footer>
      </form>
    </div>
  );
}
