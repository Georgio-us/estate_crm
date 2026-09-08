import type { ActivityCategory, ActivityEvent } from "@/types/crm";

const categoryFromApi = {
  NOTE: "note",
  TASK: "task",
  CHANGE: "change",
  SOURCE: "source",
  OBJECT: "object",
} as const satisfies Record<string, ActivityCategory>;

export interface ApiActivity {
  id: string;
  contactId: string | null;
  dealId: string | null;
  category: keyof typeof categoryFromApi;
  title: string;
  description: string | null;
  author: { id: string; name: string } | null;
  occurredAt: string;
}

export function mapApiActivity(activity: ApiActivity): ActivityEvent {
  const date = new Date(activity.occurredAt);
  const today = new Date();
  const isToday = date.toDateString() === today.toDateString();
  return {
    id: activity.id,
    dealId: activity.dealId || "",
    category: categoryFromApi[activity.category],
    title: activity.title,
    description: activity.description || undefined,
    author: activity.author?.name,
    occurredAt: new Intl.DateTimeFormat("ru-RU", isToday
      ? { hour: "2-digit", minute: "2-digit" }
      : { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(date),
  };
}
