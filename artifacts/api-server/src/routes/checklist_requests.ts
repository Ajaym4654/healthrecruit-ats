import { Router, type IRouter } from "express";
import { randomBytes, createHash } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db, checklistRequestsTable, skillChecklistsTable } from "@workspace/db";
import { requireAuth, requireAdminOrRecruiter } from "./auth";

const router: IRouter = Router();
const JOBS: Record<string, string> = {
  "cna": "Certified Nursing Assistant (CNA)",
  "lpn": "Licensed Practical Nurse (LPN)",
  "rn-ltc": "Registered Nurse - Long-Term Care (LTC)",
  "rn-er": "RN - Emergency Room (ER)",
  "rn-medsurg": "RN - Medical-Surgical / Telemetry",
  "rn-or": "RN - Operating Room (Circulator / Scrub)",
  "rn-ambulatory": "RN - Ambulatory",
  "rn-outpatient-clinic": "RN - Outpatient Clinic",
  "icu-rn": "RN - Intensive Care Unit (ICU)",
  "rn-pcu": "RN - Progressive Care Unit (PCU)",
  "rn-intermediate-care": "RN - Intermediate Care",
  "rn-stepdown": "RN - Stepdown",
  "rn-observation": "RN - Observation Unit",
  "rn-ld": "RN - Labor and Delivery (L&D)",
  "rn-psych": "RN - Psychiatric",
  "nurse-manager-supervisor": "Nurse Manager / Supervisor",
  "rn-endoscopy": "RN - Endoscopy",
  "rn-pacu": "RN - Post-Anesthesia Care Unit (PACU)",
  "rn-oncology": "RN - Oncology",
  "rn-phone-triage": "RN - Phone Triage",
  "rn-case-manager": "RN - Case Manager",
  "rn-wound-care": "RN - Wound Care",
  "rn-picc": "RN - PICC",
  "rn-home-health": "RN - Home Health",
  "rn-ir": "RN - Interventional Radiology (IR)",
  "rn-cath-lab": "RN - Cath Lab",
  "rn-pre-operative": "RN - Pre-Operative",
  "respiratory-tech": "Respiratory Therapist (RRT)",
  "physical-therapist": "Physical Therapist (PT)",
  "physical-therapist-assistant": "Physical Therapist Assistant (PTA)",
  "surgical-tech": "Surgical Technologist",
  "rad-tech": "Radiologic Technologist (X-Ray)",
  "sterile-processing-tech": "Sterile Processing Tech",
  "cardiac-echo-tech": "Cardiac Echo Tech",
  "mri-tech": "MRI Tech",
  "ultrasound-tech": "Ultrasound Tech",
  "patient-care-tech": "Patient Care Technician",
  "medical-lab-tech": "Medical Lab Tech",
  "anesthesia-tech": "Anesthesia Tech",
  "phlebotomist": "Phlebotomist",
  "monitor-tech": "Monitor Tech",
  "paramedic": "Paramedic",
  "ep-tech": "EP Tech",
  "psych-tech": "Psych Tech",
  "pathology-assistant": "Pathology Assistant",
  "endo-gi-tech": "Endo/GI Tech",
  "sleep-tech": "Sleep Tech",
  "ct-tech": "CT Tech",
  "pharmacy-tech": "Pharmacy Tech",
  "medical-physicist": "Medical Physicist",
  "radiology-tech": "Radiology Tech",
  "clinical-social-worker": "Clinical Social Worker",
};

const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");

function validToken(token: string): boolean {
  return /^[a-f0-9]{64}$/.test(token);
}

function validIdentifier(value: string): boolean {
  return validToken(value) || /^[A-Za-z0-9_-]{12}$/.test(value);
}

function requestCondition(identifier: string) {
  return validToken(identifier)
    ? eq(checklistRequestsTable.tokenHash, hashToken(identifier))
    : eq(checklistRequestsTable.shortCode, identifier);
}

function candidateLink(shortCode: string): string {
  const base = (process.env.FRONTEND_URL || "https://healthrecruit-app.onrender.com")
    .replace(/\/+$/, "");
  return `${base}/skill-checklist.html?request=${encodeURIComponent(shortCode)}`;
}

