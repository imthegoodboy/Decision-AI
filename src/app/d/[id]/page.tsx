import { Suspense } from "react";
import { Workspace, WorkspaceSkeleton } from "@/components/workspace/workspace";

export default function DecisionPage() {
  return (
    <Suspense fallback={<WorkspaceSkeleton />}>
      <Workspace />
    </Suspense>
  );
}
