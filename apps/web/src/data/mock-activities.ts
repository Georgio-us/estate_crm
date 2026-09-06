import type { ActivityEvent } from "@/types/crm";

export const mockActivities: Record<string, ActivityEvent[]> = {
  "deal-1": [
    { id: "a-1-1", dealId: "deal-1", category: "task", title: "Поставлена задача", description: "Связаться сегодня", author: "Система", occurredAt: "10:43" },
    { id: "a-1-2", dealId: "deal-1", category: "source", title: "Сделка создана", description: "Получен лид из Meta", occurredAt: "10:42" },
  ],
  "deal-2": [
    { id: "a-2-1", dealId: "deal-2", category: "source", title: "Сделка создана", description: "Получен лид из Meta", occurredAt: "09:18" },
  ],
  "deal-3": [
    { id: "a-3-1", dealId: "deal-3", category: "task", title: "Поставлена задача", description: "Позвонить до 14:00", author: "Елена", occurredAt: "11:26" },
    { id: "a-3-2", dealId: "deal-3", category: "change", title: "Назначен ответственный", description: "Елена", occurredAt: "11:24" },
    { id: "a-3-3", dealId: "deal-3", category: "source", title: "Сделка создана", description: "Получена заявка с сайта", occurredAt: "Вчера, 18:34" },
  ],
  "deal-4": [
    { id: "a-4-1", dealId: "deal-4", category: "task", title: "Поставлена задача", description: "Повторный звонок завтра", author: "Георгий", occurredAt: "12:10" },
    { id: "a-4-2", dealId: "deal-4", category: "change", title: "Этап изменён", description: "Новый лид → Не дозвонились", author: "Георгий", occurredAt: "12:08" },
  ],
  "deal-5": [],
  "deal-6": [
    { id: "a-6-1", dealId: "deal-6", category: "task", title: "Поставлена задача", description: "Подготовить подборку", author: "Георгий", occurredAt: "09:40" },
  ],
  "deal-7": [
    { id: "a-7-1", dealId: "deal-7", category: "task", title: "Поставлена задача", description: "Отправить 3 объекта", author: "Андрей", occurredAt: "13:05" },
    { id: "a-7-2", dealId: "deal-7", category: "object", title: "Объект предложен", description: "ЖК Новый берег · квартира 42", author: "Андрей", occurredAt: "12:58" },
  ],
};
