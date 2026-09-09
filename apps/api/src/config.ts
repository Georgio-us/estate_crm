export interface ApiConfig {
  host: string;
  port: number;
  webOrigins: string[];
  databaseUrl: string;
  sessionDays: number;
  secureCookies: boolean;
  telegramBotToken?: string;
  telegramBotUsername?: string;
  publicApiUrl?: string;
  webAppUrl?: string;
}

function readPort(value: string | undefined): number {
  const port = Number(value ?? "3001");

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`PORT must be an integer between 1 and 65535; received ${value}`);
  }

  return port;
}

export function readApiConfig(environment: NodeJS.ProcessEnv = process.env): ApiConfig {
  const webOrigins = (environment.WEB_APP_ORIGIN ?? "http://localhost:3000")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return {
    host: environment.HOST?.trim() || "0.0.0.0",
    port: readPort(environment.PORT),
    webOrigins,
    databaseUrl: environment.DATABASE_URL?.trim() || "",
    sessionDays: 30,
    secureCookies: environment.NODE_ENV === "production",
    telegramBotToken: environment.TELEGRAM_BOT_TOKEN?.trim() || "",
    telegramBotUsername: environment.TELEGRAM_BOT_USERNAME?.trim().replace(/^@/, "") || "",
    publicApiUrl: (environment.API_PUBLIC_URL?.trim()
      || (environment.RAILWAY_PUBLIC_DOMAIN ? `https://${environment.RAILWAY_PUBLIC_DOMAIN.trim()}` : "")).replace(/\/$/, ""),
    webAppUrl: (environment.APP_URL?.trim() || webOrigins[0] || "http://localhost:3000").replace(/\/$/, ""),
  };
}
