CREATE TABLE "contact_relations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "contact_a_id" UUID NOT NULL,
    "contact_b_id" UUID NOT NULL,
    "label" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_relations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "contact_relations_contact_a_id_contact_b_id_key" ON "contact_relations"("contact_a_id", "contact_b_id");
CREATE INDEX "contact_relations_organization_id_idx" ON "contact_relations"("organization_id");
CREATE INDEX "contact_relations_contact_b_id_idx" ON "contact_relations"("contact_b_id");

ALTER TABLE "contact_relations" ADD CONSTRAINT "contact_relations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contact_relations" ADD CONSTRAINT "contact_relations_contact_a_id_fkey" FOREIGN KEY ("contact_a_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contact_relations" ADD CONSTRAINT "contact_relations_contact_b_id_fkey" FOREIGN KEY ("contact_b_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
