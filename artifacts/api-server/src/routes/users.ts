import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { db, usersTable, recruiterPermissions } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireAdmin } from "./auth";

const router: IRouter = Router();

const defaultPermissions = [
  "candidates.view",
  "candidates.create",
  "candidates.edit",
  "jobs.view",
  "jobs.submit",
  "documents.view",
  "documents.upload",
  "notes.manage",
];

async function getTarget(id: number) {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  return user;
}

function canManage(req: any, target: any): boolean {
  if (!target || target.isProtected || target.role === "superadmin") return false;
  if (req.user.role === "superadmin") return true;
  return req.user.role === "admin" && target.role === "recruiter";
}

router.get("/users", requireAuth, requireAdmin, async (req: any, res): Promise<void> => {
  const users = await db.select({
    id: usersTable.id,
    username: usersTable.username,
    role: usersTable.role,
    permissions: usersTable.permissions,
    isProtected: usersTable.isProtected,
    createdAt: usersTable.createdAt,
  }).from(usersTable).orderBy(usersTable.createdAt);

  res.json(req.user.role === "superadmin"
    ? users
    : users.filter((u) => u.role === "recruiter"));
});

router.post("/users", requireAuth, requireAdmin, async (req: any, res): Promise<void> => {
  const { username, password, role, permissions } = req.body;

  if (!username || !password || String(password).length < 8) {
    res.status(400).json({ error: "Username and password (minimum 8 characters) are required" });
    return;
  }

  const newRole = role || "recruiter";

  if (!["admin", "recruiter"].includes(newRole)) {
    res.status(400).json({ error: "Invalid role" });
    return;
  }

  if (req.user.role === "admin" && newRole !== "recruiter") {
    res.status(403).json({ error: "Admins can create Recruiter accounts only" });
    return;
  }

  const [existing] = await db.select().from(usersTable)
    .where(eq(usersTable.username, String(username).trim()));

  if (existing) {
    res.status(409).json({ error: "Username already exists" });
    return;
  }

  const allowed = Array.isArray(permissions)
    ? permissions.filter((p: string) => (recruiterPermissions as readonly string[]).includes(p))
    : defaultPermissions;

  const passwordHash = await bcrypt.hash(password, 12);

  const [user] = await db.insert(usersTable).values({
    username: String(username).trim(),
    passwordHash,
    role: newRole,
    permissions: allowed,
  }).returning({
    id: usersTable.id,
    username: usersTable.username,
    role: usersTable.role,
    permissions: usersTable.permissions,
    createdAt: usersTable.createdAt,
  });

  res.status(201).json(user);
});

router.patch("/users/:id", requireAuth, requireAdmin, async (req: any, res): Promise<void> => {
  const id = Number(req.params.id);
  const target = await getTarget(id);

  if (!target) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  if (!canManage(req, target)) {
    res.status(403).json({ error: "You cannot manage this account" });
    return;
  }

  const updates: any = {};

  if (req.body.role !== undefined) {
    if (!["admin", "recruiter"].includes(req.body.role)) {
      res.status(400).json({ error: "Invalid role" });
      return;
    }
    if (req.user.role === "admin" && req.body.role !== "recruiter") {
      res.status(403).json({ error: "Admins can assign Recruiter role only" });
      return;
    }
    updates.role = req.body.role;
  }

  if (req.body.permissions !== undefined) {
    if (!Array.isArray(req.body.permissions) ||
        req.body.permissions.some((p: string) => !(recruiterPermissions as readonly string[]).includes(p))) {
      res.status(400).json({ error: "Invalid permissions" });
      return;
    }
    updates.permissions = req.body.permissions;
  }

  if (!Object.keys(updates).length) {
    res.status(400).json({ error: "No valid changes supplied" });
    return;
  }

  const [updated] = await db.update(usersTable).set(updates)
    .where(eq(usersTable.id, id))
    .returning({
      id: usersTable.id,
      username: usersTable.username,
      role: usersTable.role,
      permissions: usersTable.permissions,
    });

  res.json(updated);
});

router.patch("/users/:id/password", requireAuth, requireAdmin, async (req: any, res): Promise<void> => {
  const id = Number(req.params.id);
  const target = await getTarget(id);

  if (!target) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  if (!canManage(req, target)) {
    res.status(403).json({ error: "You cannot reset this account password" });
    return;
  }

  const { password } = req.body;
  if (!password || String(password).length < 8) {
    res.status(400).json({ error: "Password must be at least 8 characters" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await db.update(usersTable).set({ passwordHash }).where(eq(usersTable.id, id));
  res.json({ success: true });
});

router.delete("/users/:id", requireAuth, requireAdmin, async (req: any, res): Promise<void> => {
  const id = Number(req.params.id);
  const target = await getTarget(id);

  if (!target) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  if (!canManage(req, target)) {
    res.status(403).json({ error: "You cannot delete this account" });
    return;
  }

  await db.delete(usersTable).where(eq(usersTable.id, id));
  res.json({ success: true });
});

export default router;
