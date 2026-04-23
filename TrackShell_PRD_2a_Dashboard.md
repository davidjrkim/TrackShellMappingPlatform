# 🗺️ TrackShell Course Mapping Platform — PRD 2a: Course Management Dashboard

**Version:** 1.0 | **April 2026**

| Field | Value |
|---|---|
| Status | 🟡 Draft |
| Owner | David |
| Stack | Next.js 14 (App Router) · Tailwind · MapLibre GL · PostgreSQL/PostGIS |
| Users | Internal operators only (admin + reviewer roles) |
| Depends On | PRD 2c (Database Schema), PRD 1 (ML Pipeline) |
| Last Updated | April 2026 |

---

## 1. Purpose & Scope

This PRD defines the internal web dashboard used by operators to manage the golf course mapping pipeline. It covers course intake, pipeline job triggering, job status monitoring, and the mapped course library. The manual review UI for flagged hole assignments is covered separately in PRD 2b.

**Scope:**
- ✅ Covers: course CRUD, pipeline job trigger UI, job status tracking, course library view, and basic operator auth.
- ❌ Does not cover: the manual review UI (PRD 2b), the consumer-facing API (PRD 3), or public user accounts.

---

## 2. Users & Roles

The dashboard has two internal roles. There are no public-facing users in this PRD.

| Role | Permissions | Typical User |
|---|---|---|
| Admin | Full access: add/edit/delete courses, trigger jobs, publish courses, manage reviewer accounts | David (platform owner) |
| Reviewer | Read all courses, access review UI for flagged holes, confirm or correct assignments. Cannot delete courses or trigger new pipeline runs. | Contracted course verifier |

---

## 3. Information Architecture

```
/dashboard
  ├── /courses                   Course library (list + filters)
  │     ├── /courses/new         Add new course form
  │     └── /courses/[id]        Course detail page
  │           ├── /overview      Metadata + status + map preview
  │           ├── /jobs          Job history for this course
  │           └── /review        Review UI — flagged holes (PRD 2b)
  ├── /jobs                      Global job queue (all courses)
  └── /settings                  User management (admin only)
```

---

## 4. Course Library — `/courses`

### 4.1 Purpose

The course library is the primary landing page. It shows every course in the system with its current mapping status, and is the entry point to all other actions.

### 4.2 Layout & Wireframe

```
● ● ●  Golf Mapping Platform — /courses

[+ Add Course]                                    [🔍 Search courses...]
Filter:  [All ▾]  [Country ▾]  [Status ▾]

┌──────────────────────────────────────────────────────────────────┐
│  #   Course Name          Country  Holes  Status        Actions  │
├──────────────────────────────────────────────────────────────────┤
│  1   Woo Jeong Hills CC   KR       18     ● Published   [View]   │
│  2   Seoul CC             KR       18     ● Assigned    [View]   │
│  3   Jeju Lakeside        KR       18     ● Processing  [View]   │
│  4   Royal Copenhagen     DK       18     ● Unmapped    [Run]    │
│  5   Bella Center GC      DK       18     ● Failed      [Retry]  │
└──────────────────────────────────────────────────────────────────┘
Showing 1–20 of 47 courses          [< Prev]  Page 1 of 3  [Next >]
```

### 4.3 Course Status Colours

| Status | Colour | Meaning | Primary Action |
|---|---|---|---|
| `unmapped` | Grey | In system, no pipeline run yet | "Run Pipeline" |
| `processing` | Blue | Pipeline job currently running | "View Job" (live) |
| `segmented` | Indigo | Polygons extracted, hole assignment not yet run | "Continue Job" |
| `assigned` | Amber | Holes assigned, awaiting human review | "Review Now" |
| `reviewed` | Teal | Human confirmed all holes, ready to publish | "Publish" |
| `published` | Green | Live on consumer API | "View on API" |
| `failed` | Red | Pipeline error — check job log | "Retry" |

### 4.4 Filters & Search

- Free-text search: matches on course name (English and local), city, region
- Country filter: multi-select dropdown (ISO codes with flag emoji)
- Status filter: multi-select checkboxes for all status values
- Default sort: most recently updated first
- Pagination: 20 courses per page

---

## 5. Add New Course — `/courses/new`

### 5.1 Purpose

