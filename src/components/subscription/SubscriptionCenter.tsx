"use client";

import { useMemo, useState } from "react";
import styles from "./subscription.module.css";

type Tab = "overview" | "plans" | "extensions" | "usage" | "payments";
type PlanId = "trial" | "base" | "pro" | "enterprise";

const tabs: { id: Tab; label: string }[] = [
  { id: "overview", label: "Обзор" },
  { id: "plans", label: "Планы" },
  { id: "extensions", label: "Интеграции и модули" },
  { id: "usage", label: "Использование" },
  { id: "payments", label: "Оплаты" },
];

const plans = [
  { id: "trial" as PlanId, name: "Trial", price: 0, note: "14 дней", summary: "Вся CRM для знакомства без привязки карты.", features: ["До 3 сотрудников", "Все основные разделы", "2 подключения", "Базовый Via AI"] },
  { id: "base" as PlanId, name: "Base", price: 15, note: "за место / месяц", summary: "Основная работа небольшой команды без лишней сложности.", features: ["Контакты, объекты и сделки", "Задачи и календарь", "3 активные интеграции", "Базовые отчёты"] },
  { id: "pro" as PlanId, name: "Pro", price: 29, note: "за место / месяц", summary: "Автоматизация, коммуникации и контроль растущей команды.", features: ["Всё из Base", "Интеграции без лимита", "Телефония и WhatsApp", "Via AI и журнал действий", "Расширенная аналитика"] },
  { id: "enterprise" as PlanId, name: "Enterprise", price: null, note: "индивидуально", summary: "CRM под процессы, инфраструктуру и правила компании.", features: ["Всё из Pro", "Собственные роли и модули", "SSO и расширенный аудит", "Миграция и приоритетная поддержка"] },
];

const extensions = [
  { icon: "V", tone: "violet", title: "Via AI", kind: "AI", description: "Квалификация обращений, резюме диалогов и заполнение карточек.", price: "$19 / месяц", status: "Доступно в Pro" },
  { icon: "☎", tone: "orange", title: "Телефония", kind: "Коммуникации", description: "Входящие звонки, записи разговоров и привязка к сделкам.", price: "от $12 / номер", status: "Подключение специалистом" },
  { icon: "◔", tone: "green", title: "WhatsApp Business", kind: "Коммуникации", description: "Диалоги с клиентами внутри CRM и общая история общения.", price: "$10 / номер", status: "Можно подключить" },
  { icon: "∿", tone: "blue", title: "AI-резюме звонков", kind: "AI", description: "Расшифровка разговора, договорённости и следующая задача.", price: "$9 / 500 минут", status: "Требуется телефония" },
  { icon: "▦", tone: "graphite", title: "Собственный модуль", kind: "Кастомизация", description: "Новая сущность, раздел или рабочий процесс под вашу команду.", price: "Индивидуально", status: "Обсудить задачу" },
  { icon: "P", tone: "indigo", title: "Синхронизация базы", kind: "Данные", description: "PostgreSQL, API или регулярный обмен с внешней системой.", price: "Индивидуально", status: "Обсудить схему" },
];

const usage = [
  { label: "Места команды", value: "4 из 5", percent: 80, detail: "Одно место свободно" },
  { label: "Активные интеграции", value: "3 из 3", percent: 100, detail: "Лимит плана Base" },
  { label: "Действия Via AI", value: "184 из 500", percent: 37, detail: "Обновится 5 октября" },
  { label: "Хранилище файлов", value: "1,8 из 10 ГБ", percent: 18, detail: "Записи и вложения" },
];

