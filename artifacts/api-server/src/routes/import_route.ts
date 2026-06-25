import { Router, type IRouter } from "express";
import { db, candidatesTable, importLogsTable, activitiesTable } from "@workspace/db";
import { eq, or } from "drizzle-orm";
import { requireAuth } from "./auth";
import { ImportCandidatesBody } from "@workspace/api-zod";
import { desc } from "drizzle-orm";

const router: IRouter = Router();

// Column name mapping for smart import
const FIELD_MAP: Record<string, string> = {
  // fullName
  name: "fullName",
  "full name": "fullName",
  "full_name": "fullName",
  "candidate name": "fullName",
  "candidatename": "fullName",
  // phone
  phone: "phone",
  mobile: "phone",
  "mobile number": "phone",
  "contact number": "phone",
  "phone number": "phone",
  phonenumber: "phone",
  // email
  email: "email",
  "email address": "email",
  "email id": "email",
  emailaddress: "email",
  // city
  city: "city",
  location: "city",
  // state
  state: "state",
  province: "state",
  // zipCode
  zip: "zipCode",
  "zip code": "zipCode",
  zipcode: "zipCode",
  "postal code": "zipCode",
  // position
  position: "position",
  "job title": "position",
  title: "position",
  // specialty
  specialty: "specialty",
  speciality: "specialty",
  // experience
  experience: "experience",
  "years of experience": "experience",
  // licenseType
  "license type": "licenseType",
  licensetype: "licenseType",
  "license": "licenseType",
  // source
  source: "source",
};

function mapRow(rawRow: Record<string, any>): Record<string, any> {
  const mapped: Record<string, any> = {};
  for (const [key, value] of Object.entries(rawRow)) {
    const normalized = key.toLowerCase().trim();
    const field = FIELD_MAP[normalized];
    if (field && value != null && value !== "") {
      mapped[field] = String(value).trim();
    }
  }
  return mapped;
}

router.post("/import/candidates", requireAuth, async (req, res): Promise<void> => {
  const parsed = ImportCandidatesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { rows, filename = "import" } = parsed.data;
  let imported = 0;
  let skipped = 0;
  let duplicates = 0;
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    try {
      const mapped = mapRow(rows[i] as Record<string, any>);
      if (!mapped.fullName) {
        skipped++;
        continue;
      }

      // Check for duplicates
      let isDuplicate = false;
      const conditions = [];
      if (mapped.phone) conditions.push(eq(candidatesTable.phone, mapped.phone));
      if (mapped.email) conditions.push(eq(candidatesTable.email, mapped.email));

      if (conditions.length > 0) {
        const existing = await db
          .select({ id: candidatesTable.id })
          .from(candidatesTable)
          .where(or(...conditions))
          .limit(1);
        if (existing.length > 0) {
          isDuplicate = true;
          duplicates++;
        }
      }

      await db.insert(candidatesTable).values({
        fullName: mapped.fullName,
        phone: mapped.phone ?? null,
        email: mapped.email ?? null,
        city: mapped.city ?? null,
        state: mapped.state ?? null,
        zipCode: mapped.zipCode ?? null,
        position: mapped.position ?? null,
        specialty: mapped.specialty ?? null,
        experience: mapped.experience ?? null,
        licenseType: mapped.licenseType ?? null,
        source: mapped.source ?? filename,
        isDuplicate,
      });
      imported++;
    } catch (err: any) {
      errors.push(`Row ${i + 1}: ${err.message}`);
    }
  }

  const [log] = await db
    .insert(importLogsTable)
    .values({ filename, imported, skipped, duplicates, errors: errors.join("\n") || null })
    .returning();

  await db.insert(activitiesTable).values({
    type: "import",
    description: `Imported ${imported} candidates from ${filename} (${duplicates} duplicates, ${skipped} skipped)`,
  });

  res.json({
    imported,
    skipped,
    duplicates,
    errors,
    importLogId: log.id,
  });
});

router.get("/import/logs", requireAuth, async (_req, res): Promise<void> => {
  const logs = await db.select().from(importLogsTable).orderBy(desc(importLogsTable.createdAt)).limit(50);
  res.json(logs);
});

export default router;
