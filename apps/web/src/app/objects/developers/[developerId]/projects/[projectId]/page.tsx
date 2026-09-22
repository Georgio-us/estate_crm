"use client";

import { useParams } from "next/navigation";
import { ProjectDetails } from "@/components/developments/DeveloperDetails";

export default function DevelopmentProjectPage() {
  const params = useParams<{ developerId: string; projectId: string }>();
  return <ProjectDetails developerId={params.developerId} projectId={params.projectId} />;
}
