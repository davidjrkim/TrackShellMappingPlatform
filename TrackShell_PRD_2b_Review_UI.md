# 🔍 TrackShell Course Mapping Platform — PRD 2b: Manual Review UI

**Version:** 1.0 | **April 2026**

| Field | Value |
|---|---|
| Status | 🟡 Draft |
| Owner | David |
| Stack | Next.js 14 · MapLibre GL · Tailwind · PostgreSQL/PostGIS |
| Users | Reviewer + Admin roles |
| Depends On | PRD 2c (Database Schema), PRD 1 (ML Pipeline), PRD 2a (Dashboard) |
| Last Updated | April 2026 |

---

## 1. Purpose & Scope

This PRD defines the Manual Review UI — the interface where human operators inspect, correct, and confirm the ML pipeline's hole assignment output before a course is published to the consumer API. It is the quality gate between automated processing and live data.

**Scope:**
- ✅ Covers: flagged hole review workflow, polygon-level corrections (hole reassignment, feature type change, geometry editing, deletion), confirmation flow, and the feedback loop that writes corrections back to the database.
- ❌ Does not cover: pipeline triggering (PRD 2a) or the consumer API (PRD 3).

> **KEY PRINCIPLE:** The review UI should surface only what needs human attention. Holes the model assigned with high confidence should not require any interaction. The reviewer's time is the bottleneck — every design decision optimises for speed of review.

---

## 2. Review Workflow

The review flow for a course follows a linear sequence. A reviewer cannot skip to "mark complete" without addressing all flagged holes.

```
Course status = "assigned"
         ↓
Reviewer opens /courses/[id]/review
         ↓
┌─────────────────────────────────────────────────────┐
│  STEP 1 — Hole-by-hole review                       │
│  Navigate holes 1–18 in sidebar                     │
│  Flagged holes (needs_review=true) shown first       │
│  For each hole:                                      │
│    - Inspect polygons on map                        │
│    - Make corrections if needed                      │
│    - Click "Confirm Hole" to mark as reviewed        │
└─────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────┐
│  STEP 2 — Course-level sign-off                     │
│  All 18 holes confirmed → "Mark Course Reviewed"    │
│  button becomes active                              │
└─────────────────────────────────────────────────────┘
         ↓
course.status → "reviewed"
Admin can now publish to consumer API
```

---

## 3. UI Layout

### 3.1 Three-Panel Design

The review UI uses a three-panel layout optimised for wide screens (1280px+). All three panels are visible simultaneously so the reviewer never loses context.

```
● ● ●  Seoul CC — Review  (Hole 7 selected)

┌──────────────┬──────────────────────────────────┬───────────────────┐
│  HOLE LIST   │         MAP CANVAS               │  INSPECTOR PANEL  │
│              │                                  │                   │
│  ⚠ Hole 3   │                                  │  Hole 7           │
│  ⚠ Hole 7   │   [MapLibre GL — satellite       │  Confidence: 0.61 │
│  ⚠ Hole 12  │    imagery + polygon overlay]    │  Status: ⚠ Flagged│
│  ─────────   │                                  │                   │
│  ✓ Hole 1   │   Hole 7 polygons highlighted    │  Polygons (4):    │
│  ✓ Hole 2   │   in blue outline.               │  ■ Green  [✓][✕] │
│  ✓ Hole 4   │   Other holes shown dimmed.      │  ■ Fairway[✓][✕] │
│  ✓ Hole 5   │                                  │  ■ Tee box[✓][✕] │
│  ✓ Hole 6   │                                  │  ■ Bunker [✓][✕] │
│  ✓ Hole 8   │                                  │                   │
│  ...        │   Click a polygon to select it.  │  [+ Add polygon]  │
│             │                                  │                   │
│  Progress:  │                                  │  [Confirm Hole 7] │
│  5 / 18 ✓  │                                  │                   │
└──────────────┴──────────────────────────────────┴───────────────────┘
```

### 3.2 Panel Responsibilities

| Panel | Width | Responsibility |
|---|---|---|
| Hole List (left) | 240px fixed | Navigate between holes. Shows flag icons for `needs_review=true` holes. Shows checkmarks for confirmed holes. Progress counter at bottom. |
| Map Canvas (centre) | Flex fill | Primary interaction surface. Satellite imagery base. Polygon GeoJSON overlay. Click to select polygon. Draw mode for geometry editing. |
| Inspector (right) | 320px fixed | Shows details of selected hole or polygon. All correction actions live here. Confirm button per hole. |

---

## 4. Hole List Panel

### 4.1 Ordering

