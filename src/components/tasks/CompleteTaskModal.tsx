import { useState } from "react";
import type { CrmTask } from "@/types/crm";
import styles from "./tasks.module.css";

export function CompleteTaskModal({ task, onComplete, onClose }: { task: CrmTask; onComplete: (result: string) => void; onClose: () => void }) {
  const [result, setResult] = useState("");
  return <div className={styles.modalLayer}><button className={styles.backdrop} type="button" onClick={onClose} aria-label="Закрыть выполнение задачи" /><div className={styles.completeModal} role="dialog" aria-modal="true" aria-label="Выполнение задачи"><header><span>Выполнение задачи</span><button type="button" onClick={onClose} aria-label="Закрыть">×</button></header><div className={styles.completeBody}><span className={styles.completeIcon}>✓</span><div><h2>{task.title}</h2><p>{task.contactName || "Без контакта"}{task.dealNumber && ` · Сделка #${task.dealNumber}`}</p></div></div><label className={styles.resultField}><span>Результат</span><textarea autoFocus value={result} onChange={(event) => setResult(event.target.value)} placeholder="Например, договорились о просмотре" /></label><footer><button type="button" onClick={onClose}>Отмена</button><button type="button" onClick={() => onComplete(result.trim())}>Отметить выполненной</button></footer></div></div>;
}
