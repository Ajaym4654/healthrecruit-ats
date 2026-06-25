import { Router, type IRouter } from "express";
import { db, notesTable, activitiesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "./auth";
import {
  ListNotesParams,
  CreateNoteParams,
  CreateNoteBody,
  UpdateNoteParams,
  UpdateNoteBody,
  DeleteNoteParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/candidates/:id/notes", requireAuth, async (req, res): Promise<void> => {
  const params = ListNotesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const notes = await db
    .select()
    .from(notesTable)
    .where(eq(notesTable.candidateId, params.data.id))
    .orderBy(notesTable.createdAt);

  res.json(notes);
});

router.post("/candidates/:id/notes", requireAuth, async (req, res): Promise<void> => {
  const params = CreateNoteParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = CreateNoteBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [note] = await db
    .insert(notesTable)
    .values({ candidateId: params.data.id, ...parsed.data })
    .returning();

  await db.insert(activitiesTable).values({
    candidateId: params.data.id,
    type: "note_added",
    description: `Note added: ${parsed.data.content.slice(0, 80)}`,
  });

  res.status(201).json(note);
});

router.patch("/candidates/:id/notes/:noteId", requireAuth, async (req, res): Promise<void> => {
  const params = UpdateNoteParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateNoteBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [note] = await db
    .update(notesTable)
    .set(parsed.data)
    .where(and(eq(notesTable.id, params.data.noteId), eq(notesTable.candidateId, params.data.id)))
    .returning();

  if (!note) {
    res.status(404).json({ error: "Note not found" });
    return;
  }

  res.json(note);
});

router.delete("/candidates/:id/notes/:noteId", requireAuth, async (req, res): Promise<void> => {
  const params = DeleteNoteParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  await db
    .delete(notesTable)
    .where(and(eq(notesTable.id, params.data.noteId), eq(notesTable.candidateId, params.data.id)));

  res.sendStatus(204);
});

export default router;
