"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import Link from "next/link";

import styles from "@/components/auth/auth.module.css";
import { LogoMark } from "@/components/brand/LogoMark";
import { PasswordInput } from "@/components/auth/PasswordInput";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError("");
    setSubmitting(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: form.get("email"), password: form.get("password") }),
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
          <LogoMark className={styles.logo} title="Estate CRM" />
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
              name="email"
              autoComplete="username"
              inputMode="email"
              required
              type="email"
              maxLength={320}
            />
          </label>
          <label htmlFor="login-password">
            <span>Пароль</span>
            <PasswordInput
              aria-label="Пароль"
              id="login-password"
              name="password"
              autoComplete="current-password"
              minLength={8}
              required
              maxLength={256}
            />
          </label>
          {error && <p className={styles.formError} role="alert">{error}</p>}
          <button disabled={submitting} type="submit">
            {submitting ? "Входим…" : "Войти"}
          </button>
        </form>
        <Link className={styles.authLink} href="/forgot-password">Забыли пароль?</Link>
      </section>
      <aside className={styles.loginAside}>
        <div><span>Агентство недвижимости Delmar</span><h2>Все обращения, сделки и задачи — в одном рабочем пространстве.</h2></div>
        <small>Безопасный доступ для сотрудников агентства.</small>
      </aside>
    </main>
  );
}
