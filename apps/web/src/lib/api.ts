const fallbackApiUrl = "http://localhost:3001";

export function getApiUrl(): string {
  return (process.env.NEXT_PUBLIC_API_URL || fallbackApiUrl).replace(/\/$/, "");
}
