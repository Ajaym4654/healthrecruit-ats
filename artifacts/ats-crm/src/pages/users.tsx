import { useState } from "react";
import { useGetMe } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash, KeyRound, Users } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface UserRecord {
  id: number;
  username: string;
  role: string;
  createdAt: string;
}

function authFetch(path: string, opts?: RequestInit) {
  const token = localStorage.getItem("ats_token");
  return fetch(`https://healthrecruit-api.onrender.com/api${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(opts?.headers ?? {}),
    },
  });
}

export default function UsersPage() {
  const { data: me } = useGetMe();
  const queryClient = useQueryClient();

  const [showCreate, setShowCreate] = useState(false);
  const [showReset, setShowReset] = useState<UserRecord | null>(null);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState("recruiter");
  const [resetPassword, setResetPassword] = useState("");

  const { data: users = [], isLoading } = useQuery<UserRecord[]>({
    queryKey: ["users"],
    queryFn: async () => {
      const res = await authFetch("/users");
      if (!res.ok) throw new Error("Failed to load users");
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await authFetch("/users", {
        method: "POST",
        body: JSON.stringify({ username: newUsername, password: newPassword, role: newRole }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create user");
      return data;
    },
    onSuccess: () => {
      toast.success("Account created successfully");
      setShowCreate(false);
      setNewUsername("");
      setNewPassword("");
      setNewRole("recruiter");
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await authFetch(`/users/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to delete user");
    },
    onSuccess: () => {
      toast.success("User deleted");
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resetMutation = useMutation({
    mutationFn: async ({ id, password }: { id: number; password: string }) => {
      const res = await authFetch(`/users/${id}/password`, {
        method: "PATCH",
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to reset password");
    },
    onSuccess: () => {
      toast.success("Password reset successfully");
      setShowReset(null);
      setResetPassword("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (me?.role !== "admin") {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Access restricted to administrators.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">User Management</h1>
          <p className="text-muted-foreground">Create and manage recruiter accounts.</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="size-4 mr-2" />
          Add User
        </Button>
      </div>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Username</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="w-32 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                  Loading users…
                </TableCell>
              </TableRow>
            ) : users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                  No users found.
                </TableCell>
              </TableRow>
            ) : (
              users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Users className="size-4 text-muted-foreground" />
                      <span className="font-medium">{u.username}</span>
                      {u.id === me?.id && (
                        <Badge variant="outline" className="text-xs">You</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={u.role === "admin" ? "default" : "secondary"} className="capitalize">
                      {u.role}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {format(new Date(u.createdAt), "MMM d, yyyy")}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {u.id !== me?.id && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Reset password"
                            onClick={() => { setShowReset(u); setResetPassword(""); }}
                          >
                            <KeyRound className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Delete user"
                            className="text-destructive hover:text-destructive"
                            onClick={() => {
                              if (confirm(`Delete user "${u.username}"? This cannot be undone.`)) {
                                deleteMutation.mutate(u.id);
                              }
                            }}
                          >
                            <Trash className="size-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Create User Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Account</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Username</Label>
              <Input
                placeholder="e.g. john_recruiter"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Password</Label>
              <Input
                type="password"
                placeholder="Min. 6 characters"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={newRole} onValueChange={setNewRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="recruiter">Recruiter — can view &amp; edit candidates</SelectItem>
                  <SelectItem value="admin">Admin — full access including import/export</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending || !newUsername || !newPassword}
            >
              {createMutation.isPending ? "Creating…" : "Create Account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog open={!!showReset} onOpenChange={(open) => { if (!open) setShowReset(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Password — {showReset?.username}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>New Password</Label>
              <Input
                type="password"
                placeholder="Min. 6 characters"
                value={resetPassword}
                onChange={(e) => setResetPassword(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReset(null)}>Cancel</Button>
            <Button
              onClick={() => showReset && resetMutation.mutate({ id: showReset.id, password: resetPassword })}
              disabled={resetMutation.isPending || resetPassword.length < 6}
            >
              {resetMutation.isPending ? "Saving…" : "Reset Password"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
