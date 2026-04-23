# TrackShellMappingPlatform

Internal web dashboard for managing the golf course mapping pipeline.
Operators add courses, trigger the ML segmentation pipeline, review
AI-generated hole assignments, and publish finished courses to the
consumer API.

Also contains the shared PostgreSQL/PostGIS database schema used by
all three projects in this platform.

Part of the [Golf Course Mapping Platform](#related-repositories).

---

## What operators can do

- **Add courses** — register a new course with GPS bounding box
- **Trigger the ML pipeline** — runs DeepLabv3+ segmentation + LLM hole assignment
- **Monitor jobs** — live progress via server-sent events
- **Review flagged holes** — correct AI assignments on a satellite map
- **Publish courses** — make a course live on the consumer API

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| Map | MapLibre GL JS |
| Satellite imagery | Mapbox Satellite tiles |
| Polygon editing | Mapbox GL Draw |
| Auth | NextAuth.js |
| ORM | Prisma |
| Database | PostgreSQL 16 + PostGIS 3.4 (AWS RDS) |
| Cache | Redis (AWS ElastiCache) |
| Hosting | Vercel (frontend) |

---

## Requirements

- Node.js 20+
- PostgreSQL 16 with PostGIS 3.4 extension
- Redis
- Mapbox account (for satellite tiles)
- Anthropic API key (used by golf-segmentation pipeline)

---

## Quick start

```bash
# Clone
git clone https://github.com/davidjrkim/TrackShellMappingPlatform
cd TrackShellMappingPlatform

# Install dependencies
npm install

# Configure environment
cp .env.example .env.local
# Edit .env.local with your credentials

# Run database migrations
npx prisma migrate dev

# Start development server
npm run dev

# Dashboard available at http://localhost:3000
```

---

## Database schema

The database is the source of truth for all three projects.
Key tables:

| Table | Description |
|-------|-------------|
| `courses` | One row per golf course — name, location, status |
| `holes` | One row per hole (1–18) per course |
| `features` | Golf feature polygons (PostGIS MULTIPOLYGON geometry) |
| `pipeline_jobs` | Pipeline run history and status |
| `corrections` | Audit log of all human review corrections |
| `users` | Internal operators (admin + reviewer roles) |

Full schema spec: see `/docs/PRD_2c_Database_Schema.docx`.

---

## Course status lifecycle

```
unmapped → processing → segmented → assigned → reviewed → published
                                                             ↑
                                              Admin publishes after review
```

---

## User roles

| Role | Permissions |
|------|-------------|
| Admin | Full access — add, trigger, publish, delete, manage users |
| Reviewer | Review and confirm hole assignments — cannot trigger or publish |

---

## Key pages

| Route | Description |
|-------|-------------|
| `/dashboard/courses` | Course library with filters and status |
| `/dashboard/courses/new` | Add a new course |
| `/dashboard/courses/[id]/overview` | Course detail + map preview |
| `/dashboard/courses/[id]/jobs` | Pipeline job history |
| `/dashboard/courses/[id]/review` | Manual review UI |
| `/dashboard/jobs` | Global job queue (all courses) |
| `/dashboard/settings` | User management (admin only) |

---

## Related repositories

- [golf-segmentation](https://github.com/yourusername/golf-segmentation) — ML pipeline (DeepLabv3+ + LLM hole assignment)
- [golf-course-api](https://github.com/yourusername/golf-course-api) — Consumer API serving course data to the rangefinder app

---

## Documentation

Full PRDs and technical specs are in `/docs`:

| File | Contents |
|------|----------|
| `PRD_1_ML_Pipeline.docx` | Segmentation model, training, hole assignment |
| `PRD_2a_Dashboard.docx` | Course management dashboard spec |
| `PRD_2b_Review_UI.docx` | Manual review UI spec |
| `PRD_2c_Database_Schema.docx` | Full database schema |
| `PRD_3_Consumer_API.docx` | Consumer API spec |
| `Decisions_Tracker.docx` | All architecture decisions |

For AI agents and new developers: read `CLAUDE.md`.
For CI/CD and deployment: read `CICD.md`.

---

## License

Private — all rights reserved.
