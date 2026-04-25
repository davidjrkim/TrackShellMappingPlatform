-- Align holes/features with the column names the pipeline service writes via
-- raw asyncpg (TrackShellSegmentation/pipeline/db_write.py). The pipeline is
-- the producer of these rows; the dashboard reads/edits. Schema convention:
-- producer's vocabulary wins on shared columns.

-- holes: confidence is a single column (was assignment_confidence)
ALTER TABLE holes RENAME COLUMN assignment_confidence TO confidence;

-- holes: replace the lat/lng decimal pairs with PostGIS POINT geometries.
-- The pipeline writes POINTs directly; the dashboard derives lng/lat via
-- ST_X / ST_Y at query time for routing-line rendering.
ALTER TABLE holes DROP COLUMN tee_lat;
ALTER TABLE holes DROP COLUMN tee_lng;
ALTER TABLE holes DROP COLUMN green_lat;
ALTER TABLE holes DROP COLUMN green_lng;
ALTER TABLE holes ADD COLUMN tee_centroid   GEOMETRY(Point, 4326);
ALTER TABLE holes ADD COLUMN green_centroid GEOMETRY(Point, 4326);

-- features: confidence is a single column (was confidence_score)
ALTER TABLE features RENAME COLUMN confidence_score TO confidence;

-- features: pipeline INSERTs without course_id; derive it from the parent hole.
-- Dashboard queries that filter on features.course_id keep working without
-- requiring the pipeline to denormalise it explicitly.
ALTER TABLE features ALTER COLUMN course_id DROP NOT NULL;

CREATE OR REPLACE FUNCTION fill_feature_course_id() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.course_id IS NULL AND NEW.hole_id IS NOT NULL THEN
    SELECT course_id INTO NEW.course_id FROM holes WHERE id = NEW.hole_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER fill_feature_course_id_trigger
  BEFORE INSERT ON features
  FOR EACH ROW EXECUTE FUNCTION fill_feature_course_id();
