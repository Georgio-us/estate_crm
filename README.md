# Estate CRM

CRM для агентств недвижимости. Текущий frontend-прототип включает воронку, контакты, каталог объектов и центр задач. Backend, импорт, Meta Lead Ads и Telegram-уведомления будут подключаться следующими этапами.

## Стек

- Next.js App Router
- React
- TypeScript
- обычный CSS и CSS Modules
- PostgreSQL и Prisma на backend-этапе
- Zod для валидации
- dnd-kit для drag-and-drop воронки

Tailwind в проекте не используется.

## Запуск

```bash
pnpm install
pnpm dev
```

После запуска приложение доступно по адресу `http://localhost:3000`.

## Структура

```text
src/
  app/                  Next.js App Router и глобальные стили
  components/
    layout/             каркас, меню и общая навигация
    pipeline/           воронка, колонки и карточки сделок
    contacts/           база контактов и карточка клиента
    properties/         каталог и карточки недвижимости
    tasks/              единый центр задач
  data/                 временные mock-данные
  types/                общие типы предметной области
docs/                   рабочая проектная документация
```

Подробная спецификация: [`docs/CRM_MVP_SPEC.md`](docs/CRM_MVP_SPEC.md).
