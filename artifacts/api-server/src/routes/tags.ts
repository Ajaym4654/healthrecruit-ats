import { Router, type IRouter } from "express";
import { db, tagsTable, candidateTagsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "./auth";
import {
  AddCandidateTagParams,
  AddCandidateTagBody,
  RemoveCandidateTagParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/tags", requireAuth, async (_req, res): Promise<void> => {
  const tags = await db.select().from(tagsTable).orderBy(tagsTable.name);
  res.json(tags);
});

router.post("/candidates/:id/tags", requireAuth, async (req, res): Promise<void> => {
  const params = AddCandidateTagParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = AddCandidateTagBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Upsert tag by name
  const existing = await db.select().from(tagsTable).where(eq(tagsTable.name, parsed.data.name)).limit(1);
  let tag = existing[0];

  if (!tag) {
    const [newTag] = await db
      .insert(tagsTable)
      .values({ name: parsed.data.name, color: parsed.data.color ?? null })
      .returning();
    tag = newTag;
  }

  // Link to candidate if not already linked
  const alreadyLinked = await db
    .select()
    .from(candidateTagsTable)
    .where(and(eq(candidateTagsTable.candidateId, params.data.id), eq(candidateTagsTable.tagId, tag.id)))
    .limit(1);

  if (alreadyLinked.length === 0) {
    await db.insert(candidateTagsTable).values({ candidateId: params.data.id, tagId: tag.id });
  }

  res.status(201).json(tag);
});

router.delete("/candidates/:id/tags/:tagId", requireAuth, async (req, res): Promise<void> => {
  const params = RemoveCandidateTagParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  await db
    .delete(candidateTagsTable)
    .where(
      and(
        eq(candidateTagsTable.candidateId, params.data.id),
        eq(candidateTagsTable.tagId, params.data.tagId)
      )
    );

  res.sendStatus(204);
});

export default router;
