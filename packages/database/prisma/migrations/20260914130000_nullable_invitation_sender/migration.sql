ALTER TABLE "team_invitations" DROP CONSTRAINT "team_invitations_invited_by_id_fkey";
ALTER TABLE "team_invitations" ALTER COLUMN "invited_by_id" DROP NOT NULL;
ALTER TABLE "team_invitations" ADD CONSTRAINT "team_invitations_invited_by_id_fkey" FOREIGN KEY ("invited_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
