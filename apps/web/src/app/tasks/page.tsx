import { Suspense } from "react";
import { TasksCenter } from "@/components/tasks/TasksCenter";

export default function TasksPage() {
  return <Suspense fallback={null}><TasksCenter /></Suspense>;
}
