import { Router, type IRouter } from "express";
import { db, candidatesTable, tagsTable, candidateTagsTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { requireAuth } from "./auth";

const router: IRouter = Router();

const PIPELINE_STAGES = [
  { stage: "new_lead", label: "New Lead" },
  { stage: "contacted", label: "Contacted" },
  { stage: "interested", label: "Interested" },
  { stage: "submitted", label: "Submitted" },
  { stage: "interview", label: "Interview" },
  { stage: "offer", label: "Offer" },
  { stage: "placed", label: "Placed" },
  { stage: "rejected", label: "Rejected" },
];

router.get("/pipeline", requireAuth, async (_req, res): Promise<void> => {
  const allCandidates = await db.select().from(candidatesTable).orderBy(candidatesTable.updatedAt);

  const allIds = allCandidates.map((c) => c.id);
  let tagMap: Record<number, any[]> = {};

  if (allIds.length > 0) {
    const tagRows = await db
      .select({
        candidateId: candidateTagsTable.candidateId,
        id: tagsTable.id,
        name: tagsTable.name,
        color: tagsTable.color,
      })
      .from(candidateTagsTable)
      .innerJoin(tagsTable, eq(candidateTagsTable.tagId, tagsTable.id))
      .where(inArray(candidateTagsTable.candidateId, allIds));

    for (const t of tagRows) {
      if (!tagMap[t.candidateId]) tagMap[t.candidateId] = [];
      tagMap[t.candidateId].push({ id: t.id, name: t.name, color: t.color });
    }
  }

  const candidatesWithTags = allCandidates.map((c) => ({ ...c, tags: tagMap[c.id] ?? [] }));

  const columns = PIPELINE_STAGES.map(({ stage, label }) => {
    const stageCandidates = candidatesWithTags.filter(
      (c) => c.pipelineStage === stage || (!c.pipelineStage && stage === "new_lead")
    );
    return {
      stage,
      label,
      count: stageCandidates.length,
      candidates: stageCandidates,
    };
  });

  res.json(columns);
});

export default router;
