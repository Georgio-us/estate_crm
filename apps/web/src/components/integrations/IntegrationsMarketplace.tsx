"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./integrations.module.css";

type Category = "Все" | "Реклама" | "Мессенджеры" | "Телефония" | "Данные" | "AI";
type Availability = "Доступно" | "Pro" | "Платно" | "Через специалиста" | "Скоро";

type Integration = {
  id: string;
  name: string;
  category: Exclude<Category, "Все">;
  description: string;
  mark: string;
  brand: string;
  availability: Availability;
  connected?: boolean;
  featured?: boolean;
  activity?: string;
};

const categories: Category[] = ["Все", "Реклама", "Мессенджеры", "Телефония", "Данные", "AI"];

const initialIntegrations: Integration[] = [
  { id: "facebook", name: "Facebook Lead Ads", category: "Реклама", description: "Лид-формы автоматически создают контакты и сделки.", mark: "f", brand: "facebook", availability: "Доступно", connected: true, featured: true, activity: "12 лидов сегодня" },
  { id: "instagram", name: "Instagram", category: "Реклама", description: "Обращения из Direct и рекламных форм Meta.", mark: "◎", brand: "instagram", availability: "Доступно", connected: true, activity: "Синхронизация 4 мин назад" },
  { id: "google", name: "Google Ads", category: "Реклама", description: "Импорт лидов и передача статусов конверсий.", mark: "G", brand: "google", availability: "Pro", featured: true },
  { id: "tiktok", name: "TikTok Lead Generation", category: "Реклама", description: "Новые лиды из рекламных форм TikTok.", mark: "♪", brand: "tiktok", availability: "Pro" },
  { id: "telegram", name: "Telegram", category: "Мессенджеры", description: "Боты, входящие чаты и уведомления менеджерам.", mark: "➤", brand: "telegram", availability: "Доступно", connected: true, featured: true, activity: "3 диалога сегодня" },
  { id: "whatsapp", name: "WhatsApp Business", category: "Мессенджеры", description: "Диалоги с клиентами прямо из карточки сделки.", mark: "◔", brand: "whatsapp", availability: "Платно" },
  { id: "gmail", name: "Gmail", category: "Мессенджеры", description: "История переписки в контактах и сделках.", mark: "M", brand: "gmail", availability: "Скоро" },
  { id: "telephony", name: "Телефония", category: "Телефония", description: "Фиксация входящих, записи звонков и источники номеров.", mark: "☎", brand: "phone", availability: "Через специалиста", featured: true },
  { id: "binotel", name: "Binotel", category: "Телефония", description: "Звонки, пропущенные и запись разговоров.", mark: "B", brand: "binotel", availability: "Платно" },
  { id: "via", name: "Via AI", category: "AI", description: "Квалификация обращений и умное заполнение CRM.", mark: "V", brand: "via", availability: "Pro", featured: true },
  { id: "postgres", name: "PostgreSQL", category: "Данные", description: "Синхронизация с собственной клиентской базой.", mark: "P", brand: "postgres", availability: "Через специалиста" },
  { id: "webhook", name: "Webhooks", category: "Данные", description: "События CRM для ваших сервисов в реальном времени.", mark: "↗", brand: "webhook", availability: "Pro" },
  { id: "json", name: "JSON API", category: "Данные", description: "Собственные сценарии обмена через REST API.", mark: "{ }", brand: "json", availability: "Pro" },
  { id: "csv", name: "CSV / Excel", category: "Данные", description: "Импорт контактов, объектов и сделок из файла.", mark: "CSV", brand: "csv", availability: "Доступно" },
  { id: "notion", name: "Notion", category: "Данные", description: "Обмен объектами и внутренними базами команды.", mark: "N", brand: "notion", availability: "Скоро" },
];

