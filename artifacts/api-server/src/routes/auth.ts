import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";

const router: IRouter = Router();
const JWT_SECRET = process.env.SESSION_SECRET || "healthrecruit-secret-key";

export function requireAuth(req: any, res: any, next: any): void {
  const auth = req.headers.authorization;

  if (!auth || !auth.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const payload = jwt.verify(auth.slice(7), JWT_SECRET) as { id: number };

    void (async () => {
      const [user] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, payload.id));

      if (!user) {
        res.status(401).json({ error: "User not found" });
        return;
      }

      req.user = {
        id: user.id,
        username: user.username,
        role: user.role,
        permissions: user.permissions || [],
        isProtected: user.isProtected,
      };

      next();
    })().catch((error) => {
      logger.error({ error }, "Authentication lookup failed");
      res.status(500).json({ error: "Authentication failed" });
    });
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function requireAdmin(req: any, res: any, next: any): void {
  if (!req.user || !["admin", "superadmin"].includes(req.user.role)) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}

export function requireSuperAdmin(req: any, res: any, next: any): void {
  if (!req.user || req.user.role !== "superadmin") {
    res.status(403).json({ error: "Super Admin access required" });
    return;
  }
  next();
}

export function requireAdminOrRecruiter(req: any, res: any, next: any): void {
  if (!req.user || !["superadmin", "admin", "recruiter"].includes(req.user.role)) {
    res.status(403).json({ error: "Access denied" });
    return;
  }
  next();
}

export function requirePermission(permission: string) {
  return (req: any, res: any, next: any): void => {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    if (["superadmin", "admin"].includes(req.user.role)) {
      next();
      return;
    }

    if ((req.user.permissions || []).includes(permission)) {
      next();
      return;
    }

    res.status(403).json({
      error: "You do not have permission to perform this action",
      requiredPermission: permission,
    });
  };
}

router.post("/auth/login", async (req, res): Promise<void> => {
  const { username, password } = req.body;

  if (!username || !password) {
    res.status(400).json({ error: "Username and password required" });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.username, username));

  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const token = jwt.sign(
    { id: user.id },
    JWT_SECRET,
    { expiresIn: "24h" }
  );

  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      permissions: user.permissions || [],
      isProtected: user.isProtected,
    },
  });
});

router.post("/auth/logout", (_req, res): void => {
  res.json({ success: true, message: "Logged out" });
});

router.get("/auth/me", requireAuth, (req: any, res): void => {
  res.json(req.user);
});

router.patch("/auth/password", requireAuth, async (req: any, res): Promise<void> => {
  if (req.user.isProtected) {
    res.status(403).json({
      error: "The protected Super Admin account password cannot be changed here",
    });
    return;
  }

  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword || String(newPassword).length < 8) {
    res.status(400).json({
      error: "Current password and a new password of at least 8 characters are required",
    });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, req.user.id));

  if (!user || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
    res.status(400).json({ error: "Current password is incorrect" });
    return;
  }

  const hash = await bcrypt.hash(newPassword, 12);

  await db
    .update(usersTable)
    .set({ passwordHash: hash })
    .where(eq(usersTable.id, user.id));

  logger.info({ userId: user.id }, "Password changed");
  res.json({ success: true, message: "Password changed" });
});

export default router;
