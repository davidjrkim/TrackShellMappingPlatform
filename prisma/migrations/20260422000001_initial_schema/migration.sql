-- Migration: initial_schema
-- Run in this exact order per PRD 2c §6.

-- 1. PostGIS extension
CREATE EXTENSION IF NOT EXISTS postgis;

-- 2. Enum types
CREATE TYPE course_status AS ENUM (
  'unmapped',
  'processing',
  'segmented',
  'assigned',
  'reviewed',
  'published',
  'failed'
);

CREATE TYPE data_source_type AS ENUM (
  'ml_pipeline',
  'manual',
  'imported'
);

CREATE TYPE feature_type_enum AS ENUM (
  'green',
  'fairway',
  'tee_box',
  'bunker',
  'water_hazard'
  -- 'rough' deferred to v2 (Decision 5)
);

CREATE TYPE job_status_enum AS ENUM (
  'queued',
  'running',
  'completed',
  'failed',
  'cancelled'
);

CREATE TYPE user_role_enum AS ENUM (
  'admin',
  'reviewer'
);

-- 3. Organizations
CREATE TABLE organizations (
  id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name       VARCHAR(255) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- 4. Users
CREATE TABLE users (
  id            UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID           NOT NULL REFERENCES organizations(id),
  email         VARCHAR(255)   NOT NULL UNIQUE,
  password_hash VARCHAR(255)   NOT NULL,
  name          VARCHAR(255)   NOT NULL,
  role          user_role_enum NOT NULL DEFAULT 'reviewer',
  created_at    TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);

-- 5. Courses
-- bounding_box uses PostGIS GEOMETRY type — Prisma writes all other columns,
-- lib/spatial.ts handles bounding_box reads/writes via raw SQL.
CREATE TABLE courses (
  id                 UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             UUID             NOT NULL REFERENCES organizations(id),
  name               VARCHAR(255)     NOT NULL,
  name_local         VARCHAR(255),
  country            CHAR(2)          NOT NULL,
  region             VARCHAR(100),
  city               VARCHAR(100),
  latitude           DECIMAL(10,7)    NOT NULL,
  longitude          DECIMAL(10,7)    NOT NULL,
  bounding_box       GEOMETRY(Polygon,4326) NOT NULL,
  hole_count         SMALLINT         NOT NULL DEFAULT 18,
  status             course_status    NOT NULL DEFAULT 'unmapped',
  data_source        data_source_type NOT NULL,
  source_external_id VARCHAR(255),
  last_synced_at     TIMESTAMPTZ,
  ml_model_version   VARCHAR(50),
  locked_by          UUID             REFERENCES users(id),
  locked_at          TIMESTAMPTZ,
  deleted_at         TIMESTAMPTZ,
  created_at         TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

-- 6. Holes + unique constraint
CREATE TABLE holes (
  id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id             UUID          NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  hole_number           SMALLINT      NOT NULL,
  par                   SMALLINT,
  stroke_index          SMALLINT,
  tee_lat               DECIMAL(10,7),
  tee_lng               DECIMAL(10,7),
  green_lat             DECIMAL(10,7),
  green_lng             DECIMAL(10,7),
  assignment_confidence DECIMAL(4,3),
  needs_review          BOOLEAN       NOT NULL DEFAULT false,
  confirmed             BOOLEAN       NOT NULL DEFAULT false,
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_course_hole UNIQUE (course_id, hole_number)
);

-- 7. Features + GIST spatial index
-- geometry is MULTIPOLYGON per CLAUDE.md — never POLYGON.
CREATE TABLE features (
  id               UUID               PRIMARY KEY DEFAULT gen_random_uuid(),
  hole_id          UUID               REFERENCES holes(id) ON DELETE CASCADE,
  course_id        UUID               NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  feature_type     feature_type_enum  NOT NULL,
  geometry         GEOMETRY(MultiPolygon,4326) NOT NULL,
  area_sqm         DECIMAL(10,2),
  confidence_score DECIMAL(4,3),
  pixel_class_id   SMALLINT,
  reviewed         BOOLEAN            NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ        NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ        NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_features_geometry   ON features USING GIST (geometry);
CREATE INDEX idx_features_course_type ON features (course_id, feature_type);

-- 8. Pipeline jobs
CREATE TABLE pipeline_jobs (
  id                 UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id          UUID            NOT NULL REFERENCES courses(id),
  job_type           VARCHAR(50)     NOT NULL,
  status             job_status_enum NOT NULL DEFAULT 'queued',
  triggered_by       UUID            REFERENCES users(id),
  model_version      VARCHAR(50),
  llm_model          VARCHAR(100),
  input_tiles_count  INTEGER,
  polygons_generated INTEGER,
  error_message      TEXT,
  started_at         TIMESTAMPTZ,
  completed_at       TIMESTAMPTZ,
  created_at         TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- 9. Corrections
-- feature_id goes NULL on hard delete (ON DELETE SET NULL) — geometry snapshot
-- in original_geometry is the only audit record after deletion.
-- original_geometry uses MULTIPOLYGON to match features.geometry type.
CREATE TABLE corrections (
  id                    UUID               PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_id            UUID               REFERENCES features(id) ON DELETE SET NULL,
  course_id             UUID               NOT NULL,
  correction_type       VARCHAR(50)        NOT NULL,
  original_hole_number  SMALLINT,
  corrected_hole_number SMALLINT,
  original_feature_type feature_type_enum,
  corrected_feature_type feature_type_enum,
  original_geometry     GEOMETRY(MultiPolygon,4326),
  corrected_by          UUID               NOT NULL REFERENCES users(id),
  notes                 TEXT,
  created_at            TIMESTAMPTZ        NOT NULL DEFAULT NOW()
);

-- 10. updated_at auto-update triggers
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER courses_updated_at
  BEFORE UPDATE ON courses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER holes_updated_at
  BEFORE UPDATE ON holes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER features_updated_at
  BEFORE UPDATE ON features
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
