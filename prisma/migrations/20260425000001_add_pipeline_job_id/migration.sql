-- External reference to the pipeline service's own job id. Our pipeline_jobs.id
-- remains the stable internal identity; pipeline_job_id is what the pipeline
-- returns from POST /jobs/run and is used when calling its status/stream
-- endpoints. Nullable because the row is created before the pipeline responds.

ALTER TABLE pipeline_jobs
  ADD COLUMN pipeline_job_id VARCHAR(100);