export function IntegrationsMarketplace() {
  const [integrations, setIntegrations] = useState(initialIntegrations);
  const [category, setCategory] = useState<Category>("Все");
  const [query, setQuery] = useState("");
  const [installedOnly, setInstalledOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = integrations.find((item) => item.id === selectedId) || null;

  const visible = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("ru");
    return integrations.filter((item) => (category === "Все" || item.category === category) && (!installedOnly || item.connected) && (!normalized || `${item.name} ${item.description} ${item.category}`.toLocaleLowerCase("ru").includes(normalized)));
  }, [category, installedOnly, integrations, query]);

  const connected = integrations.filter((item) => item.connected);

  function toggleConnection(id: string) {
    setIntegrations((current) => current.map((item) => item.id === id ? { ...item, connected: !item.connected, activity: item.connected ? undefined : "Подключено только что" } : item));
  }

  return (
    <section className={styles.page}>
      <header className={styles.topbar}>
        <h1>Интеграции</h1>
        <label className={styles.topSearch}><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Найти интеграцию" /></label>
        <button className={styles.webhookButton} type="button" onClick={() => setSelectedId("webhook")}>Webhooks</button>
        <button className={styles.primaryButton} type="button" onClick={() => setSelectedId("json")}>＋ Своя интеграция</button>
      </header>

      <main className={styles.content}>
        <section className={styles.hero}>
          <div className={styles.heroCopy}><span className={styles.eyebrow}>Центр подключений</span><h2>Все каналы — в одной CRM</h2><p>Получайте лиды, отвечайте клиентам и синхронизируйте данные без ручного переноса.</p><button type="button" onClick={() => { setCategory("Все"); setInstalledOnly(false); document.getElementById("catalog")?.scrollIntoView({ behavior: "smooth" }); }}>Смотреть каталог <span>→</span></button></div>
          <div className={styles.heroVisual} aria-hidden="true"><span className={`${styles.heroTile} ${styles.facebook}`}>f<small>Lead Ads</small></span><span className={`${styles.heroTile} ${styles.telegram}`}>➤<small>Telegram</small></span><span className={`${styles.heroTile} ${styles.via}`}>V<small>Via AI</small></span><i className={styles.connectorOne} /><i className={styles.connectorTwo} /><span className={styles.crmNode}>E<small>Estate CRM</small></span></div>
        </section>

        <section className={styles.statusStrip}>
          <div><strong>{connected.length}</strong><span>подключено</span></div><div><strong>15</strong><span>обращений сегодня</span></div><div><strong>4 мин</strong><span>назад синхронизация</span></div><div className={styles.healthy}><strong>●</strong><span>Все системы работают</span></div>
        </section>

        <section className={styles.connectedSection}>
          <header><div><span className={styles.eyebrow}>Работают сейчас</span><h3>Подключённые интеграции</h3></div><button type="button" onClick={() => setInstalledOnly(true)}>Управлять всеми →</button></header>
          <div className={styles.connectedList}>{connected.map((item) => <button type="button" onClick={() => setSelectedId(item.id)} key={item.id}><BrandMark item={item} /><span><strong>{item.name}</strong><small>{item.activity}</small></span><i>Подключено</i><b>›</b></button>)}</div>
        </section>

        <section className={styles.catalog} id="catalog">
          <header><div><span className={styles.eyebrow}>Marketplace</span><h3>Доступные интеграции</h3><p>Расширяйте CRM по мере роста команды.</p></div><span>{visible.length} решений</span></header>
          <div className={styles.controls}>
            <label className={styles.catalogSearch}><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск по каталогу" /></label>
            <nav>{categories.map((item) => <button className={category === item ? styles.activeCategory : ""} type="button" onClick={() => { setCategory(item); setInstalledOnly(false); }} key={item}>{item}</button>)}</nav>
            <button className={installedOnly ? styles.installedActive : ""} type="button" onClick={() => setInstalledOnly((value) => !value)}>✓ Подключённые</button>
          </div>
          {visible.length ? <div className={styles.marketGrid}>{visible.map((item) => <button className={styles.marketCard} type="button" onClick={() => setSelectedId(item.id)} key={item.id}><div className={`${styles.cardArt} ${styles[item.brand]}`}><BrandMark item={item} /><span>{item.category}</span></div><div className={styles.cardBody}><span><strong>{item.name}</strong>{item.connected && <i>✓</i>}</span><p>{item.description}</p><footer><AvailabilityBadge value={item.connected ? "Доступно" : item.availability} connected={item.connected} /><b>{item.connected ? "Настроить" : item.availability === "Скоро" ? "Подробнее" : "Подключить"} →</b></footer></div></button>)}</div> : <div className={styles.empty}><strong>Ничего не найдено</strong><span>Попробуйте изменить категорию или запрос.</span><button type="button" onClick={() => { setQuery(""); setCategory("Все"); setInstalledOnly(false); }}>Сбросить фильтры</button></div>}
        </section>
      </main>

      {selected && <IntegrationPanel item={selected} onToggle={() => toggleConnection(selected.id)} onClose={() => setSelectedId(null)} />}
    </section>
  );
}