Operators manually register a course before the pipeline can run on it. The form collects the minimum metadata needed to identify the course and locate it on a map.

### 5.2 Form Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| Course name (English) | Text input | Yes | Official English name |
| Course name (local) | Text input | No | Korean, Danish, etc. |
| Country | Dropdown (ISO) | Yes | Two-letter country code |
| Region / Province | Text input | No | |
| City | Text input | No | |
| Number of holes | Select: 9/18/27 | Yes | Defaults to 18 |
| GPS bounding box | Map picker or coords input | Yes | Used by pipeline to fetch satellite tiles. Operator draws rectangle on map or enters lat/lng bounds manually. |
| Notes | Textarea | No | Internal notes for reviewers |

> **UX NOTE:** The GPS bounding box picker is the most critical field. Use an embedded MapLibre GL map where the operator draws a rectangle around the course. Show satellite layer by default. Pre-populate with a location search so operators can type the course name and jump to it.

### 5.3 On Submit

- Validate all required fields
- Insert row into `courses` table with `status = unmapped`
- Redirect to `/courses/[id]/overview`
- Show success toast: "Course added. Run the pipeline to begin mapping."

---

## 6. Course Detail — `/courses/[id]`

### 6.1 Overview Tab

```
● ● ●  Seoul CC — Overview

Seoul Country Club                              Status: ● Assigned
South Korea · Seoul · 18 holes
Added: 2026-03-12    Last updated: 2026-04-15

┌─────────────────────────────┐  ┌────────────────────────────────┐
│                             │  │  Pipeline Summary              │
│   [MapLibre satellite map]  │  │  Polygons generated:   284     │
│   colour-coded polygons     │  │  Holes assigned:        18     │
│   overlaid on course        │  │  Holes needing review:   3     │
│                             │  │  Segmentation mIoU:    0.761   │
│                             │  │  Confidence (avg):     0.84    │
└─────────────────────────────┘  └────────────────────────────────┘

[✏ Edit Metadata]   [▶ Re-run Pipeline]   [✓ Publish]   [🗑 Delete]
```

### 6.2 Map Preview

The overview tab embeds a MapLibre GL map centred on the course. Polygon features are loaded as a GeoJSON layer from the internal API. Each feature type renders in a distinct colour matching the review UI colour scheme. Clicking a polygon shows a tooltip with feature type, hole number, and confidence score.

| Feature | Style |
|---|---|
| Green | Dark green fill |
| Fairway | Light green fill |
| Tee box | Yellow fill |
| Bunker | Sand/tan fill |
| Water hazard | Blue fill |
| Flagged holes | Red outline border on all polygons belonging to that hole |
| Hole routing lines | Thin white line per hole — tee centroid → green centroid |

**Hole routing lines** are rendered as a GeoJSON `LineString` layer in MapLibre, drawn from the tee centroid to the green centroid stored in the `holes` table (Decision 11). This gives operators an immediate visual read of the course routing without needing to inspect each hole individually. The layer is togglable via the existing layer toggle control.

### 6.3 Action Buttons

| Button | Visible When | Behaviour |
|---|---|---|
| Run Pipeline | `status = unmapped` | Opens job config modal → triggers `POST /api/jobs/run` |
| Re-run Pipeline | `status = any` (admin only) | Confirmation dialog warning it will overwrite existing data unless status is `"reviewed"` or `"published"` |
| Review Holes | `status = assigned` | Navigates to `/courses/[id]/review` (PRD 2b) |
| Publish | `status = reviewed` (admin only) | Sets `status = published`, makes course live on consumer API |
| Unpublish | `status = published` (admin only) | Sets `status = reviewed`, removes from consumer API |
| Edit Metadata | always | Opens inline edit form for name, region, city, notes |
| Delete Course | admin only | Soft delete with confirmation dialog. Requires typing course name to confirm. |

### 6.4 Jobs Tab

Lists all pipeline job runs for this course in reverse chronological order. Used for debugging and audit.

