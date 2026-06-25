# HealthRecruit ATS/CRM

A production-ready Healthcare Recruiting ATS/CRM SaaS application for managing healthcare candidates through a full recruiting pipeline.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000 / env PORT)
- `pnpm --filter @workspace/ats-crm run dev` — run the React frontend
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string, `SESSION_SECRET` — JWT signing secret

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite, wouter (routing), TanStack Query, shadcn/ui, framer-motion, recharts
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- Auth: JWT (stored in localStorage as `ats_token`)
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/ats-crm/` — React+Vite frontend, routes at `/`
- `artifacts/api-server/` — Express API server, routes at `/api`
- `lib/api-spec/openapi.yaml` — OpenAPI spec (source of truth for contracts)
- `lib/api-client-react/src/generated/` — Auto-generated React Query hooks + Zod schemas
- `lib/db/src/schema/index.ts` — Database schema (Drizzle ORM)
- `artifacts/api-server/src/routes/` — All backend route handlers

## Architecture decisions

- JWT auth: token stored in `localStorage` as `ats_token`; all API calls inject it via `setAuthTokenGetter` in `lib/api-client-react/src/custom-fetch.ts`
- Contract-first API: OpenAPI spec → Orval codegen → React Query hooks. Always run codegen after spec changes.
- Pipeline stages: `new_lead → contacted → interested → submitted → interview → offer → placed → rejected`
- Duplicate detection via email/phone match on the backend `/api/candidates/duplicates` endpoint
- Kanban drag-and-drop uses HTML5 draggable API (no external DnD library)

## Product

- **Dashboard**: KPI cards (total candidates, new today, active pipeline, placed, duplicates) + bar/pie charts for specialty breakdown, state breakdown, pipeline breakdown, weekly growth
- **Candidates**: Searchable/filterable table with bulk delete, status badges, pagination
- **Candidate Detail**: Full profile edit, notes (CRM), activity log (calls/emails/meetings), tags, pipeline stage control, quick-dial/email links
- **Pipeline**: Kanban board with drag-and-drop across 8 stages
- **Search**: Full-text search across name, phone, email, specialty, notes with live debounce
- **Import**: CSV upload with preview, import history log
- **Duplicates**: Email/phone duplicate detection with ignore or merge actions

## Default Credentials

- Username: `admin`
- Password: `admin123`

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Always run `pnpm --filter @workspace/api-spec run codegen` after changing `lib/api-spec/openapi.yaml`
- The bcrypt password hash must be generated using bcryptjs from the `artifacts/api-server` directory (it uses `$2b$` prefix, not `$2a$`)
- JWT secret falls back to `"healthrecruit-secret-key"` if `SESSION_SECRET` env var is not set

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
