import { Router, type IRouter } from "express";
import { db, candidatesTable, tagsTable, candidateTagsTable } from "@workspace/db";
import { ilike, or, sql, inArray, eq } from "drizzle-orm";
import { requireAuth } from "./auth";
import { SearchCandidatesQueryParams } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/search/candidates", requireAuth, async (req, res): Promise<void> => {
  const parsed = SearchCandidatesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { q, page = 1, limit = 25 } = parsed.data;
  const offset = (page - 1) * limit;

  const where = or(
    ilike(candidatesTable.fullName, `%${q}%`),
    ilike(candidatesTable.phone, `%${q}%`),
    ilike(candidatesTable.email, `%${q}%`),
    ilike(candidatesTable.specialty, `%${q}%`),
    ilike(candidatesTable.position, `%${q}%`),
    ilike(candidatesTable.city, `%${q}%`),
    ilike(candidatesTable.state, `%${q}%`),
    ilike(candidatesTable.licenseType, `%${q}%`),
    ilike(candidatesTable.recruiterNotes, `%${q}%`)
  );

  const [rows, [totalRow]] = await Promise.all([
    db.select().from(candidatesTable).where(where).limit(limit).offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(candidatesTable).where(where),
  ]);

  const total = totalRow?.count ?? 0;

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

export default router;
