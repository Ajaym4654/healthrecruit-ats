import { Router, type IRouter } from "express";
import { db, candidatesTable, activitiesTable } from "@workspace/db";
import { sql, count, gte } from "drizzle-orm";
import { requireAuth } from "./auth";

const router: IRouter = Router();

router.get("/dashboard/stats", requireAuth, async (_req, res): Promise<void> => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  const monthAgo = new Date();
  monthAgo.setDate(monthAgo.getDate() - 30);

  const [[totalRow], [todayRow], [duplicatesRow], [resumesRow], [pipelineRow], [weekRow], [monthRow]] =
    await Promise.all([
      db.select({ count: count() }).from(candidatesTable),
      db.select({ count: count() }).from(candidatesTable).where(gte(candidatesTable.createdAt, today)),
      db.select({ count: count() }).from(candidatesTable).where(sql`is_duplicate = true`),
      db.select({ count: count() }).from(candidatesTable).where(sql`resume_file IS NOT NULL`),
      db
        .select({ count: count() })
        .from(candidatesTable)
        .where(
          sql`pipeline_stage NOT IN ('placed', 'rejected') AND pipeline_stage IS NOT NULL`
        ),
      db.select({ count: count() }).from(candidatesTable).where(gte(candidatesTable.createdAt, weekAgo)),
      db.select({ count: count() }).from(candidatesTable).where(gte(candidatesTable.createdAt, monthAgo)),
    ]);

  res.json({
    totalCandidates: totalRow?.count ?? 0,
    newToday: todayRow?.count ?? 0,
    duplicatesFound: duplicatesRow?.count ?? 0,
    resumesUploaded: resumesRow?.count ?? 0,
    activePipeline: pipelineRow?.count ?? 0,
    totalThisWeek: weekRow?.count ?? 0,
    totalThisMonth: monthRow?.count ?? 0,
  });
});

router.get("/dashboard/specialty-breakdown", requireAuth, async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      label: candidatesTable.specialty,
      count: count(),
    })
    .from(candidatesTable)
    .where(sql`specialty IS NOT NULL`)
    .groupBy(candidatesTable.specialty)
    .orderBy(sql`count(*) desc`)
    .limit(10);

  res.json(rows.map((r) => ({ label: r.label ?? "Unknown", count: Number(r.count) })));
});

router.get("/dashboard/state-breakdown", requireAuth, async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      label: candidatesTable.state,
      count: count(),
    })
    .from(candidatesTable)
    .where(sql`state IS NOT NULL`)
    .groupBy(candidatesTable.state)
    .orderBy(sql`count(*) desc`)
    .limit(15);

  res.json(rows.map((r) => ({ label: r.label ?? "Unknown", count: Number(r.count) })));
});

router.get("/dashboard/pipeline-breakdown", requireAuth, async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      label: candidatesTable.pipelineStage,
      count: count(),
    })
    .from(candidatesTable)
    .where(sql`pipeline_stage IS NOT NULL`)
    .groupBy(candidatesTable.pipelineStage)
    .orderBy(sql`count(*) desc`);

  res.json(rows.map((r) => ({ label: r.label ?? "Unknown", count: Number(r.count) })));
});

router.get("/dashboard/weekly-growth", requireAuth, async (_req, res): Promise<void> => {
  const rows = await db.execute(sql`
    SELECT
      TO_CHAR(DATE_TRUNC('week', created_at), 'Mon DD') AS week,
      TO_CHAR(DATE_TRUNC('week', created_at), 'YYYY-MM-DD') AS date,
      COUNT(*)::int AS count
    FROM candidates
    WHERE created_at >= NOW() - INTERVAL '10 weeks'
    GROUP BY DATE_TRUNC('week', created_at)
    ORDER BY DATE_TRUNC('week', created_at) ASC
  `);

  res.json(
    (rows as unknown as any[]).map((r) => ({
      week: r.week,
      date: r.date,
      count: Number(r.count),
    }))
  );
});

router.get("/dashboard/recent-activity", requireAuth, async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(activitiesTable)
    .orderBy(sql`created_at desc`)
    .limit(20);

  res.json(rows);
});

export default router;
