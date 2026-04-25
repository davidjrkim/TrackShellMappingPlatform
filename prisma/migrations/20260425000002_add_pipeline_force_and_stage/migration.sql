-- Columns written by the pipeline service's raw asyncpg INSERT/UPDATE on
-- pipeline_jobs. `force` is always supplied on INSERT so a DEFAULT isn't
-- strictly required, but we set one so other writers (dashboard createJob)
-- keep working without having to list the column. `stage` is populated by
-- the orchestrator as it progresses through the pipeline.

ALTER TABLE pipeline_jobs
  ADD COLUMN force   BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN stage   VARCHAR(50);
