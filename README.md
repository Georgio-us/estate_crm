# Estate CRM

CRM для агентств недвижимости. Репозиторий организован как monorepo: рабочий frontend находится в `apps/web`, Fastify API — в `apps/api`, а схема PostgreSQL и миграции Prisma — в `packages/database`. Данные интерфейса пока остаются mock-данными; перенос отдельных модулей на API выполняется следующими этапами.

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

Сессии хранятся в PostgreSQL, а браузер получает только случайный HTTP-only cookie. Для первоначального создания администратора предусмотрена отдельная одноразовая команда `pnpm --filter @estate-crm/api bootstrap-admin`; она не открывает публичный endpoint регистрации.

Frontend требует адрес API во время сборки:

```text
NEXT_PUBLIC_API_URL=https://estatecrmapi-crmdelmar.up.railway.app
```

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
- текущее состояние исполнения: [`docs/CURRENT_EXECUTION_STATE.md`](docs/CURRENT_EXECUTION_STATE.md).

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
```

`PORT` устанавливается Railway автоматически. `HOST` по умолчанию уже равен `0.0.0.0`.

Миграции production-базы выполняются отдельным pre-deploy шагом API:

```text
pnpm --filter @estate-crm/database db:migrate:deploy
```

`GET /health` возвращает успешный статус только после реального подключения к PostgreSQL.