// Admin: create a per-job share link, or send it using configured Resend email.
router.post("/skill-checklist-requests", requireAuth, requireAdminOrRecruiter, async (req: any, res) => {
  try {
    const jobId = String(req.body?.jobId || "");
    const jobTitle = JOBS[jobId];
    const email = String(req.body?.email || "").trim().toLowerCase();

    if (!jobTitle) {
      res.status(400).json({ error: "Invalid job selection" });
      return;
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: "Enter a valid candidate email" });
      return;
    }
    if (email && (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM)) {
      res.status(503).json({
        error: "Email is not configured yet. Set RESEND_API_KEY and verified EMAIL_FROM in the API service environment.",
      });
      return;
    }

    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = hashToken(rawToken);
    const shortCode = randomBytes(9).toString("base64url");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await db.insert(checklistRequestsTable).values({
      tokenHash,
      shortCode,
      jobId,
      jobTitle,
      recipientEmail: email || null,
      createdBy: String(req.user?.username || "").slice(0, 150),
      expiresAt,
    });

    const link = candidateLink(shortCode);

    if (email) {
      const mailResponse = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: process.env.EMAIL_FROM,
          to: [email],
          subject: `Complete your ${jobTitle} skill checklist`,
          text: `Please complete your healthcare skill checklist for ${jobTitle} using this secure link (expires in 7 days): ${link}`,
          html: `<p>Please complete your healthcare skill checklist for <strong>${jobTitle}</strong>.</p><p><a href="${link}">Open your secure checklist</a></p><p>This link expires in 7 days and can be submitted once.</p>`,
        }),
      });

      if (!mailResponse.ok) {
        const providerError = await mailResponse.text();

        req.log?.error(
          {
            status: mailResponse.status,
            providerError,
          },
          "Resend rejected checklist request email"
        );

        await db.delete(checklistRequestsTable).where(
          eq(checklistRequestsTable.tokenHash, tokenHash)
        );

        res.status(502).json({
          error: "Email provider could not send the request. Please check email configuration.",
        });
        return;
      }

      res.setHeader("Cache-Control", "no-store");
      res.status(201).json({ success: true, emailed: true, expiresAt });
      return;
    }

    res.setHeader("Cache-Control", "no-store");
    res.status(201).json({ success: true, link, expiresAt });
  } catch (error) {
    req.log?.error({ err: error }, "Could not create checklist request");
    res.status(500).json({ error: "Could not create checklist request" });
  }
});

// Public: return only the job associated with this valid token.
router.get("/public/skill-checklists/:token", async (req, res) => {
  try {
    const token = String(req.params.token || "");
    if (!validIdentifier(token)) {
      res.status(404).json({ error: "This checklist link is invalid or expired." });
      return;
    }

    const now = new Date();
    const [request] = await db.select({
      jobId: checklistRequestsTable.jobId,
      jobTitle: checklistRequestsTable.jobTitle,
    }).from(checklistRequestsTable).where(and(
      requestCondition(token),
      gt(checklistRequestsTable.expiresAt, now),
      isNull(checklistRequestsTable.submittedAt),
    ));

    if (!request) {
      res.status(404).json({ error: "This checklist link is invalid, expired, or already used." });
      return;
    }

    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.json(request);
  } catch (error) {
    req.log?.error({ err: error }, "Could not validate checklist link");
    res.status(500).json({ error: "Could not validate checklist link" });
  }
});

// Public: atomically consume the one-time token and save into existing ATS submissions.
router.post("/public/skill-checklists/:token", async (req: any, res) => {
  try {
    const token = String(req.params.token || "");
    const data = req.body?.submissionData;

    if (!validIdentifier(token) || !data || typeof data !== "object" || Array.isArray(data)) {
      res.status(400).json({ error: "Invalid checklist submission" });
      return;
    }

    const candidateName = String(data.candidate?.fullName || "").trim().slice(0, 200);
    const candidateEmail = String(data.candidate?.email || "").trim().slice(0, 254);
    const jobId = String(data.job?.id || "");
    const jobTitle = JOBS[jobId];

    if (!candidateName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidateEmail) || !jobTitle) {
      res.status(400).json({ error: "Candidate name, valid email, and job are required." });
      return;
    }

    const now = new Date();
    const result = await db.transaction(async (tx) => {
      const [claimed] = await tx.update(checklistRequestsTable)
        .set({ submittedAt: now })
        .where(and(
          requestCondition(token),
          eq(checklistRequestsTable.jobId, jobId),
          eq(checklistRequestsTable.jobTitle, jobTitle),
          gt(checklistRequestsTable.expiresAt, now),
          isNull(checklistRequestsTable.submittedAt),
        ))
        .returning({ id: checklistRequestsTable.id });

      if (!claimed) return null;

      const safeData = {
        ...data,
        candidate: { ...data.candidate, fullName: candidateName, email: candidateEmail },
        job: { id: jobId, title: jobTitle, badge: String(data.job?.badge || "").slice(0, 100) },
      };

      const [saved] = await tx.insert(skillChecklistsTable).values({
        candidateName,
        jobTitle,
        submissionData: safeData,
        submittedBy: "candidate-link",
      }).returning({
        id: skillChecklistsTable.id,
        candidateName: skillChecklistsTable.candidateName,
        jobTitle: skillChecklistsTable.jobTitle,
        submittedAt: skillChecklistsTable.submittedAt,
      });

      return saved;
    });

    if (!result) {
      res.status(410).json({ error: "This checklist link is invalid, expired, or already used." });
      return;
    }

    res.setHeader("Cache-Control", "no-store");
    res.status(201).json({ success: true, submission: result });
  } catch (error) {
    req.log?.error({ err: error }, "Could not save public checklist submission");
    res.status(500).json({ error: "Could not save checklist. Please contact your recruiter." });
  }
});

export default router;
