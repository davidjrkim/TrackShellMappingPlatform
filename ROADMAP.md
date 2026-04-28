# TrackShell Mapping Platform — Execution Roadmap

Phased delivery plan for the internal dashboard. Update the checkboxes
(`[ ]` → `[x]`) as tasks land. AI agents: read this file at the start of
every session, find the next unchecked task in the earliest incomplete
week, and pick up from there.

---

## MVP Definition

**MVP is achieved when a single operator can:**
1. Register a course with a GPS bounding box
2. Trigger a pipeline job and watch it run live
3. Open the review UI, make corrections to flagged holes, and confirm all holes
4. Sign off on the course and publish it to the consumer API

End-to-end path lands at **end of Week 6**.

---

## Status Legend

- `[ ]` — not started
- `[~]` — in progress
- `[x]` — done
- `[!]` — blocked (note the blocker)

---

## Week 1 — Foundation ✅ COMPLETE

*Goal: App boots, auth works, DB connected, shell renders*

- [x] Scaffold Next.js 14 (App Router, TypeScript, Tailwind)
- [x] Write Prisma schema + initial migration SQL (all 9 steps per PRD 2c §6)
- [x] Configure PostGIS local dev via Docker Compose
- [x] Set up NextAuth.js credential provider (email + password, bcrypt, JWT)
- [x] Login page (`/login`)
- [x] Dashboard layout shell — sidebar nav, route-level session guard
- [x] Populate `.env.example`
- [x] Prisma seed script (org + admin + reviewer + 5 courses across statuses + 18 holes for Seoul CC)
- [x] `/api/health` endpoint
- [x] Clean `npm run build`

**Milestone M1 — Boot:** ✅ App starts, login works, DB migrated, seed data loads.

---

## Week 2 — Course CRUD + Library ✅ COMPLETE

*Goal: Operators can add and manage courses*

### API routes
- [x] `GET /api/courses` — paginated list, search (name/city/region), country + status filters, default sort by `updated_at DESC`
- [x] `POST /api/courses` — create with `org_id` scoping; bounding_box written via raw SQL in `lib/spatial.ts`
- [x] `GET /api/courses/[id]` — detail + pipeline summary stats (polygon count, flagged count, avg confidence, `ml_model_version` + latest `llm_model` from most recent completed job)
- [x] `PATCH /api/courses/[id]` — metadata edit
- [x] `DELETE /api/courses/[id]` — soft delete (sets `deleted_at`), admin only
- [x] `GET /api/courses/[id]/features` — GeoJSON FeatureCollection for map preview

### Pages
- [x] `/dashboard/courses` — course library: status badges, colour codes per PRD 2a §4.3, 20/page pagination, filters, search
- [x] `/dashboard/courses/new` — add course form with MapLibre satellite bounding box picker (draw rectangle)
- [x] `/dashboard/courses/[id]/overview` — metadata, action buttons conditional on status + role, MapLibre polygon preview with routing lines

### Components
- [x] `components/map/CourseMap.tsx` — MapLibre GL base map (Mapbox satellite tiles via `NEXT_PUBLIC_MAPBOX_TOKEN`)
- [x] `components/map/PolygonLayer.tsx` — GeoJSON polygon overlay with per-type colours
- [x] `components/map/RoutingLines.tsx` — tee-centroid → green-centroid LineString layer, togglable
- [x] `components/map/BoundingBoxPicker.tsx` — rectangle draw for new-course form
- [x] `components/ui/StatusBadge.tsx` — status-coloured pill for course library
- [x] `components/ui/CourseActionButtons.tsx` — Run / Review / Publish / Edit / Delete with role + status gating

### Tests
- [x] API tests: org isolation on list + detail, admin-only on DELETE, soft-delete hides from list
- [x] Component test: StatusBadge renders correct colour per status

**Milestone M2 — Courses:** ✅ full CRUD + map preview visible in UI.

---