```
● ● ●  Seoul CC — Jobs

Job History                                      [▶ Run New Job]

┌──────────────┬────────────┬──────────┬──────────┬─────────────┐
│ Job ID       │ Type       │ Status   │ Duration │ Triggered   │
├──────────────┼────────────┼──────────┼──────────┼─────────────┤
│ a3f2...      │ full       │ ✅ Done   │ 4m 12s   │ David       │
│ b91c...      │ full       │ ❌ Failed │ 0m 48s   │ David       │
│ 44de...      │ segmentation│ ✅ Done  │ 3m 04s   │ David       │
└──────────────┴────────────┴──────────┴──────────┴─────────────┘
Click any row to view full job log and error details.
```

---

## 7. Pipeline Job Trigger

### 7.1 Job Config Modal

When an operator clicks "Run Pipeline", a modal appears with job configuration options before the job is submitted.

```
● ● ●  Run Pipeline — Seoul CC

Job Type:
  ● Full pipeline  (preprocessing → segmentation → assignment → DB write)
  ○ Segmentation only
  ○ Hole assignment only  (requires existing segmented polygons)

Options:
  ☐ Force re-run even if course has reviewed/published data
  ☐ Skip LLM hole assignment (manual review only)

Satellite tile source:
  ● Auto (use stored bounding box)
  ○ Upload custom GeoTIFF

                             [Cancel]   [▶ Start Job]
```

### 7.2 Live Job Progress

Once started, the course detail page shows a live progress panel via server-sent events. The operator does not need to refresh.

```
● ● ●  Seoul CC — Job Running

● Pipeline running...                              Started: 14:32:07

[████████████████████░░░░░░░░░░░]  Stage 3 of 5

✅  Stage 1 — Preprocessing         (0m 18s)
✅  Stage 2 — Segmentation           (2m 44s)   mIoU: 0.761
⏳  Stage 3 — Polygon extraction     running...
○   Stage 4 — Hole assignment
○   Stage 5 — DB write

Chips processed: 312 / 312
Polygons generated: 284

                                              [✕ Cancel Job]
```

### 7.3 Job Completion

- **On success:** status badge updates in real time, success banner appears, "Review Holes" button becomes visible if any holes were flagged
- **On failure:** red error banner with truncated error message, "View Full Log" link, "Retry" button. The FastAPI job runner also sends an **email alert** to the operator via **Resend** (free tier) when `job.status = failed` (Decision 12). The email includes: course name, error summary, and a direct link to the job log. Success emails are not sent — dashboard-only for success.
- SSE connection closes automatically on job completion or failure

---

## 8. Global Job Queue — `/jobs`

A dedicated page showing all pipeline jobs across all courses. Primarily for admins monitoring overall system health.

```
● ● ●  Job Queue — All Courses

Filter: [All statuses ▾]  [All job types ▾]  [Date range ▾]

┌────────────────┬──────────────────┬────────┬──────────┬──────────┐
│ Course         │ Job ID           │ Status │ Duration │ Started  │
├────────────────┼──────────────────┼────────┼──────────┼──────────┤
│ Jeju Lakeside  │ f2a1...          │ ⏳ Run  │ 1m 22s   │ 14:45    │
│ Seoul CC       │ a3f2...          │ ✅ Done │ 4m 12s   │ 14:32    │
│ Bella Center   │ 99bc...          │ ❌ Fail │ 0m 48s   │ 13:10    │
└────────────────┴──────────────────┴────────┴──────────┴──────────┘
System:  1 job running · 0 queued · 2 failed today
```

---

## 9. Internal API Endpoints

The dashboard's Next.js backend exposes these API routes consumed by the frontend. These are internal routes — not the consumer-facing API (PRD 3).

| Method | Route | Description |
|---|---|---|
| GET | `/api/courses` | List courses with filters, search, pagination |
| POST | `/api/courses` | Create new course |
| GET | `/api/courses/[id]` | Get course detail including pipeline summary stats |
| PATCH | `/api/courses/[id]` | Update course metadata |
| DELETE | `/api/courses/[id]` | Soft delete course (admin only) |
| GET | `/api/courses/[id]/features` | Get all GeoJSON polygons for map preview |
| POST | `/api/jobs/run` | Trigger new pipeline job |
| GET | `/api/jobs/[id]/status` | Poll job status |
| GET | `/api/jobs/[id]/stream` | SSE stream for live job progress |
| DELETE | `/api/jobs/[id]` | Cancel running job |
| GET | `/api/jobs` | List all jobs (global queue) |
| POST | `/api/courses/[id]/publish` | Set `status = published` (admin only) |
| POST | `/api/courses/[id]/unpublish` | Set `status = reviewed` (admin only) |

