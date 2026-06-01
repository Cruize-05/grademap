"""KDD Step 1 — Selection.

Reads the anonymized grades view into a pandas DataFrame.
The view exposes no profile_id — only a salted-HMAC student_hash plus
institution_id, course_id, semester, academic_year, and grade_point.
student_hash lets the miner link one student's rows together (so co-failure
baskets group per-student) without learning who they are. This is the only
table the pipeline reads from.
"""

import pandas as pd

from app.db import get_engine


def run() -> pd.DataFrame:
    """Load approved, anonymized grade records from the database."""
    sql = """
        SELECT
            student_hash,
            institution_id,
            course_id,
            semester,
            academic_year,
            grade_point
        FROM v_anonymized_grades
    """
    engine = get_engine()
    df = pd.read_sql(sql, engine)
    return df
