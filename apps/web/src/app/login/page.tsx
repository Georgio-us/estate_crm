"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { getApiUrl } from "@/lib/api";

import styles from "@/components/auth/auth.module.css";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const response = await fetch(`${getApiUrl()}/auth/login`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        setError(response.status === 401
          ? "Неверный email или пароль."
          : "Не удалось выполнить вход. Попробуйте ещё раз.");
        return;
      }

      const next = new URLSearchParams(window.location.search).get("next");
      router.replace(next?.startsWith("/") && !next.startsWith("//") ? next : "/");
      router.refresh();
    } catch {
      setError("Сервер CRM недоступен. Попробуйте ещё раз.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className={styles.loginPage}>
      <section className={styles.loginPanel}>
        <header>
          <span className={styles.logo}>E</span>
          <div><strong>Estate CRM</strong><small>Рабочее пространство</small></div>
        </header>
        <div className={styles.loginIntro}>
          <span>Вход в систему</span>
          <h1>Продолжить работу</h1>
          <p>Введите данные вашей учётной записи CRM.</p>
        </div>
        <form onSubmit={onSubmit}>
          <label>
            <span>Email</span>
            <input
              autoComplete="email"
              inputMode="email"
              required
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label>
            <span>Пароль</span>
            <input
              autoComplete="current-password"
              minLength={8}
              required
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {error && <p className={styles.formError} role="alert">{error}</p>}
          <button disabled={submitting} type="submit">
            {submitting ? "Входим…" : "Войти"}
          </button>
        </form>
      </section>
      <aside className={styles.loginAside}>
        <div><span>CRM Del Mar</span><h2>Все обращения, сделки и задачи команды — в одном рабочем пространстве.</h2></div>
        <small>Безопасный доступ для сотрудников агентства</small>
      </aside>
    </main>
  );
}
