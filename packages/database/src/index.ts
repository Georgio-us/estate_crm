import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "./generated/prisma/client.js";

export interface DatabaseConnection {
  client: PrismaClient;
  ping(): Promise<void>;
  disconnect(): Promise<void>;
}

export function createDatabaseConnection(databaseUrl: string): DatabaseConnection {
  if (!databaseUrl.trim()) {
    throw new Error("DATABASE_URL is required");
  }

  const adapter = new PrismaPg({ connectionString: databaseUrl });
  const client = new PrismaClient({ adapter });

  return {
    client,
    async ping() {
      await client.$queryRaw`SELECT 1`;
    },
    async disconnect() {
      await client.$disconnect();
    },
  };
}

export { PrismaClient };
export * from "./generated/prisma/enums.js";
export type * from "./generated/prisma/models.js";
