-- Add manual/auto confirmation tracking to holes. Populated by the
-- hole-confirm and course-sign-off endpoints (US-005, US-006). NULL until
-- a hole is confirmed; enforced server-side, not as a NOT NULL constraint.

CREATE TYPE hole_confirmation_type_enum AS ENUM ('manual', 'auto');

ALTER TABLE holes
  ADD COLUMN confirmation_type hole_confirmation_type_enum;
