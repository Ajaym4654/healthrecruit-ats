import { Router, type IRouter } from "express";
import multer from "multer";
import { db, candidatesTable } from "@workspace/db";
import { candidateDocumentsTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "./auth";

const router: IRouter = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 10 },
});

function candidateIdFrom(value: string): number {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : 0;
}
function canManage(req: any): boolean {
  return ["admin", "recruiter"].includes(String(req.user?.role || "").toLowerCase());
}
function safeName(name: string): string {
  return name.replace(/[\\r\\n"]/g, "_").split(/[\\\\/]/).pop() || "document";
}

router.get("/candidates/:candidateId/documents", requireAuth, async (req: any, res) => {
  try {
    const candidateId = candidateIdFrom(req.params.candidateId);
    if (!candidateId) { res.status(400).json({ error: "Invalid candidate ID" }); return; }
    const [candidate] = await db.select({ id: candidatesTable.id }).from(candidatesTable).where(eq(candidatesTable.id, candidateId));
    if (!candidate) { res.status(404).json({ error: "Candidate not found" }); return; }
    const rows = await db.select({
      id: candidateDocumentsTable.id,
      candidateId: candidateDocumentsTable.candidateId,
      fileName: candidateDocumentsTable.fileName,
      mimeType: candidateDocumentsTable.mimeType,
      fileSize: candidateDocumentsTable.fileSize,
      documentType: candidateDocumentsTable.documentType,
      uploadedBy: candidateDocumentsTable.uploadedBy,
      createdAt: candidateDocumentsTable.createdAt,
    }).from(candidateDocumentsTable).where(eq(candidateDocumentsTable.candidateId, candidateId)).orderBy(candidateDocumentsTable.createdAt);
    res.json(rows);
  } catch (e) {
    req.log?.error(e);
    res.status(500).json({ error: "Could not load documents" });
  }
});

router.post("/candidates/:candidateId/documents", requireAuth, (req: any, res: any, next: any) => {
  if (!canManage(req)) { res.status(403).json({ error: "Admin or recruiter access required" }); return; }
  next();
}, upload.array("files", 10), async (req: any, res) => {
  try {
    const candidateId = candidateIdFrom(req.params.candidateId);
    if (!candidateId) { res.status(400).json({ error: "Invalid candidate ID" }); return; }
    const [candidate] = await db.select({ id: candidatesTable.id }).from(candidatesTable).where(eq(candidatesTable.id, candidateId));
    if (!candidate) { res.status(404).json({ error: "Candidate not found" }); return; }
    const files = (req.files || []) as Express.Multer.File[];
    if (!files.length) { res.status(400).json({ error: "Choose at least one file" }); return; }
    const documentType = String(req.body?.documentType || "Other").slice(0, 80);
    const saved = await db.insert(candidateDocumentsTable).values(files.map(file => ({
      candidateId,
      fileName: safeName(file.originalname),
      mimeType: file.mimetype || "application/octet-stream",
      fileSize: file.size,
      documentType,
      fileData: file.buffer,
      uploadedBy: String(req.user?.username || "").slice(0, 150) || null,
    }))).returning({
      id: candidateDocumentsTable.id,
      fileName: candidateDocumentsTable.fileName,
      documentType: candidateDocumentsTable.documentType,
    });
    res.status(201).json(saved);
  } catch (e) {
    req.log?.error(e);
    res.status(500).json({ error: "Could not save documents" });
  }
});

router.get("/candidates/:candidateId/documents/:documentId", requireAuth, async (req: any, res) => {
  try {
    const candidateId = candidateIdFrom(req.params.candidateId);
    const documentId = candidateIdFrom(req.params.documentId);
    if (!candidateId || !documentId) { res.status(400).json({ error: "Invalid ID" }); return; }
    const [doc] = await db.select().from(candidateDocumentsTable).where(and(
      eq(candidateDocumentsTable.id, documentId),
      eq(candidateDocumentsTable.candidateId, candidateId),
    ));
    if (!doc) { res.status(404).json({ error: "Document not found" }); return; }
    const previewable = doc.mimeType === "application/pdf" || doc.mimeType.startsWith("image/");
    const preview = req.query.preview === "1" && previewable;
    res.setHeader("Content-Type", preview ? doc.mimeType : "application/octet-stream");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Disposition", `${preview ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(safeName(doc.fileName))}`);
    res.setHeader("Content-Length", doc.fileSize);
    res.end(doc.fileData);
  } catch (e) {
    req.log?.error(e);
    res.status(500).json({ error: "Could not retrieve document" });
  }
});

router.delete("/candidates/:candidateId/documents/:documentId", requireAuth, async (req: any, res) => {
  try {
    if (!canManage(req)) { res.status(403).json({ error: "Admin or recruiter access required" }); return; }
    const candidateId = candidateIdFrom(req.params.candidateId);
    const documentId = candidateIdFrom(req.params.documentId);
    if (!candidateId || !documentId) { res.status(400).json({ error: "Invalid ID" }); return; }
    const deleted = await db.delete(candidateDocumentsTable).where(and(
      eq(candidateDocumentsTable.id, documentId),
      eq(candidateDocumentsTable.candidateId, candidateId),
    )).returning({ id: candidateDocumentsTable.id });
    if (!deleted.length) { res.status(404).json({ error: "Document not found" }); return; }
    res.json({ success: true });
  } catch (e) {
    req.log?.error(e);
    res.status(500).json({ error: "Could not delete document" });
  }
});

router.use((err: any, _req: any, res: any, next: any) => {
  if (err instanceof multer.MulterError) {
    res.status(400).json({ error: err.code === "LIMIT_FILE_SIZE" ? "Each file must be 15 MB or smaller" : "Maximum 10 files per upload" });
    return;
  }
  next(err);
});

export default router;
