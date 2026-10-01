import { Router, type IRouter } from "express";
import { db, candidatesTable, tagsTable, candidateTagsTable, activitiesTable } from "@workspace/db";
import { eq, ilike, or, sql, and, inArray, desc, asc } from "drizzle-orm";
import { requireAuth, requireAdmin } from "./auth";
import {
  ListCandidatesQueryParams,
  CreateCandidateBody,
  UpdateCandidateBody,
  GetCandidateParams,
  UpdateCandidateParams,
  DeleteCandidateParams,
  BulkDeleteCandidatesBody,
  BulkUpdateCandidatesBody,
  UpdateCandidateStageParams,
  UpdateCandidateStageBody,
  HandleDuplicateActionParams,
  HandleDuplicateActionBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

async function getCandidateWithTags(id: number) {
  const [candidate] = await db.select().from(candidatesTable).where(eq(candidatesTable.id, id));
  if (!candidate) return null;

  const tagRows = await db
    .select({ id: tagsTable.id, name: tagsTable.name, color: tagsTable.color })
    .from(candidateTagsTable)
    .innerJoin(tagsTable, eq(candidateTagsTable.tagId, tagsTable.id))
    .where(eq(candidateTagsTable.candidateId, id));

  return { ...candidate, tags: tagRows };
}

router.get("/candidates", requireAuth, async (req, res): Promise<void> => {
  const parsed = ListCandidatesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const {
    page = 1,
    limit = 25,
    search,
    specialty,
    state,
    city,
    status,
    licenseType,
    pipelineStage,
    sortBy = "createdAt",
    sortOrder = "desc",
  } = parsed.data;

  const offset = (page - 1) * limit;
  const conditions: any[] = [];

  if (search) {
    conditions.push(
      or(
        ilike(candidatesTable.fullName, `%${search}%`),
        ilike(candidatesTable.phone, `%${search}%`),
        ilike(candidatesTable.email, `%${search}%`),
        ilike(candidatesTable.specialty, `%${search}%`),
        ilike(candidatesTable.position, `%${search}%`),
        ilike(candidatesTable.city, `%${search}%`),
        ilike(candidatesTable.state, `%${search}%`),
        ilike(candidatesTable.recruiterNotes, `%${search}%`)
      )
    );
  }
  if (specialty) conditions.push(ilike(candidatesTable.specialty, `%${specialty}%`));
  if (state) conditions.push(eq(candidatesTable.state, state));
  if (status) conditions.push(eq(candidatesTable.currentStatus, status));
  if (licenseType) conditions.push(ilike(candidatesTable.licenseType, `%${licenseType}%`));
  if (pipelineStage) conditions.push(eq(candidatesTable.pipelineStage, pipelineStage));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const colMap: Record<string, any> = {
    createdAt: candidatesTable.createdAt,
    fullName: candidatesTable.fullName,
    updatedAt: candidatesTable.updatedAt,
    specialty: candidatesTable.specialty,
    state: candidatesTable.state,
  };
  const sortCol = colMap[sortBy as string] ?? candidatesTable.createdAt;
  const order = sortOrder === "asc" ? asc(sortCol) : desc(sortCol);

  const [rows, [totalRow]] = await Promise.all([
    db.select().from(candidatesTable).where(where).orderBy(order).limit(limit).offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(candidatesTable).where(where),
  ]);

  const total = totalRow?.count ?? 0;

  // Attach tags for each candidate
  const candidateIds = rows.map((c) => c.id);
  let tagMap: Record<number, any[]> = {};
  if (candidateIds.length > 0) {
    const tagRows = await db
      .select({
        candidateId: candidateTagsTable.candidateId,
        id: tagsTable.id,
        name: tagsTable.name,
        color: tagsTable.color,
      })
      .from(candidateTagsTable)
      .innerJoin(tagsTable, eq(candidateTagsTable.tagId, tagsTable.id))
      .where(inArray(candidateTagsTable.candidateId, candidateIds));

    for (const t of tagRows) {
      if (!tagMap[t.candidateId]) tagMap[t.candidateId] = [];
      tagMap[t.candidateId].push({ id: t.id, name: t.name, color: t.color });
    }
  }

  const data = rows.map((c) => ({ ...c, tags: tagMap[c.id] ?? [] }));

  res.json({
    data,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  });
});

router.post("/candidates", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateCandidateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Check for duplicates by phone and email
  const { phone, email, fullName } = parsed.data;
  let isDuplicate = false;

  if (phone || email) {
    const conditions = [];
    if (phone) conditions.push(eq(candidatesTable.phone, phone));
    if (email) conditions.push(eq(candidatesTable.email, email));
    const existing = await db
      .select({ id: candidatesTable.id })
      .from(candidatesTable)
      .where(or(...conditions))
      .limit(1);
    if (existing.length > 0) isDuplicate = true;
  }

  const [candidate] = await db
    .insert(candidatesTable)
    .values({ ...parsed.data, isDuplicate })
    .returning();

  await db.insert(activitiesTable).values({
    candidateId: candidate.id,
    type: "candidate_created",
    description: `Candidate ${candidate.fullName} was added`,
  });

  res.status(201).json({ ...candidate, tags: [] });
});

