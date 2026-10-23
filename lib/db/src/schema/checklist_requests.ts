import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const checklistRequestsTable = pgTable("checklist_requests", {
  id: serial("id").primaryKey(),
  tokenHash: text("token_hash").notNull().unique(),
  shortCode: text("short_code").unique(),
  jobId: text("job_id").notNull(),
  jobTitle: text("job_title").notNull(),
  recipientEmail: text("recipient_email"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
});
