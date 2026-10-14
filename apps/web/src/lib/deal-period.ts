export type DealPeriod = { kind: "all" } | { kind: "days"; days: number } | { kind: "range"; from: string; to: string };

export function dateInTimezone(value: Date | string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value));
  return ["year", "month", "day"].map((type) => parts.find((part) => part.type === type)!.value).join("-");
}

export function shiftDate(key: string, days: number): string {
  const date = new Date(`${key}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function periodBounds(period: DealPeriod, today: string): { from: string; to: string } | null {
  if (period.kind === "all") return null;
  if (period.kind === "range") return { from: period.from, to: period.to };
  return { from: shiftDate(today, 1 - period.days), to: today };
}

export function matchesDealPeriod(timestamp: string | undefined, period: DealPeriod, today: string, timeZone: string): boolean {
  const bounds = periodBounds(period, today);
  if (!bounds) return true;
  if (!timestamp || Number.isNaN(Date.parse(timestamp))) return false;
  const day = dateInTimezone(timestamp, timeZone);
  return day >= bounds.from && day <= bounds.to;
}

export function shortDate(key: string): string {
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${key}T12:00:00Z`));
}

export function periodLabel(period: DealPeriod): string {
  if (period.kind === "all") return "За всё время";
  if (period.kind === "days") return `Последние ${period.days} дней`;
  return `${shortDate(period.from)} — ${shortDate(period.to)}`;
}
