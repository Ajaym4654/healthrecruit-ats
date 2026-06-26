import { useState } from "react";
import { useListCandidates, getListCandidatesQueryKey, useBulkDeleteCandidates, useGetMe } from "@workspace/api-client-react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Search, Plus, Trash, FilterX, FileSpreadsheet, FileText } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import * as XLSX from "xlsx";

const POSITIONS = ["RN", "LPN", "CNA", "RT", "CRT", "NP", "PA", "PT", "OT", "SLP", "Rad Tech", "Other"];

const SPECIALTIES = [
  "LTC", "Med Surg", "ICU", "PACU", "ER", "OR", "L&D", "NICU", "OB",
  "Psych", "Rehab", "Tele", "Oncology", "Pediatrics", "Float Pool", "Other",
];

const STAGE_LABEL: Record<string, string> = {
  new_lead: "New Lead", contacted: "Contacted", interested: "Interested",
  submitted: "Submitted", interview: "Interview", offer: "Offer",
  placed: "Placed", rejected: "Rejected",
};

const EXPORT_COLUMNS = [
  { key: "fullName",      header: "Full Name" },
  { key: "email",         header: "Email" },
  { key: "phone",         header: "Phone" },
  { key: "licenseType",   header: "Position" },
  { key: "specialty",     header: "Specialty" },
  { key: "city",          header: "City" },
  { key: "state",         header: "State" },
  { key: "zipCode",       header: "Zip Code" },
  { key: "pipelineStage", header: "Pipeline Stage" },
  { key: "status",        header: "Status" },
  { key: "position",      header: "Job Title" },
  { key: "yearsExperience", header: "Years Experience" },
  { key: "currentEmployer", header: "Current Employer" },
  { key: "linkedinUrl",   header: "LinkedIn" },
  { key: "notes",         header: "Notes" },
  { key: "createdAt",     header: "Date Added" },
];

