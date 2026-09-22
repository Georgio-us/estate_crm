"use client";

import { useParams } from "next/navigation";
import { DeveloperDetails } from "@/components/developments/DeveloperDetails";

export default function DeveloperPage() {
  const params = useParams<{ developerId: string }>();
  return <DeveloperDetails developerId={params.developerId} />;
}
