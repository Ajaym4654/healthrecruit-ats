import { pgTable, serial, integer, text, timestamp, customType } from "drizzle-orm/pg-core";
import { candidatesTable } from "./candidates";

const binaryData = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

export const candidateDocumentsTable = pgTable("candidate_documents", {
  id: serial("id").primaryKey(),
  candidateId: integer("candidate_id").notNull().references(() => candidatesTable.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  mimeType: text("mime_type").notNull().default("application/octet-stream"),
  fileSize: integer("file_size").notNull(),
  documentType: text("document_type").notNull().default("Other"),
  fileData: binaryData("file_data").notNull(),
  uploadedBy: text("uploaded_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