export function SubscriptionCenter() {
  const [tab, setTab] = useState<Tab>("overview");
  const [annual, setAnnual] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<PlanId>("base");
  const [notice, setNotice] = useState("");

  const selected = useMemo(() => plans.find((plan) => plan.id === selectedPlan)!, [selectedPlan]);

  function notify(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2600);
  }

  return (
    <section className={styles.page}>
      <header className={styles.topbar}>
        <div><span>Управление</span><h1>Подписка</h1></div>
        <button type="button" onClick={() => setTab("payments")}>Счета и документы</button>
      </header>

      <nav className={styles.tabs} aria-label="Разделы подписки">
        {tabs.map((item) => <button type="button" className={tab === item.id ? styles.activeTab : ""} onClick={() => setTab(item.id)} key={item.id}>{item.label}</button>)}
      </nav>

      {tab === "overview" && <Overview onTab={setTab} onNotify={notify} />}
      {tab === "plans" && <Plans annual={annual} setAnnual={setAnnual} selectedPlan={selectedPlan} setSelectedPlan={setSelectedPlan} selected={selected} onNotify={notify} />}
      {tab === "extensions" && <Extensions onNotify={notify} />}
      {tab === "usage" && <Usage />}
      {tab === "payments" && <Payments onNotify={notify} />}

      {notice && <div className={styles.notice} role="status">✓ {notice}</div>}
    </section>
  );
}

function Overview({ onTab, onNotify }: { onTab: (tab: Tab) => void; onNotify: (message: string) => void }) {
  return <main>
    <section className={styles.overviewHero}>
      <div className={styles.planIdentity}>
        <span className={styles.kicker}>Текущий план</span>
        <div className={styles.planName}><h2>Base</h2><span>Активен</span></div>
        <p>Всё необходимое для работы команды с клиентами, объектами и сделками.</p>
        <button className={styles.primaryButton} type="button" onClick={() => onTab("plans")}>Сравнить и обновить план</button>
      </div>
      <div className={styles.priceBlock}><span>Стоимость</span><strong>$60</strong><small>в месяц · 4 места по $15</small></div>
    </section>

    <section className={styles.accountFacts}>
      <div><span>Последняя оплата</span><strong>5 сентября 2026</strong><small>Карта •••• 4242</small></div>
      <div><span>Подписка действует до</span><strong>5 октября 2026</strong><small>29 дней осталось</small></div>
      <div><span>Места команды</span><strong>4 из 5 занято</strong><button type="button" onClick={() => onNotify("Управление местами открыто")}>Управлять местами →</button></div>
      <div><span>Автопродление</span><strong>Включено</strong><button type="button" onClick={() => onNotify("Настройки оплаты открыты")}>Настроить оплату →</button></div>
    </section>

    <section className={styles.overviewGrid}>
      <article className={styles.planIncludes}><header><div><span className={styles.kicker}>В вашем плане</span><h3>Base покрывает основную работу</h3></div><button type="button" onClick={() => onTab("plans")}>Все возможности →</button></header><div className={styles.includeGrid}><span>✓ Контакты и компании</span><span>✓ Воронка продаж</span><span>✓ Объекты недвижимости</span><span>✓ Задачи и календарь</span><span>✓ Работа команды</span><span>✓ 3 активные интеграции</span></div></article>
      <article className={styles.upgradeCard}><span className={styles.kicker}>Следующий уровень</span><h3>Больше каналов — меньше ручной работы</h3><p>В Pro доступны телефония, WhatsApp, автоматизация, расширенный Via AI и интеграции без лимита.</p><strong>$29 <small>за место / месяц</small></strong><button type="button" onClick={() => onTab("plans")}>Посмотреть Pro →</button></article>
    </section>

    <section className={styles.quickExtensions}><header><div><span className={styles.kicker}>Расширение CRM</span><h3>Подключайте только то, что нужно команде</h3></div><button type="button" onClick={() => onTab("extensions")}>Открыть каталог →</button></header><div><button type="button" onClick={() => onTab("extensions")}><i className={styles.violet}>V</i><span><strong>Via AI</strong><small>Резюме и квалификация</small></span><b>›</b></button><button type="button" onClick={() => onTab("extensions")}><i className={styles.orange}>☎</i><span><strong>Телефония</strong><small>Звонки внутри CRM</small></span><b>›</b></button><button type="button" onClick={() => onTab("extensions")}><i className={styles.graphite}>▦</i><span><strong>Свой модуль</strong><small>Под ваш процесс</small></span><b>›</b></button></div></section>
  </main>;
}

