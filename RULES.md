# TrackShell — Agent Rules

Rules the coding agent must follow. Covers security, quality, and behavior
specific to this project's risk surface. Read alongside CLAUDE.md.

---

## Security

**Multi-tenant isolation**
Every query against `courses` and `users` must include an `org_id` filter.
A session with a valid JWT is not sufficient — the org must match.

```typescript
// Always scope to org
WHERE org_id = ${session.user.orgId}
```

**Auth check order in every API route**
1. `getServerSession` → 401 if no session
2. Check role if route is admin-only → 403 if wrong role
3. Check org ownership of the resource → 403 if mismatch
4. Proceed

Never reorder or skip steps. A missing org check is a tenant data leak.

**Raw SQL parameterization**
`lib/spatial.ts` uses Prisma's `$queryRaw` tagged template literals.
Never string-concatenate user input into a query. Always use `${variable}`
inside the template — Prisma parameterizes these safely.

```typescript
// Safe
db.$queryRaw`SELECT * FROM features WHERE course_id = ${courseId}`

// Never do this
db.$queryRaw(Prisma.raw(`SELECT * FROM features WHERE course_id = '${courseId}'`))
```

**Reviewer lock enforcement**
Before accepting any correction (PATCH/DELETE on features), verify
`courses.locked_by = session.user.id`. Return 409 if the course is locked
by someone else. Return 409 if the lock has expired (> 2 hours since `locked_at`).

**Server-only secrets**
`PIPELINE_API_KEY` and `DATABASE_URL` must never appear in any
`NEXT_PUBLIC_*` variable or be imported into any file under `app/` that
runs client-side. Both must only be used in route handlers and `lib/`.

**No password exposure**
Never `SELECT password_hash` in any query that populates an API response.
Never log request bodies that may contain passwords.

---

## Quality

**Write corrections before mutations**
Every correction must be a single transaction: insert the `corrections` row,
then update `features` or `holes`. If the mutation fails, the correction row
must also roll back. Never write the correction row after the mutation.

```typescript
await db.$transaction([
  db.corrections.create({ data: correctionRow }),
  db.features.update({ where: { id: featureId }, data: mutation }),
])
```

**Sign-off gate**
`POST /api/courses/[id]/review/complete` must return 400 if any hole in
that course has `needs_review = true` AND `confirmed = false`. Enforce this
server-side, not just in the UI button state.

**Geometry validation before write**
Before persisting any geometry from a client submission (geometry edit
endpoint), validate:
- Polygon is non-self-intersecting (`ST_IsValid`)
- Area is ≥ 20 m² (`ST_Area`)

Return 422 with a clear message if either check fails.

```sql
SELECT ST_IsValid($geometry), ST_Area($geometry::geography) AS area_sqm
```

**SSE stream lifecycle**
`GET /api/jobs/[id]/stream` must explicitly close the SSE connection when
`job.status` becomes `completed`, `failed`, or `cancelled`. Never leave
streams open after a terminal state.

**No optimistic corrections**
The review UI must not write any correction to local state until it receives
a 2xx response from the server. If the request fails or the connection drops,
surface a clear error. Silent data loss is worse than a visible failure.

**Consumer API isolation**
Any route or query intended for the consumer API must filter
`courses.status = 'published'`. Never expose `assigned`, `reviewed`, or
any other status to external consumers.

**Deletion audit completeness**
Before hard-deleting a feature, the `corrections` row for a `deletion` must
include `original_geometry`, `original_feature_type`, and `confidence_score`
copied from the feature. The FK `corrections.feature_id` will become NULL
after deletion — the geometry snapshot is the only audit record.

---

## Behavior

**Migrations**
Always use `npx prisma migrate dev --name <description>`.
Never hand-edit any file inside `prisma/migrations/`.
Never use `prisma db push` in any environment — it bypasses the migration history.

**Geometry type**
Always `MULTIPOLYGON` in schema definitions, raw SQL, and GeoJSON handling.
If a client submits a `Polygon`, convert it to `MultiPolygon` before writing.
Never store or query assuming `Polygon`.

**Spatial queries stay in `lib/spatial.ts`**
No raw PostGIS SQL in route handlers. Route handlers call helper functions
from `lib/spatial.ts`. This keeps the query surface auditable and testable.

**Role checks are server-side**
Never rely on hiding a button or route as the access control mechanism.
Every admin-only action (delete course, publish, force re-run, user management)
must check `session.user.role === 'admin'` in the route handler regardless
of what the UI shows.

**Explicit error responses**
Return explicit HTTP error codes with a short message in the body.
Do not return 200 with an error payload. Do not silently succeed when
a precondition is unmet. Common codes for this project:

| Situation | Status |
|---|---|
| No session | 401 |
| Wrong role | 403 |
| Wrong org | 403 |
| Course locked by another user | 409 |
| Sign-off with unconfirmed holes | 400 |
| Invalid geometry | 422 |
| Resource not found | 404 |
