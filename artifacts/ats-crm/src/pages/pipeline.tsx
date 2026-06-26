import { useState } from "react";
import {
  useGetPipelineBoard,
  getGetPipelineBoardQueryKey,
  useUpdateCandidateStage,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Link } from "wouter";

const STAGE_COLORS: Record<string, string> = {
  new_lead: "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100",
  contacted: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100",
  interested: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-100",
  submitted: "bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-100",
  interview: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100",
  offer: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-100",
  placed: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100",
  rejected: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100",
};

const HEADER_COLORS: Record<string, string> = {
  new_lead: "border-t-slate-400",
  contacted: "border-t-blue-400",
  interested: "border-t-cyan-400",
  submitted: "border-t-violet-400",
  interview: "border-t-amber-400",
  offer: "border-t-orange-400",
  placed: "border-t-green-400",
  rejected: "border-t-red-400",
};

export default function PipelinePage() {
  const queryClient = useQueryClient();
  const { data: columns, isLoading } = useGetPipelineBoard();
  const stageMutation = useUpdateCandidateStage();
  const [dragging, setDragging] = useState<{ id: number; fromStage: string } | null>(null);

  function handleDragStart(id: number, fromStage: string) {
    setDragging({ id, fromStage });
  }

  function handleDrop(toStage: string) {
    if (!dragging || dragging.fromStage === toStage) {
      setDragging(null);
      return;
    }
    stageMutation.mutate(
      { id: dragging.id, data: { stage: toStage } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetPipelineBoardQueryKey() });
          toast.success(`Moved to ${toStage.replace("_", " ")}`);
        },
        onError: () => toast.error("Failed to move candidate"),
      }
    );
    setDragging(null);
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">Pipeline</h1>
        <div className="flex gap-4 overflow-x-auto pb-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="w-64 shrink-0 space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Pipeline</h1>
        <p className="text-muted-foreground">Drag candidates between stages to update their status.</p>
      </div>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {(columns ?? []).filter((col) => col.stage !== "new_lead").map((col) => (
          <div
            key={col.stage}
            className="w-64 shrink-0"
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => handleDrop(col.stage)}
          >
            <div className={`rounded-lg border-t-2 bg-muted/40 ${HEADER_COLORS[col.stage]}`}>
              <div className="flex items-center justify-between px-3 py-2 border-b">
                <span className="text-sm font-semibold">{col.label}</span>
                <Badge variant="secondary" className="text-xs">{col.count}</Badge>
              </div>
              <div className="p-2 space-y-2 min-h-[200px]">
                {col.candidates.length === 0 && (
                  <div className="text-xs text-muted-foreground text-center py-6 border-2 border-dashed rounded-md">
                    Drop here
                  </div>
                )}
                {col.candidates.map((c) => (
                  <div
                    key={c.id}
                    draggable
                    onDragStart={() => handleDragStart(c.id, col.stage)}
                    className="bg-card border rounded-md p-2 cursor-grab active:cursor-grabbing hover:shadow-sm transition-shadow"
                  >
                    <Link href={`/candidates/${c.id}`}>
                      <p className="text-sm font-medium truncate hover:text-primary">{c.fullName}</p>
                    </Link>
                    <p className="text-xs text-muted-foreground truncate">{c.specialty || c.position || "—"}</p>
                    {c.state && (
                      <p className="text-xs text-muted-foreground">{c.city ? `${c.city}, ` : ""}{c.state}</p>
                    )}
                    {c.tags && c.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {c.tags.slice(0, 2).map((t) => (
                          <span
                            key={t.id}
                            className="text-xs px-1.5 py-0.5 rounded-full font-medium"
                            style={{ background: t.color ? `${t.color}20` : undefined, color: t.color ?? undefined }}
                          >
                            {t.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
