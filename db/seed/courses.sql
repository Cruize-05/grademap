-- Seed: University of Buea — sample course catalogue (dev/CI only)
-- These are representative courses; real catalogue must be confirmed by admin.
-- Insert institution first.

INSERT INTO institutions (code, name, email_domain, max_grade_point, grade_mapping)
VALUES (
  'UB',
  'University of Buea',
  'ub.cm',
  4.00,
  '{"A": 4.00, "B+": 3.50, "B": 3.00, "C+": 2.50, "C": 2.00, "D": 1.00, "F": 0.00}'::jsonb
)
ON CONFLICT (code) DO UPDATE SET grade_mapping = EXCLUDED.grade_mapping;

-- Sample UB courses (Faculty of Science, level 100-300)
INSERT INTO courses (institution_id, code, title, credits, level)
SELECT i.id, c.code, c.title, c.credits, c.level
FROM institutions i,
(VALUES
  ('MATH101', 'Calculus I',                    4, 100),
  ('MATH102', 'Calculus II',                   4, 100),
  ('MATH201', 'Linear Algebra',                3, 200),
  ('MATH301', 'Real Analysis',                 3, 300),
  ('PHY101',  'General Physics I',             4, 100),
  ('PHY102',  'General Physics II',            4, 100),
  ('PHY205',  'Classical Mechanics',           3, 200),
  ('CSC101',  'Introduction to Computing',     3, 100),
  ('CSC201',  'Data Structures',               3, 200),
  ('CSC301',  'Algorithms',                    3, 300),
  ('CSC302',  'Database Systems',              3, 300),
  ('CHM101',  'General Chemistry I',           4, 100),
  ('CHM102',  'General Chemistry II',          4, 100),
  ('BIO101',  'Cell Biology',                  3, 100),
  ('STAT201', 'Probability & Statistics',      3, 200)
) AS c(code, title, credits, level)
WHERE i.code = 'UB'
ON CONFLICT (institution_id, code) DO NOTHING;
