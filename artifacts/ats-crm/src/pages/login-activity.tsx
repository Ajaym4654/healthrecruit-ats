import { useMemo, useState } from "react";
import { useGetMe } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { Activity, CheckCircle2, XCircle, Users, Search, Monitor, MapPin, ShieldAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";

interface LoginEvent {
  id: number;
  userId: number | null;
  username: string;
  eventType: "success" | "failed" | string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

function authFetch(path: string) {
  const token = localStorage.getItem("ats_token");
  return fetch(`https://healthrecruit-api.onrender.com/api${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    cache: "no-store",
  });
}

function getDeviceDetails(userAgent: string | null) {
  const ua = userAgent || "";
  const browser = /Edg\//.test(ua) ? "Microsoft Edge"
    : /OPR\//.test(ua) ? "Opera"
    : /Chrome\//.test(ua) ? "Google Chrome"
    : /Firefox\//.test(ua) ? "Firefox"
    : /Safari\//.test(ua) ? "Safari" : "Unknown browser";
  const os = /Windows NT/.test(ua) ? "Windows"
    : /Mac OS X/.test(ua) ? "macOS"
    : /Android/.test(ua) ? "Android"
    : /iPhone|iPad|iPod/.test(ua) ? "iOS"
    : /Linux/.test(ua) ? "Linux" : "Unknown OS";
  const device = /Mobile|Android|iPhone|iPad/.test(ua) ? "Mobile / Tablet" : "Desktop";
  return { browser, os, device };
}

export default function LoginActivityPage() {
  const { data: me } = useGetMe();
  const [search, setSearch] = useState("");
  const { data, isLoading, isError, error } = useQuery<{ events: LoginEvent[]; limit: number }>({
    queryKey: ["superadmin-login-activity"],
    queryFn: async () => {
      const res = await authFetch("/login-activity?limit=1000");
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Could not load login activity");
      return payload;
    },
    enabled: me?.role === "superadmin",
    refetchInterval: 60_000,
  });

  const events = data?.events ?? [];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? events.filter((event) =>
      [event.username, event.ipAddress, event.eventType, event.userAgent]
        .some((value) => String(value || "").toLowerCase().includes(q))
    ) : events;
  }, [events, search]);

  const successful = events.filter((event) => event.eventType === "success").length;
  const failed = events.filter((event) => event.eventType === "failed").length;
  const users = new Set(events.filter((event) => event.eventType === "success").map((event) => event.username)).size;

  if (me?.role !== "superadmin") {
    return <div className="flex h-64 items-center justify-center text-muted-foreground">Access restricted to Super Admin.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Activity className="size-6" /> Login Activity</h1>
          <p className="text-muted-foreground">Audit trail of successful and failed sign-in attempts. Latest 1,000 events.</p>
        </div>
        <Badge variant="outline" className="w-fit"><ShieldAlert className="size-3 mr-1" /> Super Admin only</Badge>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Successful logins</CardTitle><CheckCircle2 className="size-4 text-emerald-600" /></CardHeader><CardContent><div className="text-2xl font-bold">{successful}</div><p className="text-xs text-muted-foreground">In the latest {events.length} recorded events</p></CardContent></Card>
        <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Failed attempts</CardTitle><XCircle className="size-4 text-destructive" /></CardHeader><CardContent><div className="text-2xl font-bold">{failed}</div><p className="text-xs text-muted-foreground">Invalid username or password</p></CardContent></Card>
        <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Users seen</CardTitle><Users className="size-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{users}</div><p className="text-xs text-muted-foreground">Unique usernames with successful logins</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader className="space-y-3">
          <div><CardTitle>Sign-in history</CardTitle><p className="text-sm text-muted-foreground mt-1">IP address and browser/device details are captured when the login request reaches the server.</p></div>
          <div className="relative"><Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" /><Input className="pl-9" placeholder="Search username, IP, browser or status…" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        </CardHeader>
        <CardContent>
          {isLoading ? <div className="py-12 text-center text-muted-foreground">Loading login activity…</div>
            : isError ? <div className="py-12 text-center text-destructive">{(error as Error).message}</div>
            : <Table>
              <TableHeader><TableRow><TableHead>Date &amp; time</TableHead><TableHead>User</TableHead><TableHead>Status</TableHead><TableHead>IP address</TableHead><TableHead>Device / Browser</TableHead></TableRow></TableHeader>
              <TableBody>
                {filtered.length === 0 ? <TableRow><TableCell colSpan={5} className="h-24 text-center text-muted-foreground">No login events found.</TableCell></TableRow>
                  : filtered.map((event) => {
                    const details = getDeviceDetails(event.userAgent);
                    return <TableRow key={event.id}>
                      <TableCell className="whitespace-nowrap text-sm">{format(new Date(event.createdAt), "MMM d, yyyy")}<div className="text-xs text-muted-foreground">{format(new Date(event.createdAt), "h:mm:ss a")}</div></TableCell>
                      <TableCell className="font-medium">{event.username}</TableCell>
                      <TableCell><Badge variant={event.eventType === "success" ? "default" : "destructive"}>{event.eventType === "success" ? "Successful" : "Failed"}</Badge></TableCell>
                      <TableCell className="font-mono text-xs">{event.ipAddress || "Unavailable"}</TableCell>
                      <TableCell><div className="flex items-center gap-1.5 text-sm"><Monitor className="size-3.5 text-muted-foreground" />{details.device} · {details.os}</div><div className="text-xs text-muted-foreground ml-5">{details.browser}</div></TableCell>
                    </TableRow>;
                  })}
              </TableBody>
            </Table>}
          <p className="mt-3 text-xs text-muted-foreground">IP-based city/country and a computer's local device name are not available from the browser alone. This log does not collect GPS or access personal files.</p>
        </CardContent>
      </Card>
    </div>
  );
}
