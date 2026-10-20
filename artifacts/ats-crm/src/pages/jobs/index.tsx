import { useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  getListJobsQueryKey,
  getListJobSubmissionsQueryKey,
  getListCandidatesQueryKey,
  useDeleteJob,
  useGetMe,
  useImportJobs,
  useListCandidates,
  useListJobs,
  useListJobSubmissions,
  useSubmitCandidateToJob,
  useUpdateJob,
} from "@workspace/api-client-react";
import type { Job, JobUpdate } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Activity, BriefcaseBusiness, Building2, Check, ChevronDown, ChevronRight,
  ClipboardList, FileUp, MapPin, Pencil, Search, SlidersHorizontal, UserRound, Users, X,
} from "lucide-react";

const CLIENTS = ["Westways", "Adaptive", "Others"] as const;
type ClientChoice = typeof CLIENTS[number];

const blankJob: JobUpdate = {
  jobCode: "", title: "", clientName: "Westways", location: "", specialty: "",
  licenseType: "", openings: 1, description: "", status: "open",
};

function parseCsv(text: string): Record<string, unknown>[] {
  const records: string[][] = [];
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const delimiters = [",", "\t", ";", "|"];
  const delimiter = delimiters.reduce(
    (best, current) =>
      firstLine.split(current).length > firstLine.split(best).length ? current : best,
    ",",
  );
  let row: string[] = [], cell = "", quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"' && quoted && text[i + 1] === '"') {
      cell += '"'; i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(cell.trim()); cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      row.push(cell.trim()); cell = "";
      if (row.some((value) => value.length)) records.push(row);
      row = [];
    } else {
      cell += char;
    }
  }

  row.push(cell.trim());
  if (row.some((value) => value.length)) records.push(row);
  if (records.length < 2) return [];

  const aliases: Record<string, string> = {
    code: "jobCode", jobcode: "jobCode", jobid: "jobCode",
    reqid: "jobCode", requisitionid: "jobCode", contract: "jobCode",
    contractnumber: "jobCode", reference: "jobCode",
    title: "title", jobtitle: "title", position: "title",
    role: "title", job: "title", requisitiontitle: "title",
    reqtitle: "title",
    client: "clientName", clientname: "clientName", account: "clientName",
    customer: "clientName", facility: "clientName",
    location: "location", worklocation: "location",
    citystate: "location", address: "location",
    specialty: "specialty", speciality: "specialty",
    department: "specialty", unit: "specialty",
    licensetype: "licenseType", license: "licenseType",
    credential: "licenseType", positiontype: "licenseType", type: "licenseType",
    openings: "openings", positions: "openings",
    numberofopenings: "openings", headcount: "openings",
    description: "description", jobdescription: "description",
    details: "description", notes: "description",
    status: "status", jobstatus: "status", reqstatus: "status",
    jobopeningstatus: "status",
  };

  const headers = records[0].map((header) => {
    const normalized = header.replace(/^\uFEFF/, "").toLowerCase().replace(/[^a-z0-9]/g, "");
    return aliases[normalized] ?? normalized;
  });

  return records.slice(1).map((values) => Object.fromEntries(
    headers.map((header, index) => [
      header,
      header === "openings" && values[index] ? Number(values[index]) : values[index] ?? "",
    ]),
  ));
}
function Field({ label, value, onChange, testId, type = "text", required = false }: {
  label: string; value: string | number; onChange: (value: string) => void;
  testId: string; type?: string; required?: boolean;
}) {
  return <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
    {label}
    <Input data-testid={testId} type={type} required={required} value={value} onChange={(event) => onChange(event.target.value)}
      className="h-10 bg-background text-sm font-normal text-foreground" />
  </label>;
}

