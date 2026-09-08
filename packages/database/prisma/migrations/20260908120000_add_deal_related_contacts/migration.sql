CREATE TABLE "deal_related_contacts" (
    "deal_id" UUID NOT NULL,
    "contact_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deal_related_contacts_pkey" PRIMARY KEY ("deal_id", "contact_id")
);

CREATE INDEX "deal_related_contacts_contact_id_idx" ON "deal_related_contacts"("contact_id");

ALTER TABLE "deal_related_contacts"
ADD CONSTRAINT "deal_related_contacts_deal_id_fkey"
FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "deal_related_contacts"
ADD CONSTRAINT "deal_related_contacts_contact_id_fkey"
FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
