# Estate CRM

CRM для агентств недвижимости. Репозиторий организован как monorepo: рабочий frontend находится в `apps/web`, Fastify API — в `apps/api`, а схема PostgreSQL и миграции Prisma — в `packages/database`. Авторизация, контакты, воронка, задачи, календарь и первый реальный поток Meta Lead Ads для Delmar подключены к постоянному хранению; оставшиеся модули переводятся с прототипов поэтапно.

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

Frontend требует адрес API во время сборки:

```text
NEXT_PUBLIC_API_URL=https://estatecrmapi-crmdelmar.up.railway.app
```

Браузер обращается к same-origin маршрутам `/api/auth/*`; Next.js проксирует их в отдельный API-сервис. Поэтому session cookie принадлежит frontend-домену и работает при включённой блокировке сторонних cookies.

Полная проверка workspace:

```bash
pnpm check
```

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

- спецификация MVP: [`docs/CRM_MVP_SPEC.md`](docs/CRM_MVP_SPEC.md);
- дизайн-система и токены: [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md);
- текущее состояние исполнения: [`docs/CURRENT_EXECUTION_STATE.md`](docs/CURRENT_EXECUTION_STATE.md);
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
