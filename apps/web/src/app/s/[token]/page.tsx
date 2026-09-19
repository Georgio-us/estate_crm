import type { Metadata } from "next";

import { getApiUrl } from "@/lib/api";
import { PublicSelectionGallery } from "./PublicSelectionGallery";
import { PublicShareTracker } from "./PublicShareTracker";
import type { PublicPropertySelectionShareRecord } from "./types";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Подборка недвижимости" };

type PageProps = { params: Promise<{ token: string }> };

async function getShare(token: string): Promise<{ data: PublicPropertySelectionShareRecord | null; message: string }> {
  if (!/^[A-Za-z0-9_-]{40,64}$/.test(token)) return { data: null, message: "Ссылка выглядит некорректно." };
  try {
    const response = await fetch(new URL(`/public/property-shares/${token}`, getApiUrl()), { cache: "no-store" });
    const payload = await response.json() as PublicPropertySelectionShareRecord | { message?: string };
    if (!response.ok || !("items" in payload)) return { data: null, message: "message" in payload ? payload.message || "Подборка недоступна." : "Подборка недоступна." };
    return { data: payload, message: "" };
  } catch {
    return { data: null, message: "Не удалось загрузить подборку. Попробуйте открыть ссылку чуть позже." };
  }
}

export default async function PublicSelectionPage({ params }: PageProps) {
  const { token } = await params;
  const { data: share, message } = await getShare(token);
  if (!share) return <main className={styles.error}><div><span>Estate CRM</span><h1>Подборка недоступна</h1><p>{message}</p></div></main>;

  return <main className={styles.page}>
    <PublicShareTracker token={token} />
    <section className={styles.hero}>
      <div className={styles.heroInner}>
        <span className={styles.eyebrow}>{share.organizationName}</span>
        <h1>Объекты, подобранные для вас</h1>
        <p>{share.clientName ? `${share.clientName}, ` : ""}мы собрали варианты в одной удобной подборке. Откройте её с телефона или компьютера — ничего устанавливать не нужно.</p>
        <div className={styles.meta}><span>{share.items.length} {share.items.length === 1 ? "объект" : share.items.length < 5 ? "объекта" : "объектов"}</span>{share.manager && <span>Менеджер: {share.manager.name}</span>}</div>
      </div>
    </section>
    <section className={styles.content}>
      <header className={styles.contentHeader}><h2>Ваша подборка</h2><span>Актуально на момент отправки</span></header>
      <PublicSelectionGallery items={share.items} />
    </section>
    <footer className={styles.footer}>
      {share.manager ? <div className={styles.manager}>
        <span>По всем вопросам</span><h2>Ваш менеджер — {share.manager.name}</h2>
        <div>{share.manager.phone && <a href={`tel:${share.manager.phone.replace(/[^+\d]/g, "")}`}>{share.manager.phone}</a>}<a href={`mailto:${share.manager.email}`}>{share.manager.email}</a></div>
      </div> : <div className={styles.manager}><span>По всем вопросам</span><h2>Свяжитесь с вашим менеджером</h2></div>}
      <small>Подборка сформирована в Estate CRM</small>
    </footer>
  </main>;
}
