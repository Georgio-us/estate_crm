import { createDatabaseConnection } from "@estate-crm/database";

import { hashPassword } from "./password.js";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

const database = createDatabaseConnection(required("DATABASE_URL"));

try {
  const email = required("BOOTSTRAP_ADMIN_EMAIL").toLowerCase();
  const existingUser = await database.client.user.findUnique({ where: { email } });

  if (existingUser) {
    console.log(`Bootstrap skipped: ${email} already exists.`);
  } else {
    const organizationName = process.env.BOOTSTRAP_ORGANIZATION_NAME?.trim() || "CRM Del Mar";
    const organizationSlug = process.env.BOOTSTRAP_ORGANIZATION_SLUG?.trim() || "crm-delmar";
    const adminName = process.env.BOOTSTRAP_ADMIN_NAME?.trim() || "Администратор";
    const passwordHash = await hashPassword(required("BOOTSTRAP_ADMIN_PASSWORD"));

    await database.client.$transaction(async (transaction) => {
      const organization = await transaction.organization.upsert({
        where: { slug: organizationSlug },
        create: { name: organizationName, slug: organizationSlug },
        update: {},
      });

      await transaction.user.create({
        data: {
          email,
          name: adminName,
          passwordHash,
          memberships: {
            create: {
              organizationId: organization.id,
              role: "ADMIN",
              status: "ACTIVE",
            },
          },
        },
      });
    });

    console.log(`Bootstrap complete: ${email} is the CRM administrator.`);
  }
} finally {
  await database.disconnect();
}