---

## 10. Authentication & Authorization

### 10.1 Strategy

Email + password authentication via NextAuth.js with JWT sessions. No OAuth in v1 — the user base is too small to justify the complexity. Passwords hashed with bcrypt.

### 10.2 Session & Route Protection

- All `/dashboard/*` routes require a valid session. Unauthenticated requests redirect to `/login`.
- Admin-only actions (delete, publish, re-run with force, user management) check `role === "admin"` server-side on every request — not just in the UI.
- Reviewer role cannot access `/settings` and cannot see destructive action buttons.

### 10.3 User Management — `/settings`

Admin-only page. Allows creating new reviewer accounts (email + temporary password), promoting/demoting roles, and deactivating accounts. No self-registration.

---

## 11. Tech Stack

| Layer | Choice | Rationale |
|---|---|---|
| Framework | Next.js 14 (App Router) | API routes + SSR in one project; well-suited for dashboard UIs |
| Styling | Tailwind CSS | Fast iteration, consistent spacing and colour tokens |
| Map | MapLibre GL JS | Open-source, no API key cost, excellent GeoJSON layer support |
| Map tiles | Stadia Maps (satellite) | Affordable satellite tiles; Mapbox alternative if quality insufficient |
| Auth | NextAuth.js | JWT sessions, easy credential provider setup |
| DB client | Prisma ORM | Type-safe queries, migration tooling, PostGIS geometry via raw SQL where needed |
| SSE | Native Next.js streaming | No extra dependency for job progress streams |
| Email alerts | Resend (free tier) | Failure-only job notifications (Decision 12) |
| Frontend hosting | Vercel | Next.js dashboard (Decision 7) |
| Database | AWS RDS PostgreSQL + PostGIS | Managed PostGIS, shared with consumer API (Decision 7) |
| API / job runner | AWS ECS Fargate | Always-on containers for FastAPI + ML job runner (Decision 7) |
| Cache | AWS ElastiCache Redis | Caching layer for API and session data (Decision 7) |
| Container registry | AWS ECR | Docker images for pipeline and API containers (Decision 7) |
| Object storage | AWS S3 | Model checkpoints, satellite tiles, pipeline stage checkpoints (Decision 7) |
| IaC | Terraform | Infrastructure provisioning (Decision 7) |
| CI/CD | GitHub Actions + Docker | Build, test, and deploy pipeline (Decision 7) |

---

## 12. Non-Functional Requirements

| Requirement | Target |
|---|---|
| Page load (course library) | < 1.5s (server-rendered, paginated) |
| Map tile load | < 3s for course polygon overlay on fast connection |
| Job SSE latency | < 2s lag between pipeline stage completion and UI update |
| Uptime | 99% — internal tool, maintenance windows acceptable |
| Concurrent users | ≤ 10 (internal only — no scaling concerns in v1) |
| Browser support | Chrome, Safari, Firefox — latest 2 versions |
| Mobile | Not required for v1 — desktop operators only |

---

## 13. Decisions Applied

All open questions from this PRD are resolved.

| # | Question | Decision | Tracker |
|---|---|---|---|
| 1 | Hosting: Vercel + Supabase vs self-hosted VPS? | **Full AWS stack** — ECS Fargate (API/pipeline), RDS PostgreSQL/PostGIS (DB), ElastiCache Redis (cache), ECR (containers), S3 (storage), Terraform (IaC), GitHub Actions + Docker (CI/CD). Vercel for Next.js frontend. See §11. | Decision 7 |
| 2 | Routing lines on map preview or raw polygons only? | **Include routing lines** — GeoJSON `LineString` layer per hole, tee centroid → green centroid. Togglable. Low cost, high diagnostic value. See §6.2. | Decision 11 |
| 3 | Email notifications on job complete/fail or dashboard-only? | **Email on failure only** via Resend free tier. Success is dashboard-only. See §7.3. | Decision 12 |
| 4 | All courses visible to reviewers, or assignment-based access? | **All courses visible** to all reviewers in v1. No assignment table. Informal coordination. Revisit if reviewer team exceeds 5. | Decision 13 |

---

*TrackShell Course Mapping Platform · PRD 2a: Course Management Dashboard · v1.0*
