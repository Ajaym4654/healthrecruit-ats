import { Router, type IRouter } from "express";
import { db, candidatesTable, importLogsTable, activitiesTable } from "@workspace/db";
import { eq, or, inArray } from "drizzle-orm";
import { requireAuth, requireAdmin } from "./auth";
import { ImportCandidatesBody } from "@workspace/api-zod";
import { desc } from "drizzle-orm";

const router: IRouter = Router();

// Column name mapping — normalize to our internal field names
// Keys are lowercase trimmed CSV header values
const FIELD_MAP: Record<string, string> = {
  // fullName
  "name": "fullName",
  "full name": "fullName",
  "full_name": "fullName",
  "fullname": "fullName",
  "candidate name": "fullName",
  "candidatename": "fullName",
  "nurse name": "fullName",
  "staff name": "fullName",
  "employee name": "fullName",
  "worker name": "fullName",
  "applicant name": "fullName",
  "contact name": "fullName",
  "patient name": "fullName",
  "hcp name": "fullName",
  "clinician name": "fullName",

  // first / last name (combined later)
  "first name": "firstName",
  "firstname": "firstName",
  "first": "firstName",
  "f name": "firstName",
  "fname": "firstName",
  "given name": "firstName",

  "last name": "lastName",
  "lastname": "lastName",
  "last": "lastName",
  "l name": "lastName",
  "lname": "lastName",
  "surname": "lastName",
  "family name": "lastName",

  // phone
  "phone": "phone",
  "phone number": "phone",
  "phonenumber": "phone",
  "mobile": "phone",
  "mobile number": "phone",
  "cell": "phone",
  "cell phone": "phone",
  "contact number": "phone",
  "telephone": "phone",
  "tel": "phone",
  "ph": "phone",
  "ph #": "phone",
  "ph#": "phone",
  "phone #": "phone",

  // email
  "email": "email",
  "email address": "email",
  "emailaddress": "email",
  "email id": "email",
  "e-mail": "email",
  "e mail": "email",

  // location
  "city": "city",
  "location": "city",
  "town": "city",
  "state": "state",
  "province": "state",
  "st": "state",
  "zip": "zipCode",
  "zip code": "zipCode",
  "zipcode": "zipCode",
  "postal code": "zipCode",
  "postal": "zipCode",

  // Position / License type (RN, LPN, CNA, etc.)
  "position": "licenseType",
  "position type": "licenseType",
  "license type": "licenseType",
  "licensetype": "licenseType",
  "license": "licenseType",
  "credential": "licenseType",
  "credentials": "licenseType",
  "discipline": "licenseType",
  "role": "licenseType",
  "job type": "licenseType",
  "type": "licenseType",
  "hcp type": "licenseType",
  "worker type": "licenseType",
  "classification": "licenseType",
  "class": "licenseType",

  // Specialty (clinical specialty: LTC, Med Surg, ICU, PACU, etc.)
  "specialty": "specialty",
  "speciality": "specialty",
  "clinical specialty": "specialty",
  "clinical speciality": "specialty",
  "unit": "specialty",
  "department": "specialty",
  "dept": "specialty",
  "floor": "specialty",
  "unit type": "specialty",
  "area": "specialty",
  "primary specialty": "specialty",

  // Job title / position description
  "job title": "position",
  "title": "position",
  "job description": "position",
  "job role": "position",

  // Experience
  "experience": "experience",
  "years of experience": "experience",
  "yrs experience": "experience",
  "years exp": "experience",
  "exp": "experience",
  "years": "experience",

  // Source
  "source": "source",
  "referral source": "source",
  "lead source": "source",
  "where did you hear": "source",

  // Notes
  "notes": "recruiterNotes",
  "note": "recruiterNotes",
  "recruiter notes": "recruiterNotes",
  "comments": "recruiterNotes",
  "comment": "recruiterNotes",
  "remarks": "recruiterNotes",

  // Availability
  "availability": "availability",
  "available": "availability",
  "available date": "availability",
  "start date": "availability",
};

function mapRow(rawRow: Record<string, any>): Record<string, any> {
  const mapped: Record<string, any> = {};
  for (const [key, value] of Object.entries(rawRow)) {
    const normalized = key.toLowerCase().trim();
    const field = FIELD_MAP[normalized];
    if (field && value != null && String(value).trim() !== "") {
      mapped[field] = String(value).trim();
    }
  }

  // Combine first + last name if no fullName found
  if (!mapped.fullName) {
    const first = mapped.firstName ?? "";
    const last = mapped.lastName ?? "";
    const combined = `${first} ${last}`.trim();
    if (combined) {
      mapped.fullName = combined;
    }
  }

  // Clean up temp fields
  delete mapped.firstName;
  delete mapped.lastName;

  return mapped;
}

