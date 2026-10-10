"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { LogoMark } from "@/components/brand/LogoMark";
import { PasswordInput } from "./PasswordInput";
import styles from "./auth.module.css";

export function ResetPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (password !== confirmation) return setError("Пароли не совпадают.");
    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/reset-password", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, password }) });
      const payload = await response.json() as { message?: string };
      if (!response.ok) throw new Error(payload.message || "Не удалось изменить пароль.");
      setComplete(true);
      setPassword("");
      setConfirmation("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось изменить пароль.");
    } finally { setSubmitting(false); }
  }

  return <main className={styles.loginPage}><section className={styles.loginPanel}>
    <header><LogoMark className={styles.logo} title="Estate CRM" /><div><strong>Estate CRM</strong><small>Рабочее пространство</small></div></header>
    <div className={styles.loginIntro}><span>Доступ к CRM</span><h1>Новый пароль</h1><p>После смены пароля все прежние сеансы завершатся. Войдите заново на своих устройствах.</p></div>
    {complete ? <p className={styles.formSuccess} role="status">Пароль изменён. Теперь войдите в CRM с новым паролем.</p> : <form onSubmit={submit}>
      <label htmlFor="new-password"><span>Новый пароль</span><PasswordInput id="new-password" aria-label="Новый пароль" autoComplete="new-password" minLength={8} required maxLength={256} value={password} onChange={(event) => setPassword(event.target.value)} /></label>
      <label htmlFor="confirm-password"><span>Повторите пароль</span><PasswordInput id="confirm-password" aria-label="Повторите пароль" autoComplete="new-password" minLength={8} required maxLength={256} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label>
      {error && <p className={styles.formError} role="alert">{error}</p>}
      <button disabled={submitting} type="submit">{submitting ? "Сохраняем…" : "Изменить пароль"}</button>
    </form>}
    <Link className={styles.authLink} href={complete ? "/login" : "/forgot-password"}>{complete ? "Перейти ко входу" : "Запросить новую ссылку"}</Link>
  </section><aside className={styles.loginAside}><div><span>Estate CRM</span><h2>Работа команды в одном защищённом пространстве.</h2></div></aside></main>;
}