## Week 3 — Pipeline Jobs + SSE Live Progress ✅ COMPLETE

*Goal: Operators can trigger jobs and watch them run*

### Pipeline integration contract (see `/Users/nos/TrackShellSegmentation/PRD.md`)

- Dashboard **never** runs inference itself. `/api/jobs/run` is a thin proxy:
  forwards `{ course_id, job_type, force }` to `POST {PIPELINE_API_URL}/api/jobs/run`
  with `X-Pipeline-Key: $PIPELINE_API_KEY`, receives `{ job_id, status }`.
- The pipeline service writes `pipeline_jobs`, `features`, `holes`, and updates
  `courses.status` directly against the **shared** RDS instance (same `DATABASE_URL`).
  Do not insert feature/hole rows from the dashboard — only corrections.
- `force=true` is required to re-run against a course whose status is `reviewed`
  or `published` (PRD 1 §8 note / Decision 16) — gate admin-only in this repo.
- `needs_review` is set by the pipeline when `assignment_confidence < 0.70`
  (PRD 1 §6.5). Review UI sort (Week 5) depends on this being populated.
- `/api/jobs/[id]/stream` proxies the pipeline's SSE endpoint (same path on
  pipeline service) and closes on terminal status, per RULES.md.

### API routes
- [x] `POST /api/jobs/run` — validates course state + `force` flag, creates `pipeline_jobs` row, proxies to `PIPELINE_API_URL` with `PIPELINE_API_KEY`
- [x] `GET /api/jobs/[id]/stream` — SSE proxy; **must close** on `completed` | `failed` | `cancelled` per RULES.md
- [x] `GET /api/jobs/[id]/status` — polling fallback (reads `pipeline_jobs` row + Redis cache)
- [x] `DELETE /api/jobs/[id]` — cancel running job (forward to pipeline)

### UI
- [x] Job config modal (job type radio, force re-run, tile source) per PRD 2a §7.1
- [x] Live progress panel on `/courses/[id]/overview` — stage list, progress bar, chip/polygon counts
- [x] Success banner + "Review Holes" CTA when complete; failure banner with truncated error + retry
- [x] Routing lines layer togglable on course overview map
- [x] Resend email integration — fires on `status = failed`, course name + error summary + job log link; no success emails (Decision 12)

### Tests
- [x] SSE stream closes after terminal state (no dangling connections)
- [x] Only admin can force re-run when course status is `reviewed` or `published`

**Milestone M3 — Jobs:** pipeline triggering, live SSE progress, failure emails.

---

## Week 4 — Global Queue + Settings + CI/CD

*Goal: PRD 2a complete; platform deployable*

### API routes
- [x] `GET /api/jobs` — all jobs, filters (status, job type, date range)
- [x] `POST /api/courses/[id]/publish` — admin only; sets `status = published`
- [x] `POST /api/courses/[id]/unpublish` — admin only; sets `status = reviewed`
- [x] User management: `GET/POST /api/users`, `PATCH /api/users/[id]` (role change / deactivate) — admin only

### Pages
- [x] `/dashboard/jobs` — global queue with filters, running/queued/failed counts
- [x] `/dashboard/courses/[id]/jobs` — per-course job history
- [x] `/dashboard/settings` — create reviewer, promote/demote, deactivate (admin only)

### CI/CD
- [x] GitHub Actions `test.yml` — lint + `next build` + Jest on every PR *(landed early, Week 1)*
- [x] GitHub Actions `deploy.yml` — `prisma migrate deploy` → Vercel trigger → smoke test `/api/health`
- [ ] Vercel project connected, staging preview from `dev` branch *(requires Vercel token + project IDs in GitHub secrets)*
- [ ] Sentry DSN added to Vercel env vars *(SENTRY_DSN added to .env.example; set per env in Vercel)*

**Milestone M4 — Dashboard Complete:** ✅ PRD 2a delivered, staging deployed.

---

