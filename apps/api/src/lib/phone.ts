export interface ParsedPhone {
  formatted: string;
  normalized: string;
}

export function parsePhone(value: string | null | undefined): ParsedPhone | null {
  const rawDigits = value?.replace(/\D/g, "") ?? "";
  if (!rawDigits) return null;

  const normalized = rawDigits.startsWith("0") && rawDigits.length === 10
    ? `38${rawDigits}`
    : rawDigits;

  if (normalized.length < 10 || normalized.length > 15) return null;

  if (normalized.startsWith("380") && normalized.length === 12) {
    return {
      normalized,
      formatted: `+${normalized.slice(0, 3)} ${normalized.slice(3, 5)} ${normalized.slice(5, 8)} ${normalized.slice(8, 10)} ${normalized.slice(10, 12)}`,
    };
  }

  return { normalized, formatted: `+${normalized}` };
}