export default function JobsPage() {
  const queryClient = useQueryClient();
  const { data: user, isLoading: userLoading } = useGetMe();
  const { data: jobData, isLoading, isError, refetch } = useListJobs();
  const jobs = (Array.isArray(jobData) ? jobData : []) as Job[];
  const isAdmin = user?.role === "admin";

  const [client, setClient] = useState<ClientChoice>("Westways");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "closed">("open");
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
  const [candidateSearch, setCandidateSearch] = useState("");
  const [editing, setEditing] = useState<Job | null>(null);
  const [draft, setDraft] = useState<JobUpdate>(blankJob);
  const [showImport, setShowImport] = useState(false);
  const [importName, setImportName] = useState("");
  const [importRows, setImportRows] = useState<Record<string, unknown>[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  const selectedJob = jobs.find((job) => job.id === selectedJobId) ?? null;
  const { data: submissions, isLoading: submissionsLoading, isError: submissionsError, refetch: refetchSubmissions } =
    useListJobSubmissions(selectedJobId ?? 0, { query: { enabled: selectedJobId !== null, queryKey: getListJobSubmissionsQueryKey(selectedJobId ?? 0) } });
  const { data: candidateResponse, isLoading: candidatesLoading } = useListCandidates(
    { page: 1, limit: 100, search: candidateSearch || undefined },
    { query: { enabled: selectedJobId !== null, queryKey: getListCandidatesQueryKey({ page: 1, limit: 100, search: candidateSearch || undefined }) } },
  );
  const candidates = candidateResponse?.data ?? [];
  const submittedIds = useMemo(() => new Set((submissions ?? []).map((item) => item.candidateId)), [submissions]);
  const filteredJobs = useMemo(() => jobs.filter((job) => {
    const source = (job.source || (["westways", "adaptive"].includes(job.clientName.trim().toLowerCase())
      ? job.clientName : "Others")).trim().toLowerCase();
    const matchesClient = source === client.toLowerCase();
    const needle = search.trim().toLowerCase();
    const matchesSearch = !needle || [job.title, job.jobCode, job.location, job.specialty, job.licenseType]
      .some((value) => value?.toLowerCase().includes(needle));
    return matchesClient && matchesSearch && (statusFilter === "all" || job.status === statusFilter);
  }), [jobs, client, search, statusFilter]);

  const updateJob = useUpdateJob();
  const deleteJob = useDeleteJob();
  const importJobs = useImportJobs();
  const submitCandidate = useSubmitCandidateToJob();

  const invalidateJobs = () => queryClient.invalidateQueries({ queryKey: getListJobsQueryKey() });
  const openEdit = (job: Job) => {
    setEditing(job);
    setDraft({
      jobCode: job.jobCode ?? "", title: job.title, clientName: job.clientName,
      location: job.location ?? "", specialty: job.specialty ?? "", licenseType: job.licenseType ?? "",
      openings: job.openings, description: job.description ?? "", status: job.status,
    });
  };
  const saveJob = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editing) return;
    updateJob.mutate({ id: editing.id, data: { ...draft, openings: Number(draft.openings) } }, {
      onSuccess: async () => { await invalidateJobs(); toast.success("Job updated"); setEditing(null); },
      onError: (error) => toast.error("Could not update job", { description: error.message }),
    });
  };
  const removeJob = (job: Job) => {
    if (!window.confirm(`Remove “${job.title}”? Its submission history will also be removed.`)) return;
    deleteJob.mutate({ id: job.id }, {
      onSuccess: async () => {
        await Promise.all([invalidateJobs(), queryClient.invalidateQueries({ queryKey: getListJobSubmissionsQueryKey(job.id) })]);
        if (selectedJobId === job.id) setSelectedJobId(null);
        toast.success("Job and submission history removed");
      },
      onError: (error) => toast.error("Could not remove job", { description: error.message }),
    });
  };
  const onSelectFile = async (file?: File) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) { toast.error("Choose a CSV file"); return; }
    const parsed = parseCsv(await file.text());
    if (!parsed.length) { toast.error("No job rows found in that CSV"); return; }
    setImportName(file.name);
    setImportRows(parsed);
  };
  const runImport = () => {
    if (!importRows.length) return;
    importJobs.mutate({ data: { filename: importName, rows: importRows.map((row) => ({ ...row, source: client })) } }, {
      onSuccess: async (result) => {
        await invalidateJobs();
        toast.success(`${result.imported} jobs imported`, { description: `${result.skipped} skipped${result.errors?.length ? ` · ${result.errors.length} issues` : ""}` });
        setShowImport(false); setImportRows([]); setImportName("");
      },
      onError: (error) => toast.error("Import failed", { description: error.message }),
    });
  };
  const submitToJob = (candidateId: number) => {
    if (!selectedJobId) return;
    submitCandidate.mutate({ id: selectedJobId, data: { candidateId } }, {
      onSuccess: async () => {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: getListJobSubmissionsQueryKey(selectedJobId) }),
          invalidateJobs(),
        ]);
        toast.success("Candidate submitted");
      },
      onError: (error) => toast.error("Could not submit candidate", { description: error.message }),
    });
  };

  const activeOpenings = jobs.filter((job) => job.status === "open").reduce((sum, job) => sum + job.openings, 0);

  return <main className="mx-auto max-w-[1480px] space-y-6 pb-10" data-testid="page-jobs">
    <header className="jobs-enter flex flex-col gap-4 border-b border-border/80 pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.18em] text-primary">
          <span className="h-px w-7 bg-primary" /> Talent operations
        </div>
        <h1 className="font-display text-[2.15rem] font-bold leading-tight tracking-[-.045em] text-foreground">Jobs</h1>
        <p className="mt-1 text-sm text-muted-foreground">Match the right clinician to the right opening.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {isAdmin && <Button variant="outline" className="h-10 gap-2 border-border bg-card" onClick={() => setShowImport(true)} data-testid="button-import-jobs">
          <FileUp className="size-4" /> Import CSV
        </Button>}
        <div className="flex h-10 items-center gap-2 rounded-md border border-border bg-card px-3 text-sm">
          <span className="relative flex size-2"><span className="absolute inline-flex size-full animate-ping rounded-full bg-primary/40" /><span className="relative inline-flex size-2 rounded-full bg-primary" /></span>
          <span className="font-data text-xs font-medium">{activeOpenings}</span><span className="text-muted-foreground">openings</span>
        </div>
      </div>
    </header>

    <section className="jobs-enter-2 grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Job overview">
      {[
        { label: "Open roles", value: jobs.filter((job) => job.status === "open").length, icon: BriefcaseBusiness, tone: "text-primary bg-primary/10" },
        { label: "Active openings", value: activeOpenings, icon: Users, tone: "text-[#b36b41] bg-[#b36b41]/10" },
        { label: "Westways", value: jobs.filter((job) => (job.source || job.clientName) === "Westways").length, icon: Building2, tone: "text-[#567b9b] bg-[#567b9b]/10" },
        { label: "Adaptive", value: jobs.filter((job) => (job.source || job.clientName) === "Adaptive").length, icon: Activity, tone: "text-[#907b3a] bg-[#907b3a]/10" },
      ].map(({ label, value, icon: Icon, tone }) => <Card key={label} className="flex items-center gap-3 border-card-border bg-card px-4 py-3.5 shadow-[0_1px_2px_hsl(30_20%_20%/.04)]" data-testid={`metric-${label.toLowerCase().replace(" ", "-")}`}>
        <div className={`grid size-9 place-items-center rounded-md ${tone}`}><Icon className="size-4" /></div>
        <div><div className="font-data text-xl font-semibold leading-none">{value}</div><div className="mt-1 text-[11px] font-medium text-muted-foreground">{label}</div></div>
      </Card>)}
    </section>

    <section className="jobs-enter-3 grid min-h-[560px] grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.08fr)_minmax(360px,.92fr)]">
      <Card className="overflow-hidden border-card-border bg-card shadow-[0_2px_8px_hsl(30_20%_20%/.035)]">
        <div className="border-b border-border/80 px-4 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-1" role="tablist" aria-label="Client">
              {CLIENTS.map((name) => <button key={name} role="tab" aria-selected={client === name} data-testid={`tab-client-${name.toLowerCase()}`}
                onClick={() => { setClient(name); setSelectedJobId(null); }}
                className={`relative px-3 pb-3 text-sm font-semibold transition-colors ${client === name ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}>
                {name}{client === name && <span className="absolute inset-x-2 bottom-0 h-[2px] rounded-full bg-primary" />}
              </button>)}
            </div>
            <span className="font-data text-[11px] text-muted-foreground" data-testid="text-results-count">{filteredJobs.length} roles</span>
          </div>
          <div className="flex flex-col gap-2 pb-3 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground/70" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search title, specialty, location…" className="h-9 border-border/80 bg-background pl-9 text-sm" data-testid="input-job-search" />
            </div>
            <div className="flex items-center gap-1 rounded-md border border-border/80 bg-background p-1" aria-label="Status filter">
              <SlidersHorizontal className="mx-1 size-3.5 text-muted-foreground" />
              {(["open", "all", "closed"] as const).map((value) => <button key={value} onClick={() => setStatusFilter(value)} data-testid={`filter-jobs-${value}`}
                className={`rounded px-2 py-1 text-[11px] font-semibold capitalize transition-colors ${statusFilter === value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>{value}</button>)}
            </div>
          </div>
        </div>

        <div className="max-h-[690px] overflow-auto">
          {isLoading || userLoading ? <div className="space-y-3 p-4" data-testid="jobs-loading">
            {[0, 1, 2, 3].map((item) => <div key={item} className="animate-pulse rounded-md border border-border/70 p-4">
              <div className="h-3 w-24 rounded bg-muted" /><div className="mt-3 h-5 w-2/3 rounded bg-muted" /><div className="mt-4 h-3 w-1/2 rounded bg-muted" />
            </div>)}
          </div> : isError ? <div className="m-5 rounded-lg border border-destructive/20 bg-destructive/5 px-5 py-8 text-center" data-testid="jobs-error">
            <p className="font-semibold">Jobs couldn’t be loaded</p><p className="mt-1 text-sm text-muted-foreground">Your roles are safe. Try reconnecting.</p>
            <Button variant="outline" className="mt-4" onClick={() => refetch()} data-testid="button-retry-jobs">Retry</Button>
          </div> : filteredJobs.length === 0 ? <div className="m-5 rounded-lg border border-dashed border-border bg-background/70 px-5 py-12 text-center" data-testid="jobs-empty">
            <div className="mx-auto grid size-11 place-items-center rounded-full bg-secondary text-primary"><ClipboardList className="size-5" /></div>
            <h2 className="mt-3 font-display text-lg font-bold">{search ? "No matching roles" : `No ${client} jobs yet`}</h2>
            <p className="mx-auto mt-1 max-w-xs text-sm text-muted-foreground">{search ? "Try a different title, specialty, or location." : isAdmin ? "Import a client job list to get started." : "New openings will appear here when they’re ready."}</p>
            {search && <Button variant="ghost" className="mt-3" onClick={() => setSearch("")} data-testid="button-clear-job-search">Clear search</Button>}
          </div> : <div className="divide-y divide-border/70" data-testid="jobs-list">
            {filteredJobs.map((job) => {
              const active = selectedJobId === job.id;
              return <article key={job.id} data-testid={`job-row-${job.id}`} className={`group relative px-4 py-4 transition-colors ${active ? "bg-primary/[.055]" : "hover:bg-background/75"}`}>
                {active && <span className="absolute inset-y-0 left-0 w-[3px] bg-primary" />}
                <div className="flex items-start justify-between gap-3">
                  <button onClick={() => setSelectedJobId(active ? null : job.id)} className="min-w-0 flex-1 text-left" data-testid={`button-open-job-${job.id}`}>
                    <div className="mb-1.5 flex flex-wrap items-center gap-2">
                      <span className="font-data text-[10px] font-medium tracking-wide text-muted-foreground">{job.jobCode || `ROLE-${job.id}`}</span>
                      <Badge className={`h-[19px] rounded px-1.5 text-[10px] font-semibold uppercase tracking-wide ${job.status === "open" ? "border border-primary/15 bg-primary/10 text-primary" : "border border-border bg-muted text-muted-foreground"}`} variant="outline">{job.status}</Badge>
                    </div>
                    <h3 className="truncate font-display text-[17px] font-bold tracking-[-.025em] text-foreground group-hover:text-primary">{job.title}</h3>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1"><Building2 className="size-3" />{job.clientName}</span>
                      {job.location && <span className="inline-flex items-center gap-1"><MapPin className="size-3" />{job.location}</span>}
                      {job.specialty && <span>{job.specialty}</span>}
                    </div>
                  </button>
                  <div className="flex shrink-0 items-center gap-2">
                    <div className="text-right"><div className="font-data text-lg font-semibold leading-none">{job.openings}</div><div className="mt-1 text-[10px] text-muted-foreground">openings</div></div>
                    {isAdmin && <div className="ml-1 hidden gap-1 group-hover:flex sm:flex">
                      <button onClick={() => openEdit(job)} title="Edit job" className="rounded p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground" data-testid={`button-edit-job-${job.id}`}><span className="sr-only">Edit job</span><Pencil className="size-3.5" /></button>
                      <button onClick={() => removeJob(job)} title="Remove job" disabled={deleteJob.isPending} className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" data-testid={`button-remove-job-${job.id}`}><span className="sr-only">Remove job</span><X className="size-3.5" /></button>
                    </div>}
                    <button onClick={() => setSelectedJobId(active ? null : job.id)} aria-label={active ? "Collapse job" : "View job"} className="rounded p-1 text-muted-foreground hover:text-foreground" data-testid={`button-toggle-job-${job.id}`}>{active ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}</button>
                  </div>
                </div>
              </article>;
            })}
          </div>}
        </div>
      </Card>

      <Card className="overflow-hidden border-card-border bg-card shadow-[0_2px_8px_hsl(30_20%_20%/.035)]">
        {!selectedJob ? <div className="grid min-h-[440px] place-items-center px-8 py-12 text-center" data-testid="job-detail-prompt">
          <div className="max-w-xs">
            <div className="mx-auto grid size-12 place-items-center rounded-full bg-accent text-accent-foreground"><BriefcaseBusiness className="size-5" /></div>
            <h2 className="mt-4 font-display text-xl font-bold">Select a role</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">Role details, submission history, and candidate matching will show here.</p>
            <div className="mx-auto mt-5 flex w-fit items-center gap-2 rounded-md border border-border/80 bg-background px-3 py-2 text-xs text-muted-foreground"><ChevronRight className="size-3.5" /> Choose a job from the list</div>
          </div>
        </div> : <div className="flex h-full min-h-[560px] flex-col" data-testid={`job-detail-${selectedJob.id}`}>
          <div className="border-b border-border/80 bg-[linear-gradient(110deg,hsl(var(--primary)/.075),transparent_70%)] px-5 py-5">
            <div className="flex items-center justify-between gap-2">
              <span className="font-data text-[10px] font-semibold tracking-[.14em] text-primary">{selectedJob.jobCode || `ROLE-${selectedJob.id}`}</span>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={`capitalize ${selectedJob.status === "open" ? "border-primary/20 bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>{selectedJob.status}</Badge>
                <button onClick={() => setSelectedJobId(null)} className="rounded p-1 text-muted-foreground hover:bg-secondary" aria-label="Close job detail" data-testid="button-close-job-detail"><X className="size-4" /></button>
              </div>
            </div>
            <h2 className="mt-2 font-display text-2xl font-bold leading-tight tracking-[-.04em]">{selectedJob.title}</h2>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><Building2 className="size-3.5" />{selectedJob.clientName}</span>
              {selectedJob.location && <span className="inline-flex items-center gap-1.5"><MapPin className="size-3.5" />{selectedJob.location}</span>}
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {[["Openings", selectedJob.openings], ["Specialty", selectedJob.specialty || "—"], ["License", selectedJob.licenseType || "—"]].map(([label, value]) =>
                <div key={String(label)} className="rounded-md border border-border/70 bg-card/75 px-3 py-2"><div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div><div className="mt-1 truncate text-sm font-semibold">{value}</div></div>)}
            </div>
            {selectedJob.description && <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{selectedJob.description}</p>}
          </div>

          <div className="flex flex-1 flex-col">
            <div className="flex items-center justify-between border-b border-border/70 px-5 py-3">
              <div><h3 className="text-sm font-bold">Candidate submissions</h3><p className="mt-0.5 text-[11px] text-muted-foreground">{(submissions ?? []).length} submitted for this role</p></div>
              <span className="grid size-8 place-items-center rounded-md bg-secondary text-secondary-foreground"><Users className="size-4" /></span>
            </div>
            {selectedJob.status === "open" && <div className="border-b border-border/70 bg-background/60 px-4 py-3">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground/70" />
                <Input value={candidateSearch} onChange={(event) => setCandidateSearch(event.target.value)} placeholder="Find a candidate by name or contact…" className="h-9 bg-card pl-9 text-sm" data-testid="input-candidate-search" />
              </div>
              <div className="mt-2 max-h-[196px] space-y-1 overflow-auto">
                {candidatesLoading ? <div className="space-y-2 py-1" data-testid="candidates-loading">{[0, 1, 2].map((x) => <div key={x} className="h-12 animate-pulse rounded bg-muted" />)}</div>
                  : candidates.filter((candidate) => {
                    const query = candidateSearch.trim().toLowerCase();
                    return !query || [candidate.fullName, candidate.email, candidate.phone].some((value) => value?.toLowerCase().includes(query));
                  }).slice(0, 8).map((candidate) => {
                    const alreadySubmitted = submittedIds.has(candidate.id);
                    return <div key={candidate.id} data-testid={`candidate-match-${candidate.id}`} className="flex items-center justify-between gap-2 rounded-md border border-transparent px-2.5 py-2 hover:border-border/70 hover:bg-card">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#dbe7e1] text-[11px] font-bold text-primary">{candidate.fullName.split(/\s+/).map((part) => part[0]).slice(0, 2).join("")}</span>
                        <div className="min-w-0"><div className="truncate text-xs font-semibold">{candidate.fullName}</div><div className="truncate text-[10px] text-muted-foreground">{candidate.specialty || candidate.licenseType || candidate.email || "Candidate"}</div></div>
                      </div>
                      <Button size="sm" variant={alreadySubmitted ? "secondary" : "outline"} disabled={!isAdmin || alreadySubmitted || submitCandidate.isPending} onClick={() => submitToJob(candidate.id)}
                        className="h-7 shrink-0 gap-1 px-2.5 text-[10px]" data-testid={`button-submit-candidate-${candidate.id}`}>
                        {alreadySubmitted ? <><Check className="size-3" />Submitted</> : "Submit"}
                      </Button>
                    </div>;
                  })}
                {!candidatesLoading && candidates.length === 0 && <p className="py-3 text-center text-xs text-muted-foreground">No candidates available.</p>}
              </div>
            </div>}
            {selectedJob.status === "closed" && <div className="border-b border-border/70 bg-muted/40 px-5 py-3 text-xs text-muted-foreground">This role is closed. Candidate submissions are paused.</div>}
            <div className="flex-1 overflow-auto px-4 py-3">
              <div className="mb-2 flex items-center justify-between px-1 text-[10px] font-bold uppercase tracking-[.12em] text-muted-foreground"><span>Submission history</span><span>Submitted</span></div>
              {submissionsLoading ? <div className="space-y-2" data-testid="submissions-loading">{[0, 1].map((x) => <div key={x} className="h-14 animate-pulse rounded-md bg-muted" />)}</div>
                : submissionsError ? <div className="rounded-md border border-destructive/15 bg-destructive/5 p-4 text-center" data-testid="submissions-error"><p className="text-xs text-muted-foreground">Submission history unavailable.</p><Button variant="ghost" size="sm" onClick={() => refetchSubmissions()} data-testid="button-retry-submissions">Retry</Button></div>
                : (submissions ?? []).length === 0 ? <div className="rounded-md border border-dashed border-border bg-background/70 px-4 py-7 text-center" data-testid="submissions-empty">
                  <UserRound className="mx-auto size-5 text-muted-foreground/70" /><p className="mt-2 text-xs font-semibold">No one submitted yet</p><p className="mt-1 text-[11px] text-muted-foreground">Find a candidate above to make the first introduction.</p>
                </div> : <div className="space-y-1.5">
                  {(submissions ?? []).map((submission) => <div key={submission.id} className="flex items-center justify-between gap-3 rounded-md border border-border/70 bg-background/50 px-3 py-2.5" data-testid={`submission-row-${submission.id}`}>
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-secondary text-xs font-bold text-secondary-foreground">{submission.candidate.fullName.split(/\s+/).map((part) => part[0]).slice(0, 2).join("")}</span>
                      <div className="min-w-0"><div className="truncate text-xs font-semibold">{submission.candidate.fullName}</div><div className="truncate text-[10px] text-muted-foreground">{submission.candidate.pipelineStage || submission.candidate.currentStatus || "Submitted"}{submission.submittedByUsername ? ` · ${submission.submittedByUsername}` : ""}</div></div>
                    </div>
                    <time className="shrink-0 font-data text-[10px] text-muted-foreground">{new Date(submission.submittedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</time>
                  </div>)}
                </div>}
            </div>
          </div>
        </div>}
      </Card>
    </section>

    {editing && <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-foreground/35 p-4 backdrop-blur-[2px]" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditing(null); }}>
      <form onSubmit={saveJob} className="my-auto w-full max-w-[620px] rounded-xl border border-border bg-card shadow-[0_24px_80px_hsl(215_28%_19%/.25)]" role="dialog" aria-modal="true" aria-labelledby="edit-job-title" data-testid="form-edit-job">
        <div className="flex items-start justify-between border-b border-border/80 px-5 py-4">
          <div><p className="text-[10px] font-bold uppercase tracking-[.16em] text-primary">Role details</p><h2 id="edit-job-title" className="mt-1 font-display text-xl font-bold">Edit job</h2></div>
          <button type="button" onClick={() => setEditing(null)} className="rounded p-1.5 text-muted-foreground hover:bg-secondary" aria-label="Close edit form" data-testid="button-close-edit-job"><X className="size-4" /></button>
        </div>
        <div className="grid gap-3 p-5 sm:grid-cols-2">
          <Field label="Job title" required value={draft.title ?? ""} onChange={(value) => setDraft({ ...draft, title: value })} testId="input-edit-job-title" />
          <Field label="Job code" value={draft.jobCode ?? ""} onChange={(value) => setDraft({ ...draft, jobCode: value })} testId="input-edit-job-code" />
          <Field label="Client" value={draft.clientName ?? ""} onChange={(value) => setDraft({ ...draft, clientName: value })} testId="input-edit-job-client" />
          <Field label="Location" value={draft.location ?? ""} onChange={(value) => setDraft({ ...draft, location: value })} testId="input-edit-job-location" />
          <Field label="Specialty" value={draft.specialty ?? ""} onChange={(value) => setDraft({ ...draft, specialty: value })} testId="input-edit-job-specialty" />
          <Field label="License type" value={draft.licenseType ?? ""} onChange={(value) => setDraft({ ...draft, licenseType: value })} testId="input-edit-job-license" />
          <Field label="Openings" type="number" value={draft.openings ?? 1} onChange={(value) => setDraft({ ...draft, openings: Number(value) })} testId="input-edit-job-openings" />
          <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">Status<select value={draft.status ?? "open"} onChange={(event) => setDraft({ ...draft, status: event.target.value as JobUpdate["status"] })} className="h-10 rounded-md border border-input bg-background px-3 text-sm font-normal text-foreground" data-testid="select-edit-job-status"><option value="open">Open</option><option value="closed">Closed</option></select></label>
          <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground sm:col-span-2">Description<textarea value={draft.description ?? ""} onChange={(event) => setDraft({ ...draft, description: event.target.value })} rows={3} className="resize-y rounded-md border border-input bg-background px-3 py-2 text-sm font-normal text-foreground" data-testid="input-edit-job-description" /></label>
        </div>
        <div className="flex justify-end gap-2 border-t border-border/80 px-5 py-4">
          <Button type="button" variant="ghost" onClick={() => setEditing(null)} data-testid="button-cancel-edit-job">Cancel</Button>
          <Button type="submit" disabled={updateJob.isPending} data-testid="button-save-job">{updateJob.isPending ? "Saving…" : "Save changes"}</Button>
        </div>
      </form>
    </div>}

    {showImport && <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-foreground/35 p-4 backdrop-blur-[2px]" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowImport(false); }}>
      <section className="my-auto w-full max-w-[520px] rounded-xl border border-border bg-card shadow-[0_24px_80px_hsl(215_28%_19%/.25)]" role="dialog" aria-modal="true" aria-labelledby="import-title" data-testid="dialog-import-jobs">
        <div className="flex items-start justify-between border-b border-border/80 px-5 py-4">
          <div><p className="text-[10px] font-bold uppercase tracking-[.16em] text-primary">CSV only</p><h2 id="import-title" className="mt-1 font-display text-xl font-bold">Import jobs</h2><p className="mt-1 text-xs text-muted-foreground">Use your client’s existing job export.</p></div>
          <button onClick={() => setShowImport(false)} className="rounded p-1.5 text-muted-foreground hover:bg-secondary" aria-label="Close import dialog" data-testid="button-close-import"><X className="size-4" /></button>
        </div>
        <div className="p-5">
          <input ref={fileInput} type="file" accept=".csv,text/csv" className="sr-only" onChange={(event) => onSelectFile(event.target.files?.[0])} data-testid="input-job-csv" />
          <button onClick={() => fileInput.current?.click()} className="flex w-full flex-col items-center rounded-lg border border-dashed border-primary/35 bg-primary/[.035] px-5 py-8 text-center transition-colors hover:bg-primary/[.07]" data-testid="button-choose-job-csv">
            <span className="grid size-10 place-items-center rounded-full bg-primary/10 text-primary"><FileUp className="size-5" /></span>
            <span className="mt-3 text-sm font-semibold">{importName || "Choose a CSV file"}</span>
            <span className="mt-1 text-xs text-muted-foreground">{importRows.length ? `${importRows.length} rows ready to import` : "Select a .csv file from your computer"}</span>
          </button>
          <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">Headers are read from the first row. Job title and client name should be included; optional fields are matched from their header names.</p>
          {importRows.length > 0 && <div className="mt-3 flex items-center justify-between rounded-md border border-border bg-background px-3 py-2 text-xs" data-testid="text-import-preview"><span className="font-medium">{importName}</span><span className="font-data text-muted-foreground">{importRows.length} rows</span></div>}
        </div>
        <div className="flex justify-end gap-2 border-t border-border/80 px-5 py-4">
          <Button variant="ghost" onClick={() => setShowImport(false)} data-testid="button-cancel-import">Cancel</Button>
          <Button onClick={runImport} disabled={!importRows.length || importJobs.isPending} data-testid="button-confirm-import">{importJobs.isPending ? "Importing…" : "Import jobs"}</Button>
        </div>
      </section>
    </div>}
  </main>;
}