Flagged holes (`needs_review=true`) are sorted to the top of the list, ordered by ascending confidence score (lowest confidence first). Confirmed holes appear below in hole number order. This ensures reviewers tackle the hardest cases first.

### 4.2 Hole Row States

| State | Icon | Visual |
|---|---|---|
| Flagged, unreviewed | ⚠ | Amber background, bold text, confidence score shown |
| Currently selected | → | Primary blue background, white text |
| Confirmed by reviewer | ✓ | Light green background, muted text |
| High-confidence, unreviewed | ○ | White background — reviewer can still open and confirm |

> **UX:** High-confidence holes (`needs_review=false`) still appear in the list and can be opened and confirmed. Reviewers may want to spot-check them. But the workflow does not require interaction with these holes — they auto-confirm when the reviewer clicks "Mark Course Reviewed".

---

## 5. Map Canvas

### 5.1 Layers

| Layer | Description | Always Visible? |
|---|---|---|
| Satellite base | High-res satellite imagery (Stadia Maps) | Yes |
| All course polygons | All features rendered semi-transparent in their type colour | Yes (dimmed when a hole is selected) |
| Selected hole polygons | Active hole's features at full opacity with thick blue outline | When a hole is selected |
| Hole number labels | Centroid labels showing "H1", "H2" etc for spatial orientation | Yes |
| Draw layer | User-drawn polygon during geometry edit mode | Only during draw mode |

### 5.2 Polygon Colours

| Feature Type | Fill Colour | Opacity |
|---|---|---|
| `green` | Dark green `#1e8449` | 0.55 |
| `fairway` | Light green `#a9dfbf` | 0.50 |
| `tee_box` | Yellow `#f4d03f` | 0.65 |
| `bunker` | Tan `#d4a76a` | 0.60 |
| `water_hazard` | Blue `#2e86c1` | 0.55 |
| ~~`rough`~~ | ~~Olive `#7d6608`~~ | — | Deferred to v2 (Decision 5) — no v1 pipeline output for this type |

### 5.3 Polygon Interaction

- **Click a polygon** → selects it, inspector panel shows polygon detail
- **Hover** → tooltip shows feature type, hole number, confidence score
- **Selected polygon** → thick white outline, inspector shows edit options
- **Non-selected polygons on active hole** → blue outline, semi-transparent
- **Polygons on other holes** → fully dimmed (0.2 opacity), not clickable while a hole is active

### 5.4 Map Controls

- Zoom in/out — scroll wheel and +/- buttons
- **"Fit to hole"** button — zooms and pans map to fit the selected hole's polygon bounding box
- **"Fit to course"** button — zooms out to show all 18 holes
- **Layer toggle** — show/hide polygon overlay (to compare against raw satellite)
- **Draw mode toggle** — enables freehand polygon drawing for geometry correction (see §7.3)

---

## 6. Inspector Panel

### 6.1 Hole View (no polygon selected)

```
● ● ●  Inspector — Hole 7

Hole 7                        Confidence: 0.61
⚠ Flagged for review
─────────────────────────────────────────────
Polygons assigned to this hole:

■ Green         area: 412 m²     conf: 0.88   [✕]
■ Fairway       area: 4,210 m²   conf: 0.72   [✕]
■ Fairway       area: 1,840 m²   conf: 0.65   [✕]
■ Tee box       area: 198 m²     conf: 0.61   [✕]
■ Bunker        area: 320 m²     conf: 0.55   [✕]

Topology check:
✅ Has green
✅ Has tee box
⚠ Fairway gap detected

[+ Assign polygon to this hole]
─────────────────────────────────────────────
Reviewer notes:  [                          ]

[Confirm Hole 7 ✓]
```

### 6.2 Polygon View (polygon selected)

```
● ● ●  Inspector — Polygon Selected

← Back to Hole 7
─────────────────────────────────────────────
Polygon  #a3f2...

Feature type:   [Fairway        ▾]   ← editable dropdown
Assigned hole:  [Hole 7         ▾]   ← editable dropdown (1–18)
Area:           1,840 m²
Confidence:     0.65
Vertices:       42

Actions:
[✏ Edit geometry]   [🗑 Delete polygon]

[Apply changes]   [Cancel]
```

---

## 7. Correction Actions

Every correction writes a row to the `corrections` table before modifying the `features` or `holes` tables. For deletions, the polygon's geometry, type, and confidence are snapshotted into the correction row before the hard delete — ensuring the audit trail is complete regardless of operation type. This provides a full audit trail and a dataset for future model improvement.

### 7.1 Reassign Polygon to Different Hole

The most common correction. The reviewer selects a polygon and changes its "Assigned hole" dropdown from Hole 7 to Hole 6. On Apply:

