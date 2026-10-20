import { Router, type IRouter } from "express";
import { and, asc, desc, eq } from "drizzle-orm";
import {
  activitiesTable,
  candidatesTable,
  db,
  jobSubmissionsTable,
  jobsTable,
  usersTable,
} from "@workspace/db";
import {
  DeleteJobParams,
  ImportJobsBody,
  ListJobSubmissionsParams,
  SubmitCandidateToJobBody,
  SubmitCandidateToJobParams,
  UpdateJobBody,
  UpdateJobParams,
} from "@workspace/api-zod";
import { requireAdmin, requireAuth } from "./auth";

const router: IRouter = Router();

function normalizeHeader(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]/g, "");
}

function readCell(row: Record<string, unknown>, aliases: string[]): string {
  const normalized = new Map(
    Object.entries(row).map(([key, value]) => [normalizeHeader(key), value]),
  );

  for (const alias of aliases) {
    const value = normalized.get(normalizeHeader(alias));
    if (value != null && String(value).trim() !== "") return String(value).trim();
  }
  return "";
}

function duplicateKey(job: {
  jobCode: string | null;
  title: string;
  clientName: string;
  location: string | null;
}): string {
  const client = job.clientName.trim().toLowerCase();
  if (job.jobCode?.trim()) return `code:${client}:${job.jobCode.trim().toLowerCase()}`;
  return `title:${client}:${job.title.trim().toLowerCase()}:${(job.location ?? "").trim().toLowerCase()}`;
}

async function getSubmissionById(submissionId: number) {
  const [submission] = await db
    .select({
      id: jobSubmissionsTable.id,
      jobId: jobSubmissionsTable.jobId,
      candidateId: jobSubmissionsTable.candidateId,
      submittedAt: jobSubmissionsTable.submittedAt,
      submittedByUsername: usersTable.username,
      candidate: {
        id: candidatesTable.id,
        fullName: candidatesTable.fullName,
        email: candidatesTable.email,
        phone: candidatesTable.phone,
        currentStatus: candidatesTable.currentStatus,
        pipelineStage: candidatesTable.pipelineStage,
      },
    })
    .from(jobSubmissionsTable)
    .innerJoin(candidatesTable, eq(jobSubmissionsTable.candidateId, candidatesTable.id))
    .leftJoin(usersTable, eq(jobSubmissionsTable.submittedBy, usersTable.id))
    .where(eq(jobSubmissionsTable.id, submissionId));
  return submission;
}

router.get("/jobs", requireAuth, async (_req, res): Promise<void> => {
  const jobs = await db.select().from(jobsTable).orderBy(asc(jobsTable.clientName), asc(jobsTable.title));
  res.json(jobs);
});

router.post("/jobs/import", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const parsed = ImportJobsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const existingJobs = await db
    .select({
      jobCode: jobsTable.jobCode,
      title: jobsTable.title,
      clientName: jobsTable.clientName,
      location: jobsTable.location,
    })
    .from(jobsTable);
  const seen = new Set(existingJobs.map(duplicateKey));
  const errors: string[] = [];
  let imported = 0;
  let skipped = 0;

  for (const [index, rawRow] of parsed.data.rows.entries()) {
    const row = rawRow as Record<string, unknown>;
    const unit = readCell(row, ["unit"]);
    const specialty = readCell(row, ["specialty", "speciality", "department"]) || unit || null;
    const licenseType = readCell(row, ["license type", "license", "credential", "position type", "type"]) || null;
    const shift = readCell(row, ["shift"]);
    const title = readCell(row, ["job title", "title", "position", "role", "job", "requisition title", "req title"])
      || [unit, licenseType, shift].filter(Boolean).join(" - ")
      || specialty
      || readCell(row, ["facility"]);
    const clientName = readCell(row, ["client", "client name", "facility", "account", "customer"]);
    const sourceText = readCell(row, ["source", "source category", "import source"]).toLowerCase();
    const source = sourceText === "westways" ? "Westways"
      : sourceText === "adaptive" ? "Adaptive" : "Others";
    const locationValue = readCell(row, ["location", "work location", "city/state", "city state", "address"]);
    const city = readCell(row, ["city"]);
    const state = readCell(row, ["state", "province"]);
    const location = locationValue || [city, state].filter(Boolean).join(", ") || null;
    const jobCode = readCell(row, ["job code", "job id", "req id", "requisition id", "reference", "contract", "contract number"]);
    const openingsText = readCell(row, ["openings", "positions", "number of openings", "headcount", "# openings"]);
    const openings = openingsText ? Number(openingsText) : 1;
    const statusText = readCell(row, ["status", "job status", "req status", "job opening status"]).toLowerCase();
    const extraDetails = ["shift", "guaranteed hours", "contract rate", "admin fee",
      "needs available", "non-billable orientation hours", "bill rate", "msp"]
      .map((key) => {
        const value = readCell(row, [key]);
        return value ? `${key}: ${value}` : "";
      }).filter(Boolean).join("\\n");
    const description = readCell(row, ["description", "job description", "details", "notes"])
      || extraDetails || null;
    if (!title || !clientName) {
      skipped++;
      errors.push(`Row ${index + 2}: job title and client are required.`);
      continue;
    }
    if (!Number.isInteger(openings) || openings < 1) {
      skipped++;
      errors.push(`Row ${index + 2}: openings must be a positive whole number.`);
      continue;
    }

    let status: "open" | "closed" = "open";
    if (["closed", "filled", "inactive", "cancelled", "canceled", "filled/closed"].includes(statusText)) {
      status = "closed";
    } else if (statusText && !["open", "active", "posted"].includes(statusText)) {
      skipped++;
      errors.push(`Row ${index + 2}: status must be Open or Closed.`);
      continue;
    }

    const job = { jobCode: jobCode || null, title, clientName, location, source };
    const key = duplicateKey(job);
    if (seen.has(key)) {
      skipped++;
      errors.push(`Row ${index + 2}: duplicate job skipped (${title}, ${clientName}).`);
      continue;
    }

    await db.insert(jobsTable).values({
      ...job,
      specialty,
      licenseType,
      openings,
      description,
      status,
    });
    seen.add(key);
    imported++;
  }

  res.json({ imported, skipped, errors });
});

