"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { LogoMark } from "@/components/brand/LogoMark";
import styles from "@/components/auth/auth.module.css";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/auth/request-reset", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) });
      const payload = await response.json() as { message?: string };
      if (!response.ok) throw new Error(payload.message || "Не удалось отправить запрос. Попробуйте позже.");
      setSent(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось отправить запрос. Попробуйте позже.");
    } finally { setSubmitting(false); }
  }

  return <main className={styles.loginPage}><section className={styles.loginPanel}>
    <header><LogoMark className={styles.logo} title="Estate CRM" /><div><strong>Estate CRM</strong><small>Рабочее пространство</small></div></header>
    <div className={styles.loginIntro}><span>Доступ к CRM</span><h1>Восстановить пароль</h1><p>Укажите рабочий email. Если он зарегистрирован, мы отправим ссылку для установки нового пароля.</p></div>
    {sent ? <p className={styles.formSuccess} role="status">Если этот адрес есть в CRM, письмо отправлено. Проверьте почту и папку «Спам». Ссылка действует 30 минут.</p> : <form onSubmit={submit}><label><span>Email</span><input autoComplete="email" inputMode="email" required type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>{error && <p className={styles.formError} role="alert">{error}</p>}<button disabled={submitting} type="submit">{submitting ? "Отправляем…" : "Получить ссылку"}</button></form>}
    <Link className={styles.authLink} href="/login">Вернуться ко входу</Link>
  </section><aside className={styles.loginAside}><div><span>Estate CRM</span><h2>Работа команды в одном защищённом пространстве.</h2></div></aside></main>;
}
