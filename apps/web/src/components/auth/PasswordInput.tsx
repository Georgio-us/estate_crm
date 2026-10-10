"use client";

import { useId, useState, type ComponentProps } from "react";
import styles from "./password-input.module.css";

export function PasswordInput({ id, ...props }: Omit<ComponentProps<"input">, "type">) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [visible, setVisible] = useState(false);

  return (
    <div className={styles.field}>
      <input {...props} id={inputId} type={visible ? "text" : "password"} />
      <button
        className={styles.toggle}
        type="button"
        aria-label={visible ? "Скрыть пароль" : "Показать пароль"}
        aria-controls={inputId}
        aria-pressed={visible}
        disabled={props.disabled}
        onClick={() => setVisible((current) => !current)}
      >
        <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
          <circle cx="12" cy="12" r="3" />
          {visible && <path d="m3 3 18 18" />}
        </svg>
      </button>
    </div>
  );
}
