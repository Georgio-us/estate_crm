"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./integrations.module.css";

type IntegrationProvider = "TEST" | "META_LEAD_ADS" | "INSTAGRAM_DIRECT" | "TELEPHONY" | "TELEGRAM";
type IntegrationConnectionRecord = { provider: IntegrationProvider; status: "READY" | "CREDENTIALS_REQUIRED" | "CONNECTED" | "ERROR"; enabled: boolean; pipelineId: string | null; stageId: string | null; lastEventAt: string | null; lastError: string | null; processedCount: number };
type IntegrationEventRecord = { id: string; provider: IntegrationProvider; contactName: string | null; dealNumber: number | null; receivedAt: string };
type IntegrationsResponse = { connections: IntegrationConnectionRecord[]; events: IntegrationEventRecord[]; pendingNotifications: number };
type InboundLeadResult = { dealNumber: number; duplicate: boolean; reusedDeal: boolean };

type Category = "Все" | "Реклама" | "Мессенджеры" | "Телефония" | "Данные";
type Integration = { id: string; provider?: IntegrationProvider; name: string; category: Exclude<Category, "Все">; description: string; mark: string; brand: string; available: boolean };
const categories: Category[] = ["Все", "Реклама", "Мессенджеры", "Телефония", "Данные"];
const integrations: Integration[] = [
  { id: "facebook", provider: "META_LEAD_ADS", name: "Facebook Lead Ads", category: "Реклама", description: "Лиды из форм Meta поступают в единый входящий шлюз.", mark: "f", brand: "facebook", available: false },
  { id: "instagram", provider: "INSTAGRAM_DIRECT", name: "Instagram Direct", category: "Мессенджеры", description: "Будущий адаптер обращений из Direct без привязки ядра CRM к Meta.", mark: "◎", brand: "instagram", available: false },
  { id: "telephony", provider: "TELEPHONY", name: "Телефония", category: "Телефония", description: "Единый адаптер для входящих и пропущенных звонков.", mark: "☎", brand: "phone", available: false },
  { id: "telegram", provider: "TELEGRAM", name: "Telegram", category: "Мессенджеры", description: "Транспорт уведомлений менеджерам из очереди CRM.", mark: "➤", brand: "telegram", available: false },
  { id: "test", provider: "TEST", name: "Тестовый шлюз", category: "Данные", description: "Проверка полного маршрута лида без внешних аккаунтов и ключей.", mark: "↗", brand: "webhook", available: true },
  { id: "csv", name: "CSV / Excel", category: "Данные", description: "Импорт и экспорт сделок из файлов.", mark: "CSV", brand: "csv", available: true },
];
const providerNames: Record<IntegrationProvider, string> = { TEST: "Тестовый шлюз", META_LEAD_ADS: "Facebook Lead Ads", INSTAGRAM_DIRECT: "Instagram Direct", TELEPHONY: "Телефония", TELEGRAM: "Telegram" };

