import { pgTable, text, serial, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const candidatesTable = pgTable("candidates", {
  id: serial("id").primaryKey(),
  fullName: text("full_name").notNull(),
  phone: text("phone"),
  email: text("email"),
  city: text("city"),
  state: text("state"),
  zipCode: text("zip_code"),
  position: text("position"),
  specialty: text("specialty"),
  experience: text("experience"),
  licenseType: text("license_type"),
  licenseNumber: text("license_number"),
  preferredLocation: text("preferred_location"),
  availability: text("availability"),
  currentStatus: text("current_status").default("active"),
  pipelineStage: text("pipeline_stage").default("new_lead"),
  recruiterNotes: text("recruiter_notes"),
  resumeFile: text("resume_file"),
  source: text("source"),
  isDuplicate: boolean("is_duplicate").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertCandidateSchema = createInsertSchema(candidatesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCandidate = z.infer<typeof insertCandidateSchema>;
export type Candidate = typeof candidatesTable.$inferSelect;
