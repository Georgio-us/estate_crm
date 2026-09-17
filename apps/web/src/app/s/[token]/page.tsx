import type { Metadata } from "next";

import { getApiUrl } from "@/lib/api";
import { PublicShareTracker } from "./PublicShareTracker";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Подборка недвижимости" };

type PageProps = { params: Promise<{ token: string }> };
type PublicPropertySelectionShareRecord = {
  status: "AVAILABLE" | "OPENED" | "REVOKED" | "EXPIRED";
  organizationName: string;
  clientName: string | null;
  managerName: string | null;
  expiresAt: string;
  items: Array<{ id: string; title: string; subtitle: string | null; priceLabel: string | null; imageUrl: string | null }>;
};

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
        <div className={styles.meta}><span>{share.items.length} {share.items.length === 1 ? "объект" : share.items.length < 5 ? "объекта" : "объектов"}</span>{share.managerName && <span>Менеджер: {share.managerName}</span>}</div>
      </div>
    </section>
    <section className={styles.content}>
      <header className={styles.contentHeader}><h2>Ваша подборка</h2><span>Актуально на момент отправки</span></header>
      <div className={styles.grid}>{share.items.map((item) => <article className={styles.card} key={item.id}>
        <span className={styles.image} style={item.imageUrl ? { backgroundImage: `url(${JSON.stringify(item.imageUrl)})` } : undefined} />
        <div className={styles.body}><h3>{item.title}</h3><p>{item.subtitle || "Подробности уточнит ваш менеджер."}</p><strong>{item.priceLabel || "Цена по запросу"}</strong></div>
      </article>)}</div>
    </section>
    <footer className={styles.footer}>Подборка сформирована в Estate CRM</footer>
  </main>;
}
