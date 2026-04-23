# TrackShellMappingPlatform — CLAUDE.md

This file is read automatically by Claude Code. It tells you everything
you need to work in this codebase without asking questions.

Also read: [RULES.md](RULES.md) — security protocols, quality standards, and behavioral rules.

---

## What this project does

Internal web dashboard for managing the golf course mapping pipeline.
Operators use this to add courses, trigger ML pipeline jobs, monitor
job progress, review and correct AI-generated hole assignments, and
publish finished courses to the consumer API.

Also contains the database schema (PostgreSQL + PostGIS) that all three
projects in this platform share.

---

## Stack

- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS
- MapLibre GL JS (map rendering)
- Mapbox Satellite tiles (imagery)
- Mapbox GL Draw (polygon vertex editing in review UI)
- NextAuth.js (email + password auth, JWT sessions)
- Prisma ORM (type-safe DB queries)
- asyncpg for raw PostGIS spatial queries where Prisma falls short
- PostgreSQL 16 + PostGIS 3.4 (hosted on AWS RDS)
- Redis (AWS ElastiCache) — job status caching
- Deployed on Vercel (frontend) + AWS RDS (database)

---

## Project structure

```
TrackShellMappingPlatform/
  app/
    (auth)/
      login/
        page.tsx              ← Login page
    dashboard/
      layout.tsx              ← Dashboard shell (sidebar, nav)
      courses/
        page.tsx              ← Course library /courses
        new/
          page.tsx            ← Add course form /courses/new
        [id]/
          overview/
            page.tsx          ← Course detail + map preview
          jobs/
            page.tsx          ← Job history for this course
          review/
            page.tsx          ← Manual review UI (PRD 2b)
      jobs/
        page.tsx              ← Global job queue /jobs
      settings/
        page.tsx              ← User management (admin only)
  api/
    auth/[...nextauth]/
      route.ts                ← NextAuth handler
    courses/
      route.ts                ← GET list, POST create
      [id]/
        route.ts              ← GET, PATCH, DELETE course
        features/
          route.ts            ← GET GeoJSON for map
        features/geojson/
          route.ts            ← Full GeoJSON for review UI
        holes/
          [holeId]/
            route.ts          ← GET hole detail
            confirm/
              route.ts        ← POST confirm hole
        publish/
          route.ts            ← POST publish course
        unpublish/
          route.ts            ← POST unpublish course
        review/
          route.ts            ← GET review state
          complete/
            route.ts          ← POST course sign-off
    jobs/
      run/
        route.ts              ← POST trigger pipeline job
      [id]/
        route.ts              ← GET, DELETE job
        status/
          route.ts            ← GET job status (polling)
        stream/
          route.ts            ← GET SSE live progress
    features/
      [featureId]/
        hole/
          route.ts            ← PATCH reassign hole
        type/
          route.ts            ← PATCH change feature type
        geometry/
          route.ts            ← PATCH update geometry
        route.ts              ← DELETE polygon
    corrections/
      route.ts                ← GET correction history
  components/
    map/
      CourseMap.tsx           ← MapLibre GL map component
      PolygonLayer.tsx        ← GeoJSON polygon overlay
      RoutingLines.tsx        ← Hole routing lines (tee→green)
      DrawMode.tsx            ← Mapbox GL Draw integration
    review/
      HoleList.tsx            ← Left panel hole navigation
      Inspector.tsx           ← Right panel polygon detail
      CorrectionActions.tsx   ← Reassign, retype, edit, delete
    ui/                       ← Shared UI components
  lib/
    db.ts                     ← Prisma client singleton
    auth.ts                   ← NextAuth config
    spatial.ts                ← Raw PostGIS query helpers
    redis.ts                  ← Redis client
  prisma/
    schema.prisma             ← Prisma schema
    migrations/               ← All DB migrations
  docs/
    PRD_1_ML_Pipeline.docx
    PRD_2a_Dashboard.docx
    PRD_2b_Review_UI.docx
    PRD_2c_Database_Schema.docx
    PRD_3_Consumer_API.docx
    Decisions_Tracker.docx
  tests/
    api/                      ← API route tests
    components/               ← Component tests
  .env.example
  Dockerfile                  ← For local dev only, Vercel handles prod
```

---

## Run locally

```bash
# 1. Install dependencies
npm install

# 2. Copy and fill in environment variables
cp .env.example .env.local

# 3. Run database migrations
npx prisma migrate dev

# 4. Start dev server
npm run dev

# App available at http://localhost:3000
```

---

## Run tests

```bash
# All tests
npm run test

# Watch mode during development
npm run test:watch

# With coverage
npm run test:coverage
```

---

## Database migrations

Migrations live in `prisma/migrations/`. Always use Prisma migrate —
never edit the database directly.

```bash
# Create a new migration after editing prisma/schema.prisma
npx prisma migrate dev --name describe_your_change

# Apply migrations in production (runs automatically in CI/CD)
npx prisma migrate deploy

# View current schema in Prisma Studio
npx prisma studio
```

**Migration order for fresh setup:**
1. Enable PostGIS extension (raw SQL migration)
2. Create all ENUM types
3. Create users table
4. Create courses table
5. Create holes table
6. Create features table + GIST spatial index
7. Create pipeline_jobs table
8. Create corrections table
9. Add updated_at triggers

---

## Environment variables

