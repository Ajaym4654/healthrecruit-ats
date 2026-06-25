import { Router, type IRouter } from "express";
import { db, activitiesTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth } from "./auth";
import {
  ListActivitiesParams,
  CreateActivityParams,
  CreateActivityBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/candidates/:id/activities", requireAuth, async (req, res): Promise<void> => {
  const params = ListActivitiesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const activities = await db
    .select()
    .from(activitiesTable)
    .where(eq(activitiesTable.candidateId, params.data.id))
    .orderBy(desc(activitiesTable.createdAt));

  res.json(activities);
});

router.post("/candidates/:id/activities", requireAuth, async (req, res): Promise<void> => {
  const params = CreateActivityParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = CreateActivityBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [activity] = await db
    .insert(activitiesTable)
    .values({ candidateId: params.data.id, ...parsed.data })
    .returning();

  res.status(201).json(activity);
});

export default router;
