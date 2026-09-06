import { SubscriptionCenter } from "@/components/subscription/SubscriptionCenter";

export default async function SubscriptionPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  return <SubscriptionCenter initialTab={tab === "extensions" ? "extensions" : "overview"} />;
}