router.post("/import/candidates", requireAuth, requireAdmin, async (req, res): Promise<void> => {
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

  // Collect sample of what was skipped for debugging
  const skipReasons: string[] = [];

  const BATCH_SIZE = 500;

  for (let batchStart = 0; batchStart < rows.length; batchStart += BATCH_SIZE) {
    const batch = rows.slice(batchStart, batchStart + BATCH_SIZE);
    const valuesToInsert: any[] = [];

    try {
      const mappedRows = batch.map((row, batchIndex) => ({
        row,
        mapped: mapRow(row as Record<string, any>),
        rowNumber: batchStart + batchIndex + 1,
      }));

      const validRows = mappedRows.filter(({ mapped, row, rowNumber }) => {
        const hasIdentifier = !!(mapped.fullName || mapped.phone || mapped.email);
        if (!hasIdentifier) {
          skipped++;
          if (skipReasons.length < 3) {
            const keys = Object.keys(row as object).slice(0, 5).join(", ");
            skipReasons.push(`Row ${rowNumber}: no name/phone/email found. Columns: ${keys}`);
          }
          return false;
        }

        if (!mapped.fullName) {
          mapped.fullName = mapped.email || mapped.phone || "Unknown";
        }

        return true;
      });

      const phones = validRows.map(({ mapped }) => mapped.phone).filter(Boolean);
      const emails = validRows.map(({ mapped }) => mapped.email).filter(Boolean);

      const existingConditions = [];
      if (phones.length > 0) {
        existingConditions.push(inArray(candidatesTable.phone, phones));
      }
      if (emails.length > 0) {
        existingConditions.push(inArray(candidatesTable.email, emails));
      }

      const existingRows = existingConditions.length > 0
        ? await db
            .select({
              phone: candidatesTable.phone,
              email: candidatesTable.email,
            })
            .from(candidatesTable)
            .where(or(...existingConditions))
        : [];

      const existingPhones = new Set(
        existingRows.map((r) => r.phone).filter(Boolean)
      );
      const existingEmails = new Set(
        existingRows.map((r) => r.email).filter(Boolean)
      );

      const batchPhones = new Set<string>();
      const batchEmails = new Set<string>();

      for (const { mapped } of validRows) {
        const duplicate =
          (mapped.phone && (existingPhones.has(mapped.phone) || batchPhones.has(mapped.phone))) ||
          (mapped.email && (existingEmails.has(mapped.email) || batchEmails.has(mapped.email)));

        if (duplicate) {
          duplicates++;
        }

        if (mapped.phone) batchPhones.add(mapped.phone);
        if (mapped.email) batchEmails.add(mapped.email);

        valuesToInsert.push({
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
          recruiterNotes: mapped.recruiterNotes ?? null,
          availability: mapped.availability ?? null,
          source: mapped.source ?? filename,
          isDuplicate: !!duplicate,
        });
      }

      if (valuesToInsert.length > 0) {
        await db.insert(candidatesTable).values(valuesToInsert);
        imported += valuesToInsert.length;
      }
    } catch (err: any) {
      errors.push(`Batch ${batchStart + 1}-${Math.min(batchStart + BATCH_SIZE, rows.length)}: ${err.message}`);
    }
  }

  // Prepend skip-reason hints to errors for visibility
  const allErrors = [...skipReasons, ...errors];

  const [log] = await db
    .insert(importLogsTable)
    .values({ filename, imported, skipped, duplicates, errors: allErrors.join("\n") || null })
    .returning();

  await db.insert(activitiesTable).values({
    type: "import",
    description: `Imported ${imported} candidates from ${filename} (${duplicates} duplicates, ${skipped} skipped)`,
  });

  res.json({
    imported,
    skipped,
    duplicates,
    errors: allErrors,
    importLogId: log.id,
  });
});

router.get("/import/logs", requireAuth, requireAdmin, async (_req, res): Promise<void> => {
  const logs = await db.select().from(importLogsTable).orderBy(desc(importLogsTable.createdAt)).limit(50);
  res.json(logs);
});

export default router;
