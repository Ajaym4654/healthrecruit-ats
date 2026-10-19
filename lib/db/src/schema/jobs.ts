import { createInsertSchema } from "drizzle-zod";
import { integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { candidatesTable } from "./candidates";
import { usersTable } from "./users";

export const jobsTable = pgTable("jobs", {
  id: serial("id").primaryKey(),
  jobCode: text("job_code"),
  title: text("title").notNull(),
  clientName: text("client_name").notNull(),
  source: text("source").notNull().default("Others"),
  location: text("location"),
  specialty: text("specialty"),
  licenseType: text("license_type"),
  openings: integer("openings").notNull().default(1),
  description: text("description"),
  status: text("status").notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const jobSubmissionsTable = pgTable(
  "job_submissions",
  {
    id: serial("id").primaryKey(),
    jobId: integer("job_id").notNull().references(() => jobsTable.id, { onDelete: "cascade" }),
    candidateId: integer("candidate_id").notNull().references(() => candidatesTable.id, { onDelete: "cascade" }),
    submittedBy: integer("submitted_by").references(() => usersTable.id, { onDelete: "set null" }),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("job_submissions_job_candidate_unique").on(table.jobId, table.candidateId)],
);

export const insertJobSchema = createInsertSchema(jobsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertJob = z.infer<typeof insertJobSchema>;
export type Job = typeof jobsTable.$inferSelect;
export type JobSubmission = typeof jobSubmissionsTable.$inferSelect;
