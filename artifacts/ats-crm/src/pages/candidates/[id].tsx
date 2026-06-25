import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import {
  useGetCandidate,
  getGetCandidateQueryKey,
  useUpdateCandidate,
  useDeleteCandidate,
  useListNotes,
  getListNotesQueryKey,
  useCreateNote,
  useDeleteNote,
  useListActivities,
  getListActivitiesQueryKey,
  useAddCandidateTag,
  useRemoveCandidateTag,
  useListTags,
  useUpdateCandidateStage,
  getListCandidatesQueryKey,
  useCreateActivity,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { format } from "date-fns";
import { 
  ArrowLeft, Phone, Mail, MapPin, Edit, Save, X, Trash2, 
  Plus, Clock, Tag, Activity, StickyNote
} from "lucide-react";
import { Link } from "wouter";

const PIPELINE_STAGES = [
  { value: "new_lead", label: "New Lead" },
  { value: "contacted", label: "Contacted" },
  { value: "interested", label: "Interested" },
  { value: "submitted", label: "Submitted" },
  { value: "interview", label: "Interview" },
  { value: "offer", label: "Offer" },
  { value: "placed", label: "Placed" },
  { value: "rejected", label: "Rejected" },
];

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "placed", label: "Placed" },
  { value: "do_not_contact", label: "Do Not Contact" },
];