export default function CandidatesPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [specialty, setSpecialty] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [pipelineStage, setPipelineStage] = useState<string>("");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { data: me } = useGetMe();

  const { data, isLoading } = useListCandidates({
    page,
    limit: 20,
    search: search || undefined,
    specialty: specialty || undefined,
    status: status || undefined,
    pipelineStage: pipelineStage || undefined,
  });

  const deleteMutation = useBulkDeleteCandidates();

  const fetchAllCandidates = async () => {
    const token = localStorage.getItem("ats_token");
    const params = new URLSearchParams({ page: "1", limit: "10000" });
    if (search) params.set("search", search);
    if (specialty) params.set("specialty", specialty);
    if (status) params.set("status", status);
    if (pipelineStage) params.set("pipelineStage", pipelineStage);
    const res = await fetch(`/api/candidates?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error("Failed to fetch candidates");
    const json = await res.json();
    return (json.data ?? json) as Record<string, unknown>[];
  };

  const handleExportCSV = async () => {
    setIsExporting(true);
    try {
      const rows = await fetchAllCandidates();
      const headers = EXPORT_COLUMNS.map((c) => c.header);
      const lines = [
        headers.join(","),
        ...rows.map((row) =>
          EXPORT_COLUMNS.map(({ key }) => {
            const val = row[key] ?? "";
            const str = String(val).replace(/"/g, '""');
            return `"${str}"`;
          }).join(",")
        ),
      ];
      const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `candidates-${format(new Date(), "yyyy-MM-dd")}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${rows.length} candidates to CSV`);
    } catch (e) {
      toast.error("Export failed", { description: (e as Error).message });
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportExcel = async () => {
    setIsExporting(true);
    try {
      const rows = await fetchAllCandidates();
      const sheetData = [
        EXPORT_COLUMNS.map((c) => c.header),
        ...rows.map((row) =>
          EXPORT_COLUMNS.map(({ key }) => row[key] ?? "")
        ),
      ];
      const ws = XLSX.utils.aoa_to_sheet(sheetData);
      const colWidths = EXPORT_COLUMNS.map(({ header }) => ({ wch: Math.max(header.length + 2, 16) }));
      ws["!cols"] = colWidths;
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Candidates");
      XLSX.writeFile(wb, `candidates-${format(new Date(), "yyyy-MM-dd")}.xlsx`);
      toast.success(`Exported ${rows.length} candidates to Excel`);
    } catch (e) {
      toast.error("Export failed", { description: (e as Error).message });
    } finally {
      setIsExporting(false);
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked && data?.data) {
      setSelectedIds(data.data.map((c) => c.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectOne = (id: number, checked: boolean) => {
    if (checked) {
      setSelectedIds((prev) => [...prev, id]);
    } else {
      setSelectedIds((prev) => prev.filter((i) => i !== id));
    }
  };

  const handleDelete = () => {
    if (!selectedIds.length) return;
    if (!confirm(`Are you sure you want to delete ${selectedIds.length} candidates?`)) return;
    deleteMutation.mutate({ data: { ids: selectedIds } }, {
      onSuccess: () => {
        toast.success(`Deleted ${selectedIds.length} candidates`);
        setSelectedIds([]);
        queryClient.invalidateQueries({ queryKey: getListCandidatesQueryKey() });
      },
      onError: (err) => toast.error("Failed to delete candidates", { description: err.message }),
    });
  };

  const clearFilters = () => {
    setSearch("");
    setSpecialty("");
    setStatus("");
    setPipelineStage("");
    setPage(1);
  };

  const hasFilters = !!(search || specialty || status || pipelineStage);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Candidates</h1>
          <p className="text-muted-foreground">Manage and filter your healthcare professionals.</p>
        </div>
        <div className="flex gap-2">
          {selectedIds.length > 0 && (
            <Button variant="destructive" onClick={handleDelete} disabled={deleteMutation.isPending}>
              <Trash className="size-4 mr-2" />
              Delete ({selectedIds.length})
            </Button>
          )}
          {me?.role === "admin" && (
            <>
              <Button variant="outline" onClick={handleExportCSV} disabled={isExporting}>
                <FileText className="size-4 mr-2" />
                CSV
              </Button>
              <Button variant="outline" onClick={handleExportExcel} disabled={isExporting}>
                <FileSpreadsheet className="size-4 mr-2" />
                Excel
              </Button>
            </>
          )}
          <Button asChild>
            <Link href="/candidates/new">
              <Plus className="size-4 mr-2" />
              Add Candidate
            </Link>
          </Button>
        </div>
      </div>

      <Card className="p-4 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search name, email, phone..."
            className="pl-9"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <Select value={specialty} onValueChange={(v) => { setSpecialty(v); setPage(1); }}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All Positions" />
          </SelectTrigger>
          <SelectContent>
            {POSITIONS.map((p) => (
              <SelectItem key={p} value={p}>{p}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={pipelineStage} onValueChange={(v) => { setPipelineStage(v); setPage(1); }}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All Stages" />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(STAGE_LABEL).map(([val, label]) => (
              <SelectItem key={val} value={val}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
            <SelectItem value="placed">Placed</SelectItem>
            <SelectItem value="do_not_contact">Do Not Contact</SelectItem>
          </SelectContent>
        </Select>
        {hasFilters && (
          <Button variant="ghost" size="icon" onClick={clearFilters} title="Clear filters">
            <FilterX className="size-4" />
          </Button>
        )}
      </Card>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 text-center">
                <Checkbox
                  checked={!!(data?.data?.length && selectedIds.length === data.data.length)}
                  onCheckedChange={(c) => handleSelectAll(c as boolean)}
                />
              </TableHead>
              <TableHead>Candidate</TableHead>
              <TableHead>Position</TableHead>
              <TableHead>Specialty</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Stage</TableHead>
              <TableHead>Added</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">Loading candidates...</TableCell>
              </TableRow>
            ) : data?.data?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">No candidates found.</TableCell>
              </TableRow>
            ) : (
              data?.data?.map((candidate) => (
                <TableRow
                  key={candidate.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => setLocation(`/candidates/${candidate.id}`)}
                >
                  <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selectedIds.includes(candidate.id)}
                      onCheckedChange={(c) => handleSelectOne(candidate.id, c as boolean)}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="font-medium text-primary">{candidate.fullName}</div>
                    <div className="text-xs text-muted-foreground">{candidate.email || candidate.phone || "—"}</div>
                  </TableCell>
                  <TableCell>
                    {candidate.licenseType ? (
                      <Badge variant="outline">{candidate.licenseType}</Badge>
                    ) : candidate.specialty ? (
                      <Badge variant="outline">{candidate.specialty}</Badge>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {candidate.specialty && candidate.licenseType ? (
                      <span className="text-sm text-muted-foreground">{candidate.specialty}</span>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {candidate.city ? `${candidate.city}, ${candidate.state}` : (candidate.state || "—")}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="capitalize">
                      {STAGE_LABEL[candidate.pipelineStage ?? "new_lead"] ?? candidate.pipelineStage}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {format(new Date(candidate.createdAt), "MMM d, yyyy")}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        {data && (data.totalPages ?? 1) > 1 && (
          <div className="p-4 border-t flex justify-end gap-2">
            <Button variant="outline" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <span className="flex items-center px-2 text-sm text-muted-foreground">{page} / {data.totalPages ?? 1}</span>
            <Button variant="outline" disabled={page === (data.totalPages ?? 1)} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        )}
      </Card>
    </div>
  );
}