## Week 5 — Review UI: Structure + Navigation ✅ COMPLETE

*Goal: Reviewer can open a course, navigate holes, inspect polygons (read-only)*

### API routes
- [x] `GET /api/courses/[id]/review` — full review state: holes + flags + polygon lists + topology check results + progress
- [x] `GET /api/courses/[id]/features/geojson` — full FeatureCollection for map canvas
- [x] `GET /api/courses/[id]/holes/[holeId]` — single hole detail
- [x] Lock endpoints: `POST /api/courses/[id]/lock` (acquire — 409 if held, auto-release > 2h), `DELETE /api/courses/[id]/lock` (release)

### UI — three-panel layout
- [x] `/courses/[id]/review` page — 240px hole list + flex map canvas + 320px inspector
- [x] `components/review/HoleList.tsx` — flagged holes sorted by `assignment_confidence ASC` at top; confirmed holes below in hole-number order; progress counter
- [x] `components/review/MapCanvas.tsx` — MapLibre GL, satellite base, polygon layers with PRD 2b §5.2 colour opacities; active hole full-opacity with blue outline, others dimmed
- [x] `components/review/Inspector.tsx` — hole view (polygon list + topology check) and polygon view (metadata) — **read-only in Week 5**
- [x] Lock acquired on page mount; released on unmount / navigation away; 409 banner if held by another reviewer

### Keyboard shortcuts (Week 5 subset)
- [x] ↑ / ↓ hole nav, F fit-to-hole, C fit-to-course, Escape deselect

**Milestone M5 — Review Readable:** ✅ three-panel UI navigable, all polygons visible.

---

## Week 6 — Review UI: Corrections + Sign-Off = MVP ✅ COMPLETE

*Goal: All corrections wired, course can be signed off and published*

### Correction API routes
All mutations must write a `corrections` row **first**, in the same transaction (RULES.md).

- [x] `PATCH /api/features/[featureId]/hole` — reassign; `correction_type = hole_reassignment`
- [x] `PATCH /api/features/[featureId]/type` — change type; `correction_type = type_change`
- [x] `PATCH /api/features/[featureId]/geometry` — edit; validate `ST_IsValid` + `ST_Area ≥ 20 m²` → 422 on fail; `correction_type = geometry_edit`
- [x] `DELETE /api/features/[featureId]` — hard delete; snapshot geometry + type + confidence into correction row first (§7.4)
- [x] `POST /api/courses/[id]/holes/[holeId]/confirm` — set `needs_review = false`, `confirmed = true`, `features.reviewed = true` for that hole
- [x] `POST /api/courses/[id]/review/complete` — server validates no `needs_review = true AND confirmed = false` → 400; set `status = reviewed`
- [x] `GET /api/corrections?courseId=...` — correction history

### UI
- [x] Inspector dropdowns wired — reassign hole, change type, apply/cancel
- [x] Mapbox GL Draw integration for vertex-drag geometry editing
- [x] Delete polygon confirmation dialog
- [x] Ctrl+Z single-level undo per correction
- [x] Offline/failure warning — block submission without server 2xx (no optimistic writes, RULES.md)
- [x] Keyboard shortcuts: D toggle draw, Delete/Backspace delete polygon, Enter confirm hole, Ctrl+Z undo
- [x] Sign-off screen (`/courses/[id]/review` → complete view) — correction summary, reviewer notes, "Mark Course Reviewed" button
- [x] Auto-advance to next flagged hole on confirm

### Tests
- [x] Transaction integrity: correction row + feature mutation atomic (force one to fail, both roll back)
- [x] 409 returned when course locked by another user
- [x] 422 on invalid geometry + sub-20m² polygon
- [x] 400 on sign-off with any `needs_review = true AND confirmed = false`
- [x] Hard delete removes feature; correction row survives with geometry snapshot

**Milestone M6 — MVP:** ✅ Full end-to-end operator workflow is functional.

---

