# Estate CRM

CRM для агентств недвижимости. Репозиторий организован как monorepo: рабочий frontend находится в `apps/web`, а минимальный Fastify API — в `apps/api`. Бизнес-данные всё ещё являются mock-данными; PostgreSQL, авторизация и интеграции подключаются следующими этапами.

## Стек

- Next.js App Router и React;
- Fastify API;
- TypeScript и pnpm workspaces;
- обычный CSS и CSS Modules;
- dnd-kit для drag-and-drop воронки;
- PostgreSQL и ORM — следующий backend-этап.

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
  database/             будущая точка входа ORM и миграций
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
```

`PORT` устанавливается Railway автоматически. `HOST` по умолчанию уже равен `0.0.0.0`.
