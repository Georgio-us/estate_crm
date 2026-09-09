import { InvitationRegistration } from "@/components/auth/InvitationRegistration";

export default async function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <InvitationRegistration token={token} />;
}
