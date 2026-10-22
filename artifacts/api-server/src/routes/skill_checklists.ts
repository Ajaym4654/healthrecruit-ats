import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { skillChecklistsTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { requireAuth, requireAdmin } from "./auth";

const router: IRouter = Router();

// Checklist data may contain sensitive personal information: Admin only.
router.get("/skill-checklists", requireAuth, requireAdmin, async (req: any, res) => {
  try {
    const rows = await db.select({
      id: skillChecklistsTable.id,
      candidateName: skillChecklistsTable.candidateName,
      jobTitle: skillChecklistsTable.jobTitle,
      submittedBy: skillChecklistsTable.submittedBy,
      submittedAt: skillChecklistsTable.submittedAt,
    }).from(skillChecklistsTable).orderBy(desc(skillChecklistsTable.submittedAt));
    res.json(rows);
  } catch (error) {
    req.log?.error(error);
    res.status(500).json({ error: "Could not load checklist submissions" });
  }
});

router.get("/skill-checklists/:id", requireAuth, requireAdmin, async (req: any, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) {
      res.status(400).json({ error: "Invalid submission ID" });
      return;
    }
    const [row] = await db.select().from(skillChecklistsTable).where(eq(skillChecklistsTable.id, id));
    if (!row) {
      res.status(404).json({ error: "Submission not found" });
      return;
    }
    res.setHeader("Cache-Control", "no-store");
    res.json(row);
  } catch (error) {
    req.log?.error(error);
    res.status(500).json({ error: "Could not load checklist submission" });
  }
});

router.post("/skill-checklists", requireAuth, requireAdmin, async (req: any, res) => {
  try {
    const data = req.body?.submissionData;
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      res.status(400).json({ error: "Valid submissionData is required" });
      return;
    }
    const candidateName = String(data.candidate?.fullName || "").trim().slice(0, 200);
    const jobTitle = String(data.job?.title || "").trim().slice(0, 200);
    if (!candidateName || !jobTitle) {
      res.status(400).json({ error: "Candidate name and job title are required" });
      return;
    }
    const [saved] = await db.insert(skillChecklistsTable).values({
      candidateName,
      jobTitle,
      submissionData: data,
      submittedBy: String(req.user?.username || "").slice(0, 150),
    }).returning({
      id: skillChecklistsTable.id,
      candidateName: skillChecklistsTable.candidateName,
      jobTitle: skillChecklistsTable.jobTitle,
      submittedAt: skillChecklistsTable.submittedAt,
    });
    res.setHeader("Cache-Control", "no-store");
    res.status(201).json(saved);
  } catch (error) {
    req.log?.error(error);
    res.status(500).json({ error: "Could not save checklist submission" });
  }
});

export default router;
