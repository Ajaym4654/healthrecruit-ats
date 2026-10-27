import { pgTable, text, jsonb, timestamp } from "drizzle-orm/pg-core";

export const skillChecklistConfigsTable = pgTable("skill_checklist_configs", {
  jobId: text("job_id").primaryKey(),
  jobTitle: text("job_title").notNull(),
  category: text("category").notNull(),
  skills: jsonb("skills").$type<string[]>().notNull().default([]),
  updatedBy: text("updated_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
