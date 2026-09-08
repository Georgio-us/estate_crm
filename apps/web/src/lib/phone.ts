export function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits.startsWith("0") && digits.length === 10 ? `38${digits}` : digits;
}

export function formatPhoneInput(value: string): string {
  let digits = value.replace(/\D/g, "").slice(0, 15);
  if (digits.startsWith("0")) digits = `38${digits}`;
  if (!digits) return "";
  if (!digits.startsWith("380")) return `+${digits}`;

  const groups = [digits.slice(0, 3), digits.slice(3, 5), digits.slice(5, 8), digits.slice(8, 10), digits.slice(10, 12)].filter(Boolean);
  return `+${groups.join(" ")}`;
}

export function isValidPhone(value: string): boolean {
  const digits = normalizePhone(value);
  return digits.startsWith("380") ? digits.length === 12 : digits.length >= 10 && digits.length <= 15;
}