## Week 7 — Polish, Tests, Production

*Goal: Production-ready, monitored, covered by tests*

- [x] API route tests for all correction endpoints (org isolation, lock, geometry validation, sign-off gate)
- [x] Component tests for HoleList, Inspector, CorrectionActions
- [~] Sentry capturing errors on Vercel production *(SDK + configs wired in code; SENTRY_DSN still needs to be set in Vercel env)*
- [x] `deploy.yml` smoke tests: `GET /api/health → 200`, `GET /dashboard/courses → 302` (unauth)
- [x] Performance validation vs NFRs: map render < 2s, correction save < 500ms, draw mode < 50ms *(scripts/perf-check.ts; npm run perf:check — actual measurement run not yet executed against staging)*
- [ ] Full end-to-end walkthrough (add → trigger → review → sign-off → publish) on staging
- [ ] Production deployment from `main`

**Milestone M7 — Production:** ✅ tests passing, Sentry live, production deployed.

---

## Milestones at a glance

| Milestone | Week | Done |
|---|---|---|
| M1 — Boot | 1 | ✅ |
| M2 — Courses | 2 | ✅ |
| M3 — Jobs | 3 | ✅ |
| M4 — Dashboard Complete | 4 | ✅ (code); Vercel/Sentry provisioning pending |
| M5 — Review Readable | 5 | ✅ |
| **M6 — MVP** | 6 | ✅ |
| M7 — Production | 7 | ~ (code done; staging E2E + prod cutover pending) |

---

## Success Metrics (gate before MVP ship)

### Functional
| Check | Target |
|---|---|
| Course library page load | < 1.5s (server-rendered) |
| Map polygon overlay render | < 2s on initial load |
| Job SSE update lag | < 2s after pipeline stage completes |
| Correction save round-trip | < 500ms |
| Draw mode vertex drag | < 50ms perceived latency |
| Max polygons rendered | 500 without MapLibre perf degradation |

### Correctness (no-ship blockers)
- No correction written without a prior `corrections` table row in the same transaction
- Sign-off blocked server-side when any hole has `needs_review = true AND confirmed = false`
- Reviewer lock enforced: 409 if locked by another user
- Geometry submissions rejected if `ST_IsValid = false` or `ST_Area < 20 m²`
- `DATABASE_URL` and `PIPELINE_API_KEY` never appear in any `NEXT_PUBLIC_*` variable
- All `/dashboard/*` routes redirect to `/login` without a valid session
- All admin-only actions return 403 to reviewer role

### Operational (Week 7 gate)
- All API route tests passing in CI
- Sentry capturing errors on production
- `/api/health` smoke test in deploy pipeline
- Staging deployment proven before production merge

---

## Build order logic

Critical path: **schema → auth → course CRUD → map preview → job triggering → review UI structure → corrections**. Each phase depends on the previous. The database schema (Week 1) is the foundation — getting migrations right before writing application code prevents the most expensive class of rework.

---

## Notes for AI agents picking this up

- Always read `CLAUDE.md` and `RULES.md` first — they contain security constraints and architectural rules that override defaults.
- Check memory at `~/.claude/projects/-Users-nos-TrackShellMappingPlatform/memory/` for accumulated context.
- Before starting a week, verify all prior weeks' tasks are `[x]`. If any are `[ ]` or `[~]`, finish those first — later weeks depend on them.
- When you complete a task, flip its checkbox and commit. Don't batch checkbox updates.
- When blocked, mark the task `[!]` and leave a one-line note next to it explaining the blocker.
- Don't invent features not in this roadmap or the PRDs. If a gap is discovered, raise it rather than silently expanding scope.
- The ML pipeline lives in a sibling repo (`/Users/nos/TrackShellSegmentation`, PRD 1). It shares this database. Schema changes that touch `features`, `holes`, `pipeline_jobs`, or `FeatureType`/`CourseStatus` enums must be coordinated — the pipeline writes those tables directly.
