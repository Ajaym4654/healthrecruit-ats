import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { skillChecklistsTable, skillChecklistConfigsTable } from "@workspace/db";
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

router.delete("/skill-checklists/:id", requireAuth, async (req: any, res) => {
  try {
    if (String(req.user?.username || "").toLowerCase() !== "ajaym4654" ||
        String(req.user?.role || "").toLowerCase() !== "admin") {
      res.status(403).json({ error: "Super admin access required" });
      return;
    }

    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) {
      res.status(400).json({ error: "Invalid submission ID" });
      return;
    }

    const [deleted] = await db.delete(skillChecklistsTable)
      .where(eq(skillChecklistsTable.id, id))
      .returning({ id: skillChecklistsTable.id });

    if (!deleted) {
      res.status(404).json({ error: "Submission not found" });
      return;
    }

    res.setHeader("Cache-Control", "no-store");
    res.json({ success: true, id: deleted.id });
  } catch (error) {
    req.log?.error(error);
    res.status(500).json({ error: "Could not delete checklist submission" });
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


// Skill lists are readable by checklist pages; only admins may change them.
router.get("/skill-checklist-configs", async (req: any, res) => {
  try {
    const rows = await db.select().from(skillChecklistConfigsTable);
    res.setHeader("Cache-Control", "no-store");
    res.json(rows);
  } catch (error) {
    console.error("[skill-checklist-configs] Load failed:", error);
    req.log?.error(error);
    res.status(500).json({ error: "Could not load skill configurations" });
  }
});

router.put("/skill-checklist-configs/:jobId", requireAuth, requireAdmin, async (req: any, res) => {
  try {
    const jobId = String(req.params.jobId || "");
    const { jobTitle, category, skills } = req.body ?? {};

    if (!/^[a-z0-9-]{1,100}$/.test(jobId)) {
      res.status(400).json({ error: "Invalid role ID" });
      return;
    }
    if (typeof jobTitle !== "string" || !jobTitle.trim() || jobTitle.length > 200) {
      res.status(400).json({ error: "Valid jobTitle is required" });
      return;
    }
    if (!["nursing", "allied", "clinical"].includes(category)) {
      res.status(400).json({ error: "Invalid role category" });
      return;
    }
    if (!Array.isArray(skills) || skills.some((skill: unknown) => typeof skill !== "string")) {
      res.status(400).json({ error: "Skills must be provided as text entries" });
      return;
    }

    // Preserve every supplied entry exactly; no count, character, or duplicate limits.
    const cleanSkills = skills as string[];
    const [saved] = await db.insert(skillChecklistConfigsTable).values({
      jobId,
      jobTitle: jobTitle.trim(),
      category,
      skills: cleanSkills,
      updatedBy: String(req.user?.username || "").slice(0, 150),
      updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: skillChecklistConfigsTable.jobId,
      set: {
        jobTitle: jobTitle.trim(),
        category,
        skills: cleanSkills,
        updatedBy: String(req.user?.username || "").slice(0, 150),
        updatedAt: new Date(),
      },
    }).returning();

    res.setHeader("Cache-Control", "no-store");
    res.json(saved);
  } catch (error) {
    console.error("[skill-checklist-configs] Save failed:", error);
    req.log?.error(error);
    res.status(500).json({ error: "Could not save skill configuration" });
  }
});

export default router;
