-- Migration 009: relax courses.level CHECK constraint.
--
-- The original CHECK BETWEEN 1 AND 7 was a copy-paste from profiles.level
-- (which represents a student's year of study). For courses, `level` means
-- the course-numbering tier (100, 200, 300, ...), so the constraint must
-- accept any positive integer up to a reasonable cap.

ALTER TABLE courses DROP CONSTRAINT IF EXISTS courses_level_check;
ALTER TABLE courses ADD CONSTRAINT courses_level_check CHECK (level >= 0 AND level <= 999);
