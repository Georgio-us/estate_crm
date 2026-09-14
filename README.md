# Estate CRM

CRM для агентств недвижимости. Репозиторий организован как monorepo: рабочий frontend находится в `apps/web`, Fastify API — в `apps/api`, а схема PostgreSQL и миграции Prisma — в `packages/database`. Авторизация, контакты, воронка, задачи, календарь, настройки, подборки объектов в сделках и первый реальный поток Meta Lead Ads для Delmar подключены к постоянному хранению. Каталог пока смешивает серверные объекты с явно помеченными демо-проектами. Подписка остаётся интерфейсной моделью.

Актуальная граница готовности — **контролируемое тестирование**, не подтверждённый production-запуск. Перед штатной работой с клиентскими данными нужны проверка безопасности, восстановление из резервной копии и приёмка сценариев с реальной базой объектов и сотрудниками. Instagram Direct и телефония не подключены и рассматриваются только при подтверждённой потребности клиента; их отсутствие не блокирует базовый сценарий CRM.

## Стек

- Next.js App Router и React;
- Fastify API;
- PostgreSQL и Prisma;
- TypeScript и pnpm workspaces;
- обычный CSS и CSS Modules;
- dnd-kit для drag-and-drop воронки;

Tailwind в проекте не используется.

## Запуск

```bash
pnpm install
pnpm dev
```

Frontend доступен по адресу `http://localhost:3000`.

API запускается отдельно:

```bash
pnpm dev:api
```

По умолчанию healthcheck доступен по адресу `http://localhost:3001/health`.

Доступные auth-endpoint'ы API:

```text
POST /auth/login
GET  /auth/session
POST /auth/logout
```

Первые бизнес-endpoint'ы:

```text
GET   /contacts
POST  /contacts
GET   /pipeline
POST  /deals
PATCH /deals/:dealId/stage
```

Сессии хранятся в PostgreSQL, а браузер получает только случайный HTTP-only cookie. Для первоначального создания администратора предусмотрена отдельная одноразовая команда `pnpm --filter @estate-crm/api bootstrap-admin`; она не открывает публичный endpoint регистрации.

## Письма и восстановление пароля

Для автоматической отправки приглашений и восстановления пароля API использует [Resend Email API](https://resend.com/docs/api-reference/emails/send-email). На API-сервисе задаются `RESEND_API_KEY` и `EMAIL_FROM` (например, `Estate CRM <crm@your-domain.com>`). Домен адреса отправителя должен быть подтверждён у почтового провайдера. Ключ хранится только в серверных переменных Railway, не во frontend. `APP_URL` должен указывать на публичный адрес CRM: именно из него формируются ссылки в письмах.

Пока почта не настроена, приглашение по-прежнему создаётся с одноразовой ссылкой на 7 дней. Интерфейс показывает, была ли передача письма почтовому сервису успешной, и всегда позволяет скопировать ссылку вручную. Повторный выпуск приглашения отменяет старую ссылку и формирует новую.

После настройки почты на странице входа появляется «Забыли пароль?». Для действующей активной учётной записи CRM отправляет ссылку на 30 минут. Ссылка одноразовая; хранится только её SHA-256-хеш. Ответ на запрос одинаков для известного и неизвестного email, частота запросов ограничена. После смены пароля все прежние сеансы завершаются, а пользователь входит заново. Пока почта не настроена, ссылка на входе скрыта, а прямой запрос восстановления сообщает о недоступности сервиса. Примените миграцию `20260914110000_add_password_reset_tokens` до развёртывания этой версии API.

Frontend требует адрес API во время сборки:

```text
NEXT_PUBLIC_API_URL=https://estatecrmapi-crmdelmar.up.railway.app
```

Браузер обращается к same-origin маршрутам `/api/auth/*`; Next.js проксирует их в отдельный API-сервис. Поэтому session cookie принадлежит frontend-домену и работает при включённой блокировке сторонних cookies.

Полная проверка workspace:

```bash
pnpm check
```

## Диагностика пилота

После применения миграций администратор открывает **Настройки → Диагностика пилота**. Экран показывает последние 14 дней: активность сотрудников, посещённые разделы, успешные изменяющие API-запросы, ошибки API и браузера, ответы от 1,5 секунды, устройство и идентификатор запроса для поиска в серверном журнале. Кнопка «Обновить» повторно загружает данные. События сохраняются в PostgreSQL на 30 дней; записи старше этого срока удаляются при поступлении нового события.

Диагностика записывает только тип события, маршрут без параметров и значений из URL, код ответа, время выполнения, пользователя и сеанс. Тексты карточек, телефоны и содержимое форм не сохраняются. Полный отказ API не может быть записан в его базу: такие случаи дополнительно проверяются по журналу Railway. Экран доступен только роли `ADMIN`; события других организаций не показываются.

## Структура

```text
apps/
  web/                  Next.js frontend
  api/                  Fastify API и healthcheck
packages/
  contracts/            общие API-контракты
  database/             Prisma-схема, клиент и миграции PostgreSQL
  config/               общая TypeScript-конфигурация
docs/                    рабочая проектная документация
```

Документация:

- историческая начальная спецификация MVP: [`docs/CRM_MVP_SPEC.md`](docs/CRM_MVP_SPEC.md);
- дизайн-система и токены: [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md);
- текущее состояние исполнения: [`docs/CURRENT_EXECUTION_STATE.md`](docs/CURRENT_EXECUTION_STATE.md);
- исторический срез от 9 сентября: [`docs/ARCHIVE_EXECUTION_STATE_2026-09-09.md`](docs/ARCHIVE_EXECUTION_STATE_2026-09-09.md);
- эксплуатация интеграционного шлюза: [`docs/INTEGRATIONS_RUNBOOK.md`](docs/INTEGRATIONS_RUNBOOK.md);
- текущая архитектура Meta Lead Ads и отложенный обратный контур: [`docs/META_LEAD_INTEGRATION.md`](docs/META_LEAD_INTEGRATION.md).

## Railway

Существующий frontend-сервис продолжает работать из корня репозитория:

```text
Build command: pnpm build
Start command: pnpm start
```

Для отдельного API-сервиса из того же репозитория:

```text
Root directory: /
Build command: pnpm --filter @estate-crm/api build
Start command: pnpm --filter @estate-crm/api start
Healthcheck path: /health
```

Начальная переменная API:

```text
WEB_APP_ORIGIN=https://estatecrm-crmdelmar.up.railway.app
DATABASE_URL=${{Postgres.DATABASE_URL}}
APP_URL=https://estatecrm-crmdelmar.up.railway.app
TELEGRAM_BOT_TOKEN=<sealed shared variable>
TELEGRAM_BOT_USERNAME=<shared bot username without @>
```

`PORT` и `RAILWAY_PUBLIC_DOMAIN` устанавливаются Railway автоматически. `HOST` по умолчанию уже равен `0.0.0.0`. При необходимости публичный адрес API можно явно переопределить переменной `API_PUBLIC_URL`.

Миграции production-базы выполняются отдельным pre-deploy шагом API:

```text
pnpm --filter @estate-crm/database db:migrate:deploy
```

`GET /health` возвращает успешный статус только после реального подключения к PostgreSQL.