- Write correction row: `correction_type = "hole_reassignment"`, `original_hole_number`, `corrected_hole_number`
- Update `features.hole_id` to point to the correct hole
- Recalculate topology check for both the source and destination holes
- Update `hole.assignment_confidence` for both affected holes
- Refresh inspector panel and map overlay

### 7.2 Change Feature Type

Reviewer selects a polygon the model misclassified — e.g. it labelled a large bunker as "rough". Changing the type dropdown and clicking Apply:

- Write correction row: `correction_type = "type_change"`, `original_feature_type`, `corrected_feature_type`
- Update `features.feature_type`
- Re-render polygon on map in the new type's colour
- Re-run topology check for the hole

### 7.3 Edit Polygon Geometry

For cases where the model's polygon boundary is significantly wrong — e.g. a green polygon that bleeds into the fringe. This is the most complex correction.

> **UX NOTE:** Geometry editing should be a last resort, not the primary workflow. If the polygon shape is approximately correct but the hole assignment or type is wrong, prefer reassignment or type change. Geometry editing is slower and more error-prone.

Flow when reviewer clicks "Edit geometry":

1. Map enters draw mode — existing polygon shown as editable with vertex handles
2. Reviewer drags vertices to adjust boundary, or deletes and redraws
3. Click "Save geometry" — validates the polygon is valid (non-self-intersecting, area > 20m²)
4. Write correction row: `correction_type = "geometry_edit"`, `original_geometry` (PostGIS snapshot), new geometry stored in `features.geometry`
5. Exit draw mode, map re-renders with corrected polygon

### 7.4 Delete Polygon

For noise polygons the model generated that are not real features — e.g. a small "green" polygon that is actually a maintenance building.

- Confirmation dialog: "Delete this polygon? This cannot be undone from the review UI."
- Write correction row **before deleting**: `correction_type = "deletion"`, with `original_feature_type`, `original_geometry` (PostGIS snapshot), and `confidence_score` copied from the feature row at time of deletion. This ensures the audit record is complete even after the feature is gone — consistent with how §7.3 snapshots geometry edits.
- **Hard delete** the row from the `features` table (Decision 3). The correction row's `feature_id` is set to NULL via `ON DELETE SET NULL`, but the geometry and type are preserved in the correction row itself.
- Remove from map overlay and inspector list

### 7.5 Assign Unassigned Polygon to a Hole

The pipeline may produce polygons the LLM could not confidently assign to any hole. These appear in the inspector as "Unassigned". Reviewer clicks "+ Assign polygon to this hole" then clicks an unassigned polygon on the map.

- Polygon highlights on map when in assignment mode
- Reviewer clicks target polygon
- Write correction row: `correction_type = "hole_reassignment"`, `original_hole_number = null`
- Update `features.hole_id` to the current hole
- Re-run topology check

### 7.6 Confirm Hole (No Changes Needed)

When the reviewer is satisfied with a hole's assignment — whether they made corrections or not — they click "Confirm Hole". This:

- Sets `hole.needs_review = false` for this hole
- Marks all features for this hole as `features.reviewed = true`
- Updates hole list panel: hole moves from ⚠ to ✓
- Auto-advances to the next flagged hole if any remain

---

## 8. Course Sign-Off

### 8.1 Completion Condition

The "Mark Course Reviewed" button becomes active only when every hole has been confirmed — either explicitly by the reviewer (flagged holes) or implicitly (high-confidence holes auto-confirmed on sign-off). This is enforced server-side, not just in the UI.

### 8.2 Sign-Off Screen

```
● ● ●  Seoul CC — Review Complete

✅ All 18 holes reviewed

Summary:
● Holes confirmed without changes:   15
● Holes with corrections:             3
● Total corrections made:             7
    - Hole reassignments:   4
    - Type changes:         2
    - Geometry edits:       1

Reviewer notes (optional):
[Hole 12 bunker boundary is approximate — satellite  ]
[imagery partially obscured by tree shadow.          ]

[← Back to Review]       [✓ Mark Course Reviewed]
```

### 8.3 On Sign-Off

- Server validates all 18 holes confirmed (return 400 if not)
- Set `course.status = "reviewed"`
- Set `hole.needs_review = false` for any remaining unflagged holes
- Set `features.reviewed = true` for all features in this course
- Redirect to `/courses/[id]/overview`
- Show success banner: "Course marked as reviewed. An admin can now publish it."

---

## 9. Feedback Loop — Training Signal

Every correction written to the `corrections` table is potential training data for improving the ML pipeline. This section defines how that data is structured for future use.

> **NOTE:** Actively using correction data for retraining is a v2 concern. In v1, the goal is simply to capture corrections in a structured, queryable format so the option exists later.