```
# Database
DATABASE_URL              PostgreSQL + PostGIS connection string
                          Format: postgresql://user:pass@host:5432/dbname

# Auth
NEXTAUTH_SECRET           Random secret for JWT signing (generate with openssl rand -base64 32)
NEXTAUTH_URL              Full URL of the dashboard e.g. https://dashboard.golfmap.io

# Redis
REDIS_URL                 AWS ElastiCache Redis connection string

# Maps
NEXT_PUBLIC_MAPBOX_TOKEN  Mapbox token for satellite tiles and GL Draw
                          Must be prefixed NEXT_PUBLIC_ to expose to browser

# Internal API
PIPELINE_API_URL          URL of golf-segmentation job runner
                          e.g. https://pipeline.internal.golfmap.io
PIPELINE_API_KEY          Shared secret for authenticating to pipeline API

# AWS (for signed S3 URLs if needed)
AWS_REGION                e.g. ap-northeast-2
AWS_ACCESS_KEY_ID         AWS credentials
AWS_SECRET_ACCESS_KEY     AWS credentials
```

---

## Auth

Two roles: `admin` and `reviewer`.

- All `/dashboard/*` routes require a valid session
- Admin-only actions are enforced server-side on every request
- Never rely on UI hiding alone for access control — always check role in the API route

```typescript
// Example: check admin role in API route
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Unauthorized', { status: 401 })
  if (session.user.role !== 'admin') return new Response('Forbidden', { status: 403 })
  // proceed
}
```

---

## Map components

MapLibre GL is used for all map rendering. Key decisions:

- Satellite base layer from Mapbox (token in NEXT_PUBLIC_MAPBOX_TOKEN)
- All polygons rendered as GeoJSON layers
- Hole routing lines rendered as GeoJSON LineString layer
- Polygon editing uses Mapbox GL Draw plugin
- Always use `MULTIPOLYGON` geometry type — never assume `POLYGON`

```typescript
// Loading course polygons onto the map
map.addSource('course-features', {
  type: 'geojson',
  data: '/api/courses/{id}/features/geojson'
})
```

---

## PostGIS spatial queries

Prisma does not support PostGIS geometry columns natively.
Use raw SQL via `lib/spatial.ts` for any spatial query.

```typescript
// Example: find feature containing a GPS point
import { db } from '@/lib/db'

const feature = await db.$queryRaw`
  SELECT id, feature_type, hole_id
  FROM features
  WHERE ST_Contains(geometry, ST_SetSRID(ST_Point(${lng}, ${lat}), 4326))
  AND course_id = ${courseId}
  LIMIT 1
`
```

---

## Review UI key behaviour

- Flagged holes (needs_review=true) appear at top of hole list, sorted by ascending confidence
- High-confidence holes auto-confirm on course sign-off without explicit reviewer action
- Every correction writes to corrections table BEFORE modifying features/holes tables
- Single reviewer lock: courses have locked_by + locked_at columns, auto-release after 2 hours
- Undo (Ctrl+Z) is single-level per correction action

---

## Branch strategy

```
main      → production (auto-deploys to Vercel)
dev       → staging (auto-deploys to Vercel preview)
feature/* → PR to dev, tests must pass
```

---

## Deployment

Frontend deploys automatically to Vercel on merge to main.
Database migrations run automatically in the GitHub Actions deploy workflow
before Vercel deployment completes.

```bash
# Run migrations manually if needed
npx prisma migrate deploy
```

---

## Do NOT

- Edit prisma/migrations/ files directly — always use prisma migrate dev
- Store geometry as POLYGON — always MULTIPOLYGON
- Trust role checks in the UI only — always enforce server-side
- Expose DATABASE_URL to the browser — it must never be in a NEXT_PUBLIC_ variable
- Write spatial queries in Prisma — use raw SQL in lib/spatial.ts
- Allow corrections without writing to corrections table first
- Allow course sign-off if any hole has confirmed=false and needs_review=true
- Serve courses with status != 'published' through the consumer API

---

## Service boundaries

Three services share the same PostgreSQL/PostGIS database:

```
Browser
  └─ Dashboard (this repo, Vercel)
       ├─ POST /api/jobs/run ──────────► Pipeline API (golf-segmentation)
       │                                   └─ writes ML results → PostgreSQL
       ├─ reads/writes ────────────────► PostgreSQL + PostGIS (AWS RDS)
       └─ job status cache ────────────► Redis (AWS ElastiCache)

Consumer API (separate repo)
  └─ reads published courses ─────────► PostgreSQL (same RDS instance)
```

- Dashboard is the only service that writes corrections, holes, and triggers jobs.
- Pipeline API writes feature geometry and confidence scores; it does not serve HTTP to the browser.
- Consumer API is read-only and only sees rows where `courses.status = 'published'`.

---

## Architecture decisions reference

All PRDs are in /docs. Key decisions already locked:

- MULTIPOLYGON geometry (not POLYGON)
- Single-tenant platform
- Soft delete for polygons (deleted_at column)
- PostGIS SRID 4326 WGS84 for all geometry
- Single reviewer lock per course (locked_by, locked_at on courses table)
- All courses visible to all reviewers (no assignment-based access in v1)
- Vertex drag geometry editing via Mapbox GL Draw
- Hole routing lines shown on course overview map
- Email on job failure only via Resend
- Manual vs auto confirmation tracked via confirmation_type column on holes
