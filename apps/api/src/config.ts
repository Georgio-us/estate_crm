export interface ApiConfig {
  host: string;
  port: number;
  webOrigins: string[];
  databaseUrl: string;
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
  };
}
