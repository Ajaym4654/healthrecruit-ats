import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const importLogsTable = pgTable("import_logs", {
  id: serial("id").primaryKey(),
  filename: text("filename").notNull(),
  imported: integer("imported").notNull().default(0),
  skipped: integer("skipped").notNull().default(0),
  duplicates: integer("duplicates").notNull().default(0),
  errors: text("errors"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertImportLogSchema = createInsertSchema(importLogsTable).omit({ id: true, createdAt: true });
export type InsertImportLog = z.infer<typeof insertImportLogSchema>;
export type ImportLog = typeof importLogsTable.$inferSelect;