export default function CandidateDetailPage() {
  const [, params] = useRoute("/candidates/:id");
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const id = parseInt(params?.id ?? "0", 10);

  const { data: candidate, isLoading } = useGetCandidate(id, {
    query: { enabled: !!id, queryKey: getGetCandidateQueryKey(id) },
  });
  const { data: notes } = useListNotes(id, {
    query: { enabled: !!id, queryKey: getListNotesQueryKey(id) },
  });
  const { data: activities } = useListActivities(id, {
    query: { enabled: !!id, queryKey: getListActivitiesQueryKey(id) },
  });
  const { data: allTags } = useListTags();

  const updateMutation = useUpdateCandidate();
  const deleteMutation = useDeleteCandidate();
  const stageMutation = useUpdateCandidateStage();
  const createNoteMutation = useCreateNote();
  const deleteNoteMutation = useDeleteNote();
  const addTagMutation = useAddCandidateTag();
  const removeTagMutation = useRemoveCandidateTag();
  const createActivityMutation = useCreateActivity();

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [newNote, setNewNote] = useState("");
  const [activityType, setActivityType] = useState("call");
  const [activityDesc, setActivityDesc] = useState("");

  function startEdit() {
    if (!candidate) return;
    setForm({
      fullName: candidate.fullName,
      phone: candidate.phone ?? "",
      email: candidate.email ?? "",
      city: candidate.city ?? "",
      state: candidate.state ?? "",
      zipCode: candidate.zipCode ?? "",
      position: candidate.position ?? "",
      specialty: candidate.specialty ?? "",
      experience: candidate.experience ?? "",
      licenseType: candidate.licenseType ?? "",
      licenseNumber: candidate.licenseNumber ?? "",
      preferredLocation: candidate.preferredLocation ?? "",
      availability: candidate.availability ?? "",
      currentStatus: candidate.currentStatus ?? "active",
      pipelineStage: candidate.pipelineStage ?? "new_lead",
      recruiterNotes: candidate.recruiterNotes ?? "",
      source: candidate.source ?? "",
    });
    setEditing(true);
  }

  function handleSave() {
    updateMutation.mutate(
      { id, data: form as any },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetCandidateQueryKey(id) });
          queryClient.invalidateQueries({ queryKey: getListCandidatesQueryKey() });
          setEditing(false);
          toast.success("Candidate updated");
        },
        onError: () => toast.error("Update failed"),
      }
    );
  }

  function handleDelete() {
    if (!confirm("Delete this candidate? This cannot be undone.")) return;
    deleteMutation.mutate({ id }, {
      onSuccess: () => {
        toast.success("Candidate deleted");
        setLocation("/candidates");
      },
    });
  }

  function handleStageChange(stage: string) {
    stageMutation.mutate({ id, data: { stage } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetCandidateQueryKey(id) });
        toast.success(`Stage updated to ${stage}`);
      },
    });
  }

  function handleAddNote() {
    if (!newNote.trim()) return;
    createNoteMutation.mutate({ id, data: { content: newNote } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListNotesQueryKey(id) });
        setNewNote("");
        toast.success("Note added");
      },
    });
  }

  function handleDeleteNote(noteId: number) {
    deleteNoteMutation.mutate({ id, noteId }, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListNotesQueryKey(id) }),
    });
  }

  function handleLogActivity() {
    if (!activityDesc.trim()) return;
    createActivityMutation.mutate(
      { id, data: { type: activityType, description: activityDesc } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListActivitiesQueryKey(id) });
          setActivityDesc("");
          toast.success("Activity logged");
        },
      }
    );
  }

  function handleAddTag(tagName: string) {
    addTagMutation.mutate({ id, data: { name: tagName } }, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetCandidateQueryKey(id) }),
    });
  }

  function handleRemoveTag(tagId: number) {
    removeTagMutation.mutate({ id, tagId }, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetCandidateQueryKey(id) }),
    });
  }

  if (isLoading) {
    return (
      <div className="space-y-4 max-w-5xl">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2 space-y-4">
            <Skeleton className="h-48" />
            <Skeleton className="h-32" />
          </div>
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (!candidate) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">Candidate not found.</p>
        <Link href="/candidates"><Button variant="outline" className="mt-4">Back to Candidates</Button></Link>
      </div>
    );
  }

  const candidateTags = candidate.tags ?? [];

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Link href="/candidates">
          <Button variant="ghost" size="sm" className="shrink-0 -ml-2">
            <ArrowLeft className="size-4 mr-1" /> Back
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold truncate">{candidate.fullName}</h1>
          <div className="flex flex-wrap items-center gap-2 mt-1">
            {candidate.licenseType && <Badge variant="outline">{candidate.licenseType}</Badge>}
            {candidate.specialty && <Badge variant="secondary">{candidate.specialty}</Badge>}
            {candidateTags.map((t) => (
              <Badge
                key={t.id}
                className="cursor-pointer text-xs"
                style={{ background: t.color ? `${t.color}20` : undefined, color: t.color ?? undefined, border: `1px solid ${t.color ?? 'transparent'}` }}
                onClick={() => handleRemoveTag(t.id)}
              >
                {t.name} <X className="size-2.5 ml-1 inline" />
              </Badge>
            ))}
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          {!editing ? (
            <>
              <Button variant="outline" size="sm" onClick={startEdit}><Edit className="size-4 mr-1" /> Edit</Button>
              <Button variant="destructive" size="sm" onClick={handleDelete}><Trash2 className="size-4" /></Button>
            </>
          ) : (
            <>
              <Button size="sm" onClick={handleSave} disabled={updateMutation.isPending}><Save className="size-4 mr-1" /> Save</Button>
              <Button variant="outline" size="sm" onClick={() => setEditing(false)}><X className="size-4" /></Button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: main info */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Contact Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {!editing ? (
                <div className="grid grid-cols-2 gap-4 text-sm">
                  {[
                    { icon: Phone, label: "Phone", val: candidate.phone },
                    { icon: Mail, label: "Email", val: candidate.email },
                    { icon: MapPin, label: "Location", val: [candidate.city, candidate.state, candidate.zipCode].filter(Boolean).join(", ") },
                    { label: "Position", val: candidate.licenseType },
                    { label: "Specialty", val: candidate.specialty },
                    { label: "Experience", val: candidate.experience },
                    { label: "License Number", val: candidate.licenseNumber },
                    { label: "Preferred Location", val: candidate.preferredLocation },
                    { label: "Availability", val: candidate.availability },
                    { label: "Source", val: candidate.source },
                  ].map(({ label, val, icon: Icon }) => (
                    <div key={label}>
                      <p className="text-xs text-muted-foreground">{label}</p>
                      <p className="font-medium">{val || "—"}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { key: "fullName", label: "Full Name" },
                    { key: "phone", label: "Phone" },
                    { key: "email", label: "Email" },
                    { key: "city", label: "City" },
                    { key: "state", label: "State" },
                    { key: "zipCode", label: "Zip Code" },
                    { key: "licenseType", label: "Position (e.g. RN, LPN, CNA)" },
                    { key: "specialty", label: "Specialty (e.g. LTC, Med Surg, ICU)" },
                    { key: "experience", label: "Experience" },
                    { key: "licenseNumber", label: "License Number" },
                    { key: "preferredLocation", label: "Preferred Location" },
                    { key: "availability", label: "Availability" },
                    { key: "source", label: "Source" },
                  ].map(({ key, label }) => (
                    <div key={key}>
                      <Label className="text-xs">{label}</Label>
                      <Input
                        value={form[key] ?? ""}
                        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                        className="h-8 text-sm mt-1"
                      />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Notes */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><StickyNote className="size-4" /> Notes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Textarea
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Add a recruiter note..."
                  className="min-h-[80px] text-sm resize-none"
                />
              </div>
              <Button size="sm" onClick={handleAddNote} disabled={!newNote.trim()}>
                <Plus className="size-3 mr-1" /> Add Note
              </Button>
              <Separator />
              <div className="space-y-2">
                {(!notes || notes.length === 0) && (
                  <p className="text-sm text-muted-foreground text-center py-4">No notes yet</p>
                )}
                {notes?.map((note) => (
                  <div key={note.id} className="flex gap-3 p-3 bg-muted/40 rounded-lg">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm">{note.content}</p>
                      <p className="text-xs text-muted-foreground mt-1">{format(new Date(note.createdAt), "MMM d, yyyy 'at' h:mm a")}</p>
                    </div>
                    <button onClick={() => handleDeleteNote(note.id)} className="text-muted-foreground hover:text-destructive shrink-0">
                      <Trash2 className="size-3" />
                    </button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Activity Log */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><Activity className="size-4" /> Activity</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Select value={activityType} onValueChange={setActivityType}>
                  <SelectTrigger className="w-32 h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["call", "email", "sms", "meeting", "note", "other"].map((t) => (
                      <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  value={activityDesc}
                  onChange={(e) => setActivityDesc(e.target.value)}
                  placeholder="Describe the activity..."
                  className="flex-1 h-8 text-sm"
                />
                <Button size="sm" onClick={handleLogActivity} disabled={!activityDesc.trim()}>Log</Button>
              </div>
              <div className="space-y-2">
                {(!activities || activities.length === 0) && (
                  <p className="text-sm text-muted-foreground text-center py-4">No activities yet</p>
                )}
                {activities?.map((a) => (
                  <div key={a.id} className="flex gap-3 text-sm">
                    <Clock className="size-3.5 text-muted-foreground mt-0.5 shrink-0" />
                    <div>
                      <span className="font-medium capitalize">{a.type}</span>: {a.description}
                      <p className="text-xs text-muted-foreground">{format(new Date(a.createdAt), "MMM d, yyyy 'at' h:mm a")}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right column: pipeline + tags */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Pipeline Stage</CardTitle>
            </CardHeader>
            <CardContent>
              <Select value={candidate.pipelineStage ?? "new_lead"} onValueChange={handleStageChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PIPELINE_STAGES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2"><Tag className="size-3.5" /> Tags</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex flex-wrap gap-1.5">
                {candidateTags.map((t) => (
                  <Badge key={t.id} variant="outline" className="cursor-pointer text-xs gap-1" onClick={() => handleRemoveTag(t.id)}>
                    {t.name} <X className="size-2.5" />
                  </Badge>
                ))}
                {candidateTags.length === 0 && <p className="text-xs text-muted-foreground">No tags</p>}
              </div>
              <div className="flex flex-wrap gap-1 pt-1">
                {allTags?.filter((t) => !candidateTags.find((ct) => ct.id === t.id)).map((t) => (
                  <Badge
                    key={t.id}
                    variant="secondary"
                    className="cursor-pointer text-xs"
                    onClick={() => handleAddTag(t.name)}
                  >
                    + {t.name}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {candidate.phone && (
                <a href={`tel:${candidate.phone}`}>
                  <Button variant="outline" size="sm" className="w-full justify-start">
                    <Phone className="size-3.5 mr-2" /> Call {candidate.phone}
                  </Button>
                </a>
              )}
              {candidate.email && (
                <a href={`mailto:${candidate.email}`}>
                  <Button variant="outline" size="sm" className="w-full justify-start">
                    <Mail className="size-3.5 mr-2" /> Email
                  </Button>
                </a>
              )}
              <div className="pt-2 text-xs text-muted-foreground space-y-1">
                <p>Added: {format(new Date(candidate.createdAt), "MMM d, yyyy")}</p>
                <p>Updated: {format(new Date(candidate.updatedAt), "MMM d, yyyy")}</p>
                {candidate.source && <p>Source: {candidate.source}</p>}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
