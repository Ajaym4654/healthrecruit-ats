import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireAdmin } from "./auth";

const router: IRouter = Router();

router.get("/users", requireAuth, requireAdmin, async (_req, res): Promise<void> => {
  const users = await db
    .select({ id: usersTable.id, username: usersTable.username, role: usersTable.role, createdAt: usersTable.createdAt })
    .from(usersTable)
    .orderBy(usersTable.createdAt);
  res.json(users);
});

router.post("/users", requireAuth, requireAdmin, async (req: any, res): Promise<void> => {
  const { username, password, role } = req.body;
  if (!username || !password) {
    res.status(400).json({ error: "Username and password are required" });
    return;
  }
  const validRole = role === "admin" || role === "recruiter" ? role : "recruiter";

  const [existing] = await db.select().from(usersTable).where(eq(usersTable.username, username));
  if (existing) {
    res.status(409).json({ error: "Username already exists" });
    return;
  }

  if (password.length < 6) {
    res.status(400).json({ error: "Password must be at least 6 characters" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const [user] = await db
    .insert(usersTable)
    .values({ username, passwordHash, role: validRole })
    .returning({ id: usersTable.id, username: usersTable.username, role: usersTable.role, createdAt: usersTable.createdAt });

  res.status(201).json(user);
});

router.patch("/users/:id/password", requireAuth, requireAdmin, async (req: any, res): Promise<void> => {
  const id = Number(req.params.id);
  const { password } = req.body;
  if (!password || password.length < 6) {
    res.status(400).json({ error: "Password must be at least 6 characters" });
    return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  if (user.id === req.user.id) {
    res.status(400).json({ error: "Use the change password form to update your own password" });
    return;
  }
  const passwordHash = await bcrypt.hash(password, 10);
  await db.update(usersTable).set({ passwordHash }).where(eq(usersTable.id, id));
  res.json({ success: true });
});

router.delete("/users/:id", requireAuth, requireAdmin, async (req: any, res): Promise<void> => {
  const id = Number(req.params.id);
  if (id === req.user.id) {
    res.status(400).json({ error: "You cannot delete your own account" });
    return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  await db.delete(usersTable).where(eq(usersTable.id, id));
  res.json({ success: true });
});

export default router;
