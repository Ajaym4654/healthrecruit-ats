import { useGetDuplicateCandidates, getGetDuplicateCandidatesQueryKey, useHandleDuplicateAction } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, CheckCircle, GitMerge, Trash } from "lucide-react";
import { toast } from "sonner";
import { Link } from "wouter";

export default function DuplicatesPage() {
  const queryClient = useQueryClient();
  const { data: groups, isLoading } = useGetDuplicateCandidates();
  const actionMutation = useHandleDuplicateAction();

  function handleAction(sourceId: number, targetId: number, action: "ignore" | "merge") {
    actionMutation.mutate(
      { id: sourceId, data: { action, targetId } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetDuplicateCandidatesQueryKey() });
          toast.success(action === "ignore" ? "Marked as not a duplicate" : "Records merged");
        },
        onError: () => toast.error("Action failed"),
      }
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Duplicate Detection</h1>
        <p className="text-muted-foreground">Review and resolve duplicate candidate records.</p>
      </div>

      {isLoading && (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      )}

      {!isLoading && (!groups || groups.length === 0) && (
        <div className="text-center py-20 text-muted-foreground border-2 border-dashed rounded-lg">
          <CheckCircle className="size-10 mx-auto mb-3 text-green-500" />
          <p className="font-medium text-foreground">No duplicates found</p>
          <p className="text-sm mt-1">Your candidate database is clean.</p>
        </div>
      )}

      {groups && groups.length > 0 && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">{groups.length} duplicate group{groups.length !== 1 ? "s" : ""} found</p>
          {groups.map((group, gi) => (
            <Card key={gi} className="border-amber-200 dark:border-amber-800">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <AlertCircle className="size-4 text-amber-500" />
                  <CardTitle className="text-sm font-medium">
                    Duplicate by {group.duplicateType}: <span className="font-bold">{group.duplicateKey}</span>
                  </CardTitle>
                  <Badge variant="outline" className="ml-auto">{group.candidates.length} records</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {group.candidates.map((c, i) => (
                  <div key={c.id} className="flex items-center gap-3 p-3 border rounded-lg bg-muted/30">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Link href={`/candidates/${c.id}`}>
                          <span className="font-medium text-sm hover:text-primary cursor-pointer">{c.fullName}</span>
                        </Link>
                        {i === 0 && <Badge variant="secondary" className="text-xs">Primary</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {[c.email, c.phone, c.specialty, c.state].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    {i > 0 && (
                      <div className="flex gap-2 shrink-0">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleAction(c.id, group.candidates[0].id, "ignore")}
                        >
                          <CheckCircle className="size-3 mr-1" />
                          Ignore
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleAction(c.id, group.candidates[0].id, "merge")}
                        >
                          <GitMerge className="size-3 mr-1" />
                          Merge
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