### 9.1 What Gets Captured

- **Hole reassignments** — tell the model which polygon belonged to which hole (spatial ground truth)
- **Type changes** — tell the model it misclassified a feature type (segmentation correction)
- **Geometry edits** — provide corrected polygon boundaries (precise boundary ground truth)
- **Deletions** — tell the model which polygons were noise (negative examples)

### 9.2 Query for Training Export

```sql
-- Export all geometry corrections as retraining candidates
SELECT
  c.course_id,
  f.feature_type                    AS corrected_type,
  corr.original_feature_type,
  ST_AsGeoJSON(corr.original_geometry) AS original_geom,
  ST_AsGeoJSON(f.geometry)           AS corrected_geom,
  corr.created_at
FROM corrections corr
JOIN features f ON f.id = corr.feature_id
JOIN holes h    ON h.id = f.hole_id
JOIN courses c  ON c.id = h.course_id
WHERE corr.correction_type = 'geometry_edit'
  AND c.status IN ('reviewed', 'published')
ORDER BY corr.created_at DESC;
```

---

## 10. Internal API Endpoints

| Method | Route | Description |
|---|---|---|
| GET | `/api/courses/[id]/review` | Get full review state: all holes with flags, polygon lists, topology checks, reviewer progress |
| GET | `/api/courses/[id]/features/geojson` | GeoJSON FeatureCollection for map canvas (all polygons for course) |
| GET | `/api/courses/[id]/holes/[holeId]` | Get single hole detail with polygon list and topology check result |
| PATCH | `/api/features/[featureId]/hole` | Reassign polygon to different hole |
| PATCH | `/api/features/[featureId]/type` | Change feature type of polygon |
| PATCH | `/api/features/[featureId]/geometry` | Update polygon geometry (accepts GeoJSON) |
| DELETE | `/api/features/[featureId]` | Delete polygon (writes correction row first) |
| POST | `/api/courses/[id]/holes/[holeId]/confirm` | Confirm a hole as reviewed |
| POST | `/api/courses/[id]/review/complete` | Course sign-off — validates all holes confirmed, sets `status = reviewed` |
| GET | `/api/corrections?courseId=[id]` | Get correction history for a course |

---

## 11. Non-Functional Requirements

| Requirement | Target | Notes |
|---|---|---|
| Map render time | < 2s | For course polygon GeoJSON overlay on initial load |
| Correction save time | < 500ms | PATCH/DELETE operations — reviewer must feel immediate response |
| Draw mode latency | < 50ms | Vertex drag must feel real-time — no perceptible lag |
| Polygon count limit | Up to 500 | Most courses will have 100–300 polygons; 500 is safe upper bound for MapLibre GL performance |
| Undo support | Single-level undo per correction action (Ctrl+Z) | Prevents accidental deletions |
| Offline resilience | Warn on connection loss — do not allow corrections to be submitted without server confirmation | Prevents silent data loss |
| Browser support | Chrome, Safari latest 2 versions — desktop only | Draw mode requires pointer precision |

---

## 12. Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| ↑ / ↓ | Navigate to previous / next hole in hole list |
| Enter | Confirm current hole (same as clicking "Confirm Hole") |
| Escape | Deselect polygon / cancel draw mode / close modal |
| F | Fit map to current hole bounding box |
| C | Fit map to full course |
| D | Toggle draw / edit geometry mode |
| Ctrl + Z | Undo last correction action |
| Delete / Backspace | Delete selected polygon (with confirmation) |

---

## 13. Decisions Applied

All open questions from this PRD are resolved.

| # | Question | Decision | Tracker |
|---|---|---|---|
| 1 | Hard delete or soft delete for polygon deletion? | **Hard delete** from `features`. The `corrections` table row (written first) with `ON DELETE SET NULL` on `feature_id` preserves the audit trail. See §7.4. | Decision 3 |
| 2 | Vertex drag or delete-and-redraw for geometry editing? | **Vertex drag** using Mapbox GL Draw plugin. Delete-and-redraw available as fallback. Model errors expected to be minor boundary adjustments. See §7.3. | Decision 14 |
| 3 | Multi-reviewer or single-reviewer lock per course? | **Single reviewer lock** via `locked_by` and `locked_at` on `courses` table. Auto-release after 2 hours. Concurrent editing deferred to v2. | Decision 15 |
| 4 | Distinguish auto-confirmed vs manually confirmed holes in audit log? | **No distinction in v1** — single `confirmed` state. Simplifies UI and `corrections` table. | Decision 18 |

---

*TrackShell Course Mapping Platform · PRD 2b: Manual Review UI · v1.0*