function Plans({ annual, setAnnual, selectedPlan, setSelectedPlan, selected, onNotify }: { annual: boolean; setAnnual: (value: boolean) => void; selectedPlan: PlanId; setSelectedPlan: (id: PlanId) => void; selected: typeof plans[number]; onNotify: (message: string) => void }) {
  return <main className={styles.plansPage}>
    <section className={styles.sectionIntro}><div><span className={styles.kicker}>Тарифы</span><h2>План под текущий этап команды</h2><p>Начните с основной CRM и добавляйте автоматизацию, когда она действительно понадобится.</p></div><div className={styles.periodToggle}><button className={!annual ? styles.periodActive : ""} type="button" onClick={() => setAnnual(false)}>Ежемесячно</button><button className={annual ? styles.periodActive : ""} type="button" onClick={() => setAnnual(true)}>За год <span>−15%</span></button></div></section>
    <section className={styles.planGrid}>{plans.map((plan) => { const price = plan.price === null ? null : annual ? Math.round(plan.price * .85) : plan.price; return <button type="button" className={`${styles.planCard} ${plan.id === "pro" ? styles.featuredPlan : ""} ${selectedPlan === plan.id ? styles.selectedPlan : ""}`} onClick={() => setSelectedPlan(plan.id)} key={plan.id}>{plan.id === "pro" && <span className={styles.popular}>Для растущей команды</span>}<header><span>{plan.name}</span>{plan.id === "base" && <i>Ваш план</i>}</header><p>{plan.summary}</p><div className={styles.planPrice}>{price === null ? <strong>По запросу</strong> : <><strong>${price}</strong><small>{plan.note}</small></>}</div><ul>{plan.features.map((feature) => <li key={feature}>✓ {feature}</li>)}</ul><span className={styles.choosePlan}>{selectedPlan === plan.id ? "Выбран" : "Выбрать"}</span></button>; })}</section>
    <section className={styles.planAction}><span><strong>{selected.name}</strong><small>{selected.id === "base" ? "Ваш текущий план" : selected.summary}</small></span><button type="button" disabled={selected.id === "base"} onClick={() => onNotify(selected.id === "enterprise" ? "Заявка на консультацию отправлена" : `Выбран переход на ${selected.name}`)}>{selected.id === "base" ? "Текущий план" : selected.id === "enterprise" ? "Обсудить Enterprise" : `Перейти на ${selected.name}`}</button></section>
    <Comparison />
  </main>;
}

function Comparison() {
  const rows = [
    ["Сотрудники", "3", "от 1", "от 3", "Без ограничений"],
    ["Активные интеграции", "2", "3", "Без ограничений", "Без ограничений"],
    ["Воронки продаж", "1", "3", "Без ограничений", "Без ограничений"],
    ["Via AI", "Базовый", "Базовый", "Расширенный", "Индивидуальный"],
    ["Телефония и WhatsApp", "—", "Дополнение", "Включено", "Включено"],
    ["Автоматизация", "—", "—", "Включено", "Под процессы"],
    ["Журнал действий", "7 дней", "30 дней", "1 год", "По регламенту"],
  ];
  return <section className={styles.comparison}><header><span className={styles.kicker}>Сравнение</span><h3>Главные различия</h3></header><div className={styles.tableWrap}><table><thead><tr><th>Возможность</th><th>Trial</th><th>Base</th><th>Pro</th><th>Enterprise</th></tr></thead><tbody>{rows.map((row) => <tr key={row[0]}>{row.map((cell, index) => <td key={`${row[0]}-${index}`}>{index === 0 ? <strong>{cell}</strong> : cell}</td>)}</tr>)}</tbody></table></div></section>;
}

