"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { LogoMark } from "@/components/brand/LogoMark";
import styles from "./auth.module.css";

type Invitation = { name: string; email: string; role: "LEAD" | "MANAGER"; organizationName: string; expiresAt: string; existingAccount: boolean };

export function InvitationRegistration({ token }: { token: string }) {
  const router = useRouter();
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "invalid">("loading");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    void fetch(`/api/auth/invitations/${encodeURIComponent(token)}`, { cache: "no-store" }).then(async (response) => {
      const payload = await response.json() as Invitation & { message?: string };
      if (!response.ok) throw new Error(payload.message);
      if (active) { setInvitation(payload); setState("ready"); }
    }).catch(() => { if (active) setState("invalid"); });
    return () => { active = false; };
  }, [token]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!invitation?.existingAccount && password !== confirmation) {
      setError("Пароли не совпадают.");
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch(`/api/auth/invitations/${encodeURIComponent(token)}/accept`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const payload = await response.json() as { message?: string };
      if (!response.ok) throw new Error(payload.message || "Не удалось принять приглашение.");
      router.replace("/");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось принять приглашение.");
    } finally {
      setSubmitting(false);
    }
  }

  if (state !== "ready" || !invitation) {
    return <main className={styles.statusPage}><section className={styles.statusPanel}><LogoMark className={styles.logo} title="Estate CRM" />{state === "loading" ? <><h1>Проверяем приглашение</h1><p>Это займёт несколько секунд.</p><span className={styles.loader} /></> : <><h1>Ссылка недействительна</h1><p>Приглашение уже использовано, отменено или срок его действия истёк.</p><button type="button" onClick={() => router.replace("/login")}>Перейти ко входу</button></>}</section></main>;
  }

  const role = invitation.role === "LEAD" ? "Руководитель" : "Менеджер";
  return <main className={styles.loginPage}><section className={styles.loginPanel}><header><LogoMark className={styles.logo} title="Estate CRM" /><div><strong>Estate CRM</strong><small>{invitation.organizationName}</small></div></header><div className={styles.loginIntro}><span>Приглашение в команду</span><h1>Добро пожаловать, {invitation.name}</h1><p>{invitation.email} · {role}</p></div><form onSubmit={submit}><label><span>{invitation.existingAccount ? "Пароль вашей учётной записи" : "Придумайте пароль"}</span><input autoComplete={invitation.existingAccount ? "current-password" : "new-password"} minLength={8} required type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>{!invitation.existingAccount && <label><span>Повторите пароль</span><input autoComplete="new-password" minLength={8} required type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label>}{error && <p className={styles.formError} role="alert">{error}</p>}<button disabled={submitting} type="submit">{submitting ? "Подключаем…" : "Присоединиться к команде"}</button></form></section><aside className={styles.loginAside}><div><span>{invitation.organizationName}</span><h2>Сделки, контакты и задачи вашей команды — в одном рабочем пространстве.</h2></div><small>Одноразовое защищённое приглашение</small></aside></main>;
}