export function IntegrationsMarketplace() {
  const [data, setData] = useState<IntegrationsResponse | null>(null);
  const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  const [category, setCategory] = useState<Category>("Все"); const [query, setQuery] = useState(""); const [selectedId, setSelectedId] = useState<string | null>(null);
  const load = useCallback(async () => { try { const response = await fetch("/api/crm/integrations", { cache: "no-store" }); if (!response.ok) throw new Error("Не удалось загрузить состояние интеграций."); setData(await response.json() as IntegrationsResponse); setError(""); } catch (caught) { setError(caught instanceof Error ? caught.message : "Не удалось загрузить интеграции."); } finally { setLoading(false); } }, []);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/crm/integrations", { cache: "no-store", signal: controller.signal })
      .then(async (response) => { if (!response.ok) throw new Error("Не удалось загрузить состояние интеграций."); setData(await response.json() as IntegrationsResponse); setError(""); })
      .catch((caught: unknown) => { if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "Не удалось загрузить интеграции."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);
  const states = useMemo(() => new Map(data?.connections.map((item) => [item.provider, item]) ?? []), [data]);
  const visible = useMemo(() => { const normalized = query.trim().toLocaleLowerCase("ru"); return integrations.filter((item) => (category === "Все" || item.category === category) && (!normalized || `${item.name} ${item.description}`.toLocaleLowerCase("ru").includes(normalized))); }, [category, query]);
  const selected = integrations.find((item) => item.id === selectedId) ?? null;
  const connected = data?.connections.filter((item) => item.status === "CONNECTED").length ?? 0;
  const processed = data?.connections.reduce((sum, item) => sum + item.processedCount, 0) ?? 0;

  return <section className={styles.page}>
    <header className={styles.topbar}><h1>Интеграции</h1><label className={styles.topSearch}><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Найти интеграцию" /></label><button className={styles.primaryButton} type="button" onClick={() => setSelectedId("test")}>＋ Тестовый лид</button></header>
    <main className={styles.content}>
      <section className={styles.hero}><div className={styles.heroCopy}><span className={styles.eyebrow}>Интеграционный шлюз</span><h2>Каналы подключаются как модули</h2><p>CRM отделяет приём обращения, обработку лида и доставку уведомлений. Внешние доступы подключаются следующим слоем.</p><button type="button" onClick={() => setSelectedId("test")}>Проверить маршрут <span>→</span></button></div><div className={styles.heroVisual} aria-hidden="true"><span className={`${styles.heroTile} ${styles.facebook}`}>f<small>Lead Ads</small></span><span className={`${styles.heroTile} ${styles.telegram}`}>➤<small>Telegram</small></span><i className={styles.connectorOne} /><i className={styles.connectorTwo} /><span className={styles.crmNode}>E<small>Estate CRM</small></span></div></section>
      <section className={styles.statusStrip}><div><strong>{connected}</strong><span>реально подключено</span></div><div><strong>{processed}</strong><span>обращений обработано</span></div><div><strong>{data?.pendingNotifications ?? 0}</strong><span>уведомлений в очереди</span></div><div className={error ? "" : styles.healthy}><strong>{loading ? "…" : error ? "!" : "●"}</strong><span>{loading ? "Проверяем состояние" : error || "Ядро работает"}</span></div></section>
      <section className={styles.catalog}><header><div><span className={styles.eyebrow}>Модули</span><h3>Интеграции CRM</h3><p>Статусы ниже приходят из базы, а не из макета.</p></div><span>{visible.length} решений</span></header><div className={styles.controls}><label className={styles.catalogSearch}><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск" /></label><nav>{categories.map((item) => <button className={category === item ? styles.activeCategory : ""} type="button" onClick={() => setCategory(item)} key={item}>{item}</button>)}</nav></div>
        <div className={styles.marketGrid}>{visible.map((item) => { const state = item.provider ? states.get(item.provider) : undefined; const ready = state?.status === "READY" || state?.status === "CONNECTED"; return <button className={styles.marketCard} type="button" onClick={() => setSelectedId(item.id)} key={item.id}><div className={`${styles.cardArt} ${styles[item.brand]}`}><BrandMark item={item} /><span>{item.category}</span></div><div className={styles.cardBody}><span><strong>{item.name}</strong>{ready && <i>✓</i>}</span><p>{item.description}</p><footer><StatusBadge item={item} state={state} /><b>Открыть →</b></footer></div></button>; })}</div>
      </section>
      {data?.events.length ? <section className={styles.syncLog}><h3>Последние входящие события</h3>{data.events.slice(0, 8).map((event) => <div key={event.id}><span><strong>{providerNames[event.provider]}</strong> · {event.contactName ?? "Контакт"}{event.dealNumber ? ` · сделка #${event.dealNumber}` : ""}</span><time>{new Date(event.receivedAt).toLocaleString("ru")}</time></div>)}</section> : null}
    </main>
    {selected && <IntegrationPanel item={selected} state={selected.provider ? states.get(selected.provider) : undefined} onCreated={load} onClose={() => setSelectedId(null)} />}
  </section>;
}

function BrandMark({ item }: { item: Integration }) { return <span className={`${styles.brandMark} ${styles[item.brand]}`}>{item.mark}</span>; }
function StatusBadge({ item, state }: { item: Integration; state?: IntegrationConnectionRecord }) { const ready = state?.status === "READY" || state?.status === "CONNECTED"; const label = state?.status === "CONNECTED" ? "● Подключено" : state?.status === "READY" ? "● Готово" : item.available ? "Доступно" : "Нужны доступы"; return <span className={`${styles.availability} ${ready ? styles.connectedBadge : styles.expertBadge}`}>{label}</span>; }

function IntegrationPanel({ item, state, onCreated, onClose }: { item: Integration; state?: IntegrationConnectionRecord; onCreated: () => Promise<void>; onClose: () => void }) {
  const [provider, setProvider] = useState<"TEST" | "META_LEAD_ADS" | "INSTAGRAM_DIRECT" | "TELEPHONY">(item.provider && item.provider !== "TELEGRAM" ? item.provider : "TEST");
  const [name, setName] = useState(""); const [phone, setPhone] = useState(""); const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false); const [feedback, setFeedback] = useState("");
  async function submit(event: React.FormEvent) { event.preventDefault(); setBusy(true); setFeedback(""); try { const response = await fetch("/api/crm/integrations/test-lead", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider, name, phone, message }) }); const payload = await response.json() as { result?: InboundLeadResult; message?: string }; if (!response.ok || !payload.result) throw new Error(payload.message || "Не удалось обработать тестовый лид."); setFeedback(payload.result.duplicate ? `Дубль события: сделка #${payload.result.dealNumber} не продублирована.` : `${payload.result.reusedDeal ? "Повторное обращение записано" : "Новая сделка создана"}: #${payload.result.dealNumber}. Уведомление поставлено в очередь.`); await onCreated(); } catch (caught) { setFeedback(caught instanceof Error ? caught.message : "Ошибка обработки."); } finally { setBusy(false); } }
  const canTest = item.provider !== "TELEGRAM" && item.id !== "csv";
  return <div className={styles.panelLayer}><button className={styles.backdrop} type="button" aria-label="Закрыть" onClick={onClose} /><aside className={styles.panel}><header><BrandMark item={item} /><span><small>{item.category}</small><h2>{item.name}</h2></span><button type="button" aria-label="Закрыть" onClick={onClose}>×</button></header><div className={styles.panelBody}><StatusBadge item={item} state={state} /><p>{item.description}</p>
    {state?.lastEventAt && <section className={styles.connectionState}><span><i>✓</i><strong>Последнее событие обработано</strong></span><small>{new Date(state.lastEventAt).toLocaleString("ru")}</small></section>}
    {!item.available && <section className={styles.installInfo}><h3>Адаптер подготовлен</h3><p>Ядро CRM готово принять данные канала. Для реального подключения позже потребуются реквизиты провайдера; сейчас сервис честно не отмечен подключённым.</p><div><span>✓ Единая обработка лида</span><span>✓ Защита от дублей</span><span>✓ Очередь уведомлений</span><span>○ Внешние реквизиты</span></div></section>}
    {canTest && <form className={styles.testForm} onSubmit={submit}><h3>Проверить входящий маршрут</h3><label><span>Источник события</span><select value={provider} onChange={(event) => setProvider(event.target.value as typeof provider)}><option value="TEST">Тестовый шлюз</option><option value="META_LEAD_ADS">Facebook Lead Ads</option><option value="INSTAGRAM_DIRECT">Instagram Direct</option><option value="TELEPHONY">Телефония</option></select></label><label><span>Имя</span><input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Тестовый клиент" /></label><label><span>Телефон</span><input required inputMode="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+380 63 123 45 67" /></label><label><span>Запрос</span><textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Интересуется покупкой квартиры" /></label>{feedback && <p className={styles.formFeedback}>{feedback}</p>}<button className={styles.panelPrimary} disabled={busy} type="submit">{busy ? "Обрабатываем…" : "Отправить тестовый лид"}</button></form>}
    {item.id === "csv" && <section className={styles.installInfo}><h3>Файловый обмен уже находится в воронке</h3><p>Импорт и экспорт CSV/XLSX запускаются из меню воронки и не требуют внешней авторизации.</p></section>}
  </div></aside></div>;
}