router.patch("/jobs/:id", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const params = UpdateJobParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateJobBody.safeParse(req.body);
  if (!parsed.success || Object.keys(parsed.data ?? {}).length === 0) {
    res.status(400).json({ error: parsed.success ? "At least one field is required." : parsed.error.message });
    return;
  }

  const [job] = await db
    .update(jobsTable)
    .set(parsed.data)
    .where(eq(jobsTable.id, params.data.id))
    .returning();
  if (!job) {
    res.status(404).json({ error: "Job not found." });
    return;
  }
  res.json(job);
});

router.delete("/jobs/:id", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const params = DeleteJobParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [job] = await db.delete(jobsTable).where(eq(jobsTable.id, params.data.id)).returning({ id: jobsTable.id });
  if (!job) {
    res.status(404).json({ error: "Job not found." });
    return;
  }
  res.sendStatus(204);
});

router.get("/jobs/:id/submissions", requireAuth, async (req, res): Promise<void> => {
  const params = ListJobSubmissionsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const submissions = await db
    .select({
      id: jobSubmissionsTable.id,
      jobId: jobSubmissionsTable.jobId,
      candidateId: jobSubmissionsTable.candidateId,
      submittedAt: jobSubmissionsTable.submittedAt,
      submittedByUsername: usersTable.username,
      candidate: {
        id: candidatesTable.id,
        fullName: candidatesTable.fullName,
        email: candidatesTable.email,
        phone: candidatesTable.phone,
        currentStatus: candidatesTable.currentStatus,
        pipelineStage: candidatesTable.pipelineStage,
      },
    })
    .from(jobSubmissionsTable)
    .innerJoin(candidatesTable, eq(jobSubmissionsTable.candidateId, candidatesTable.id))
    .leftJoin(usersTable, eq(jobSubmissionsTable.submittedBy, usersTable.id))
    .where(eq(jobSubmissionsTable.jobId, params.data.id))
    .orderBy(desc(jobSubmissionsTable.submittedAt));
  res.json(submissions);
});

router.post("/jobs/:id/submissions", requireAuth, async (req: any, res): Promise<void> => {
  const params = SubmitCandidateToJobParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = SubmitCandidateToJobBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, params.data.id));
  if (!job) {
    res.status(404).json({ error: "Job not found." });
    return;
  }
  if (job.status !== "open") {
    res.status(409).json({ error: "This job is closed and cannot accept submissions." });
    return;
  }

  const [candidate] = await db
    .select({ id: candidatesTable.id })
    .from(candidatesTable)
    .where(eq(candidatesTable.id, parsed.data.candidateId));
  if (!candidate) {
    res.status(404).json({ error: "Candidate not found." });
    return;
  }

  const [existing] = await db
    .select({ id: jobSubmissionsTable.id })
    .from(jobSubmissionsTable)
    .where(and(
      eq(jobSubmissionsTable.jobId, job.id),
      eq(jobSubmissionsTable.candidateId, candidate.id),
    ));
  if (existing) {
    res.status(409).json({ error: "This candidate has already been submitted for this job." });
    return;
  }

  let submissionId: number;
  try {
    const [submission] = await db
      .insert(jobSubmissionsTable)
      .values({
        jobId: job.id,
        candidateId: candidate.id,
        submittedBy: req.user.id,
      })
      .returning({ id: jobSubmissionsTable.id });
    submissionId = submission.id;
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
      res.status(409).json({ error: "This candidate has already been submitted for this job." });
      return;
    }
    throw error;
  }

  await db
    .update(candidatesTable)
    .set({ pipelineStage: "submitted" })
    .where(eq(candidatesTable.id, candidate.id));

  await db.insert(activitiesTable).values({
    candidateId: candidate.id,
    type: "job_submission",
    description: `Candidate submitted for ${job.title} at ${job.clientName}`,
    metadata: JSON.stringify({ jobId: job.id, jobSubmissionId: submissionId }),
  });

  const submission = await getSubmissionById(submissionId);
  if (!submission) {
    res.status(500).json({ error: "Submission was created but could not be loaded." });
    return;
  }
  res.status(201).json(submission);
});

export default router;