function BrandMark({ item }: { item: Integration }) {
  return <span className={`${styles.brandMark} ${styles[item.brand]}`}>{item.mark}</span>;
}

function AvailabilityBadge({ value, connected = false }: { value: Availability; connected?: boolean }) {
  return <span className={`${styles.availability} ${connected ? styles.connectedBadge : value === "Pro" ? styles.proBadge : value === "Платно" ? styles.paidBadge : value === "Через специалиста" ? styles.expertBadge : value === "Скоро" ? styles.soonBadge : ""}`}>{connected ? "● Подключено" : value}</span>;
}

function IntegrationPanel({ item, onToggle, onClose }: { item: Integration; onToggle: () => void; onClose: () => void }) {
  const canConnect = item.availability !== "Скоро";
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => { bodyRef.current?.scrollTo({ top: 0 }); }, [item.id]);
  return <div className={styles.panelLayer}><button className={styles.backdrop} type="button" aria-label="Закрыть" onClick={onClose} /><aside className={styles.panel}><header><BrandMark item={item} /><span><small>{item.category}</small><h2>{item.name}</h2></span><button type="button" aria-label="Закрыть" onClick={onClose}>×</button></header><div className={styles.panelBody} ref={bodyRef}><AvailabilityBadge value={item.availability} connected={item.connected} /><p>{item.description}</p>{item.connected ? <><section className={styles.connectionState}><span><i>✓</i><strong>Интеграция работает</strong></span><small>{item.activity || "Синхронизация активна"}</small></section><section className={styles.settings}><h3>Настройки потока</h3><label><span><strong>Создавать новую сделку</strong><small>Для каждого нового обращения</small></span><input type="checkbox" defaultChecked /></label><label><span><strong>Ответственный</strong><small>Кому назначать новые обращения</small></span><select defaultValue="auto"><option value="auto">По очереди</option><option>Георгий</option><option>Елена</option><option>Андрей</option></select></label><label><span><strong>Воронка</strong><small>Первый этап для новых сделок</small></span><select><option>Продажа недвижимости</option></select></label></section><section className={styles.syncLog}><h3>Последние события</h3><div><span>Синхронизация выполнена</span><time>4 минуты назад</time></div><div><span>Получено новое обращение</span><time>Сегодня, 12:46</time></div></section></> : <section className={styles.installInfo}><h3>{item.availability === "Скоро" ? "Готовим интеграцию" : item.availability === "Через специалиста" ? "Подключение со специалистом" : "Готово к подключению"}</h3><p>{item.availability === "Через специалиста" ? "Специалист уточнит схему данных, номера или доступы и настроит безопасный обмен." : item.availability === "Скоро" ? "Оставьте интерес — сообщим, когда подключение станет доступно." : "Авторизуйтесь в сервисе и выберите правила создания новых обращений."}</p><div><span>○ Авторизация</span><span>○ Настройка потока</span><span>○ Тестовое обращение</span></div></section>}</div><footer>{item.connected && <button className={styles.disconnect} type="button" onClick={onToggle}>Отключить</button>}<button className={styles.panelPrimary} type="button" disabled={!canConnect} onClick={item.connected ? onClose : canConnect ? onToggle : undefined}>{item.connected ? "Сохранить настройки" : item.availability === "Через специалиста" ? "Запросить подключение" : item.availability === "Скоро" ? "Скоро" : "Подключить"}</button></footer></aside></div>;
}
