import { useState, useCallback } from "react";
import { useSearchCandidates, getSearchCandidatesQueryKey } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, User } from "lucide-react";
import { format } from "date-fns";

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  const [timer, setTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  const set = useCallback(
    (newValue: T) => {
      if (timer) clearTimeout(timer);
      const t = setTimeout(() => setDebouncedValue(newValue), delay);
      setTimer(t);
    },
    [delay, timer]
  );

  return debouncedValue;
}

const STAGE_LABEL: Record<string, string> = {
  new_lead: "New Lead", contacted: "Contacted", interested: "Interested",
  submitted: "Submitted", interview: "Interview", offer: "Offer",
  placed: "Placed", rejected: "Rejected",
};

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading } = useSearchCandidates(
    { q: debouncedQuery, page, limit: 25 },
    { query: { enabled: debouncedQuery.length >= 2, queryKey: getSearchCandidatesQueryKey({ q: debouncedQuery, page, limit: 25 }) } }
  );

  function handleChange(val: string) {
    setQuery(val);
    clearTimeout((window as any).__searchTimer);
    (window as any).__searchTimer = setTimeout(() => {
      setDebouncedQuery(val);
      setPage(1);
    }, 300);
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Search</h1>
        <p className="text-muted-foreground">Search across all candidates by name, phone, email, specialty, or notes.</p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          autoFocus
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="Search candidates..."
          className="pl-10 h-11 text-base"
        />
      </div>

      {debouncedQuery.length < 2 && (
        <div className="text-center text-muted-foreground py-20 text-sm">
          Type at least 2 characters to search
        </div>
      )}

      {debouncedQuery.length >= 2 && isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      )}

      {data && data.data.length === 0 && (
        <div className="text-center text-muted-foreground py-20 text-sm">
          No candidates found for "{debouncedQuery}"
        </div>
      )}

      {data && data.data.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">{data.total} result{data.total !== 1 ? "s" : ""}</p>
          <div className="divide-y border rounded-lg overflow-hidden">
            {data.data.map((c) => (
              <Link key={c.id} href={`/candidates/${c.id}`}>
                <div className="flex items-center gap-4 px-4 py-3 bg-card hover:bg-accent/50 transition-colors cursor-pointer">
                  <div className="size-9 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <User className="size-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{c.fullName}</span>
                      {c.specialty && (
                        <Badge variant="secondary" className="text-xs shrink-0">{c.specialty}</Badge>
                      )}
                      {c.pipelineStage && (
                        <Badge variant="outline" className="text-xs shrink-0">
                          {STAGE_LABEL[c.pipelineStage] ?? c.pipelineStage}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {[c.email, c.phone, c.city && c.state ? `${c.city}, ${c.state}` : (c.state || c.city)].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {format(new Date(c.createdAt), "MMM d, yyyy")}
                  </span>
                </div>
              </Link>
            ))}
          </div>
          {(data.totalPages ?? 1) > 1 && (
            <div className="flex justify-center gap-2 pt-2">
              <button
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
                className="px-3 py-1 text-sm border rounded disabled:opacity-40 hover:bg-accent"
              >
                Previous
              </button>
              <span className="px-3 py-1 text-sm">{page} / {data.totalPages ?? 1}</span>
              <button
                disabled={page === (data.totalPages ?? 1)}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1 text-sm border rounded disabled:opacity-40 hover:bg-accent"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