router.post("/candidates/bulk-delete", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const parsed = BulkDeleteCandidatesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  await db.delete(candidatesTable).where(inArray(candidatesTable.id, parsed.data.ids));
  res.json({ success: true, message: `Deleted ${parsed.data.ids.length} candidates` });
});

router.patch("/candidates/bulk-update", requireAuth, async (req, res): Promise<void> => {
  const parsed = BulkUpdateCandidatesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { ids, updates } = parsed.data;
  const cleanUpdates: any = {};
  if (updates.pipelineStage) cleanUpdates.pipelineStage = updates.pipelineStage;
  if (updates.currentStatus) cleanUpdates.currentStatus = updates.currentStatus;
  if (updates.specialty) cleanUpdates.specialty = updates.specialty;

  if (Object.keys(cleanUpdates).length > 0) {
    await db.update(candidatesTable).set(cleanUpdates).where(inArray(candidatesTable.id, ids));
  }

  res.json({ success: true, message: `Updated ${ids.length} candidates` });
});

router.get("/candidates/duplicates", requireAuth, async (_req, res): Promise<void> => {
  // Find duplicate groups by phone
  const dupesByPhone = await db.execute(sql`
    SELECT phone, array_agg(id) as ids
    FROM candidates
    WHERE phone IS NOT NULL AND phone != ''
    GROUP BY phone
    HAVING count(*) > 1
    LIMIT 50
  `);

  const dupesByEmail = await db.execute(sql`
    SELECT email, array_agg(id) as ids
    FROM candidates
    WHERE email IS NOT NULL AND email != ''
    GROUP BY email
    HAVING count(*) > 1
    LIMIT 50
  `);

  const allGroups: any[] = [];

  for (const row of (dupesByPhone as unknown as any[])) {
    const candidates = await db
      .select()
      .from(candidatesTable)
      .where(inArray(candidatesTable.id, row.ids));
    allGroups.push({
      duplicateKey: row.phone,
      duplicateType: "phone",
      candidates: candidates.map((c) => ({ ...c, tags: [] })),
    });
  }

  for (const row of (dupesByEmail as unknown as any[])) {
    const candidates = await db
      .select()
      .from(candidatesTable)
      .where(inArray(candidatesTable.id, row.ids));
    allGroups.push({
      duplicateKey: row.email,
      duplicateType: "email",
      candidates: candidates.map((c) => ({ ...c, tags: [] })),
    });
  }

  res.json(allGroups);
});

router.get("/candidates/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetCandidateParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const candidate = await getCandidateWithTags(params.data.id);
  if (!candidate) {
    res.status(404).json({ error: "Candidate not found" });
    return;
  }

  res.json(candidate);
});

router.patch("/candidates/:id", requireAuth, async (req, res): Promise<void> => {
  const params = UpdateCandidateParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateCandidateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [updated] = await db
    .update(candidatesTable)
    .set(parsed.data)
    .where(eq(candidatesTable.id, params.data.id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Candidate not found" });
    return;
  }

  const candidate = await getCandidateWithTags(updated.id);
  res.json(candidate);
});

router.delete("/candidates/:id", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const params = DeleteCandidateParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  await db.delete(candidatesTable).where(eq(candidatesTable.id, params.data.id));
  res.sendStatus(204);
});

router.patch("/candidates/:id/stage", requireAuth, async (req, res): Promise<void> => {
  const params = UpdateCandidateStageParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateCandidateStageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [updated] = await db
    .update(candidatesTable)
    .set({ pipelineStage: parsed.data.stage })
    .where(eq(candidatesTable.id, params.data.id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Candidate not found" });
    return;
  }

  await db.insert(activitiesTable).values({
    candidateId: updated.id,
    type: "stage_changed",
    description: `Pipeline stage changed to ${parsed.data.stage}`,
  });

  const candidate = await getCandidateWithTags(updated.id);
  res.json(candidate);
});

router.post("/candidates/:id/duplicate-action", requireAuth, async (req, res): Promise<void> => {
  const params = HandleDuplicateActionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = HandleDuplicateActionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { action, targetId } = parsed.data;

  if (action === "ignore") {
    await db.update(candidatesTable).set({ isDuplicate: false }).where(eq(candidatesTable.id, params.data.id));
  } else if (action === "merge") {
    // Merge: delete source, keep target
    await db.delete(candidatesTable).where(eq(candidatesTable.id, params.data.id));
  } else if (action === "update") {
    // Update target with source data (simplified)
    const [source] = await db.select().from(candidatesTable).where(eq(candidatesTable.id, params.data.id));
    if (source) {
      await db.update(candidatesTable).set({ ...source, id: targetId }).where(eq(candidatesTable.id, targetId));
      await db.delete(candidatesTable).where(eq(candidatesTable.id, params.data.id));
    }
  }

  res.json({ success: true, message: `Duplicate action '${action}' applied` });
});

export default router;