function Extensions({ onNotify }: { onNotify: (message: string) => void }) {
  const [filter, setFilter] = useState("Все");
  const categories = ["Все", "AI", "Коммуникации", "Данные", "Кастомизация"];
  const visible = filter === "Все" ? extensions : extensions.filter((item) => item.kind === filter);
  return <main className={styles.extensionsPage}><section className={styles.sectionIntro}><div><span className={styles.kicker}>Дополнения</span><h2>Соберите CRM под свои процессы</h2><p>Готовые подключения имеют фиксированную цену. Индивидуальная разработка оценивается только после согласования задачи.</p></div></section><nav className={styles.filters}>{categories.map((category) => <button className={filter === category ? styles.filterActive : ""} type="button" onClick={() => setFilter(category)} key={category}>{category}</button>)}</nav><section className={styles.extensionGrid}>{visible.map((item) => <article key={item.title}><div className={`${styles.extensionIcon} ${styles[item.tone]}`}>{item.icon}</div><span className={styles.extensionKind}>{item.kind}</span><h3>{item.title}</h3><p>{item.description}</p><footer><span><strong>{item.price}</strong><small>{item.status}</small></span><button type="button" onClick={() => onNotify(`Запрос по «${item.title}» сохранён`)}>Подробнее →</button></footer></article>)}</section><section className={styles.customBanner}><div><span className={styles.kicker}>Нет готового решения?</span><h3>Спроектируем интеграцию или модуль под вас</h3><p>Сначала фиксируем процесс и результат. После этого отдельно согласуем объём, цену и поддержку — без скрытой доплаты к подписке.</p></div><button type="button" onClick={() => onNotify("Запрос на обсуждение создан")}>Обсудить задачу</button></section></main>;
}

function Usage() {
  return <main className={styles.usagePage}><section className={styles.sectionIntro}><div><span className={styles.kicker}>Текущий период</span><h2>Использование плана Base</h2><p>Фактические лимиты за период с 5 сентября по 5 октября.</p></div><strong>29 дней осталось</strong></section><section className={styles.usageGrid}>{usage.map((item) => <article key={item.label}><header><span>{item.label}</span><strong>{item.value}</strong></header><div className={styles.progress}><i style={{ width: `${item.percent}%` }} /></div><small>{item.detail}</small></article>)}</section><section className={styles.usageNote}><span>i</span><div><strong>Никаких неожиданных списаний</strong><p>При достижении лимита функция остановится или предложит перейти на другой план. Доплаты подключаются только после вашего подтверждения.</p></div></section></main>;
}

function Payments({ onNotify }: { onNotify: (message: string) => void }) {
  const payments = [
    ["INV-2026-0905", "5 сентября 2026", "Base · 4 места", "$60", "Оплачен"],
    ["INV-2026-0805", "5 августа 2026", "Base · 4 места", "$60", "Оплачен"],
    ["INV-2026-0705", "5 июля 2026", "Base · 3 места", "$45", "Оплачен"],
  ];
  return <main className={styles.paymentsPage}><section className={styles.sectionIntro}><div><span className={styles.kicker}>Оплата</span><h2>Счета и документы</h2><p>История фактических списаний по подписке и дополнениям.</p></div><button className={styles.secondaryButton} type="button" onClick={() => onNotify("Настройки способа оплаты открыты")}>Карта •••• 4242</button></section><section className={styles.paymentSummary}><div><span>Текущий план</span><strong>Base · 4 места</strong></div><div><span>Период</span><strong>5 сен — 5 окт 2026</strong></div><div><span>Оплачено за период</span><strong>$60</strong></div></section><section className={styles.paymentTable}><header><h3>История оплат</h3><span>Все суммы в USD</span></header><div className={styles.tableWrap}><table><thead><tr><th>Номер</th><th>Дата</th><th>Назначение</th><th>Сумма</th><th>Статус</th><th /></tr></thead><tbody>{payments.map((payment) => <tr key={payment[0]}>{payment.map((cell, index) => <td key={cell}>{index === 4 ? <span className={styles.paid}>{cell}</span> : cell}</td>)}<td><button type="button" onClick={() => onNotify(`Счёт ${payment[0]} подготовлен`)}>Скачать</button></td></tr>)}</tbody></table></div></section></main>;
}
