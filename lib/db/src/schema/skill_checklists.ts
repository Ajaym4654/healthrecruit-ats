import { pgTable, serial, text, jsonb, timestamp } from "drizzle-orm/pg-core";

export const skillChecklistsTable = pgTable("skill_checklists", {
  id: serial("id").primaryKey(),
  candidateName: text("candidate_name").notNull(),
  jobTitle: text("job_title").notNull(),
  submissionData: jsonb("submission_data").notNull(),
  submittedBy: text("submitted_by"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
});
