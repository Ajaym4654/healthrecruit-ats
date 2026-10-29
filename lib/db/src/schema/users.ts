import {
  pgTable,
  text,
  serial,
  timestamp,
  boolean,
  jsonb,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const recruiterPermissions = [
  "candidates.view",
  "candidates.create",
  "candidates.edit",
  "candidates.delete",
  "jobs.view",
  "jobs.create",
  "jobs.edit",
  "jobs.delete",
  "jobs.submit",
  "documents.view",
  "documents.upload",
  "documents.delete",
  "notes.manage",
  "activities.view",
  "checklists.view",
  "checklists.manage",
  "checklists.approve",
  "data.import",
  "data.export",
  "reports.view",
] as const;

export type RecruiterPermission = (typeof recruiterPermissions)[number];

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("recruiter"),

  permissions: jsonb("permissions")
    .$type<RecruiterPermission[]>()
    .notNull()
    .default([]),

  isProtected: boolean("is_protected").notNull().default(false),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),

  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
