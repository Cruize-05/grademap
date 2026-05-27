"""KDD Step 1 — Selection.

Reads the anonymized grades view into a pandas DataFrame.
The view exposes no profile_id — only institution_id, course_id, semester,
academic_year, and grade_point. This is the only table the pipeline reads from.
"""

import pandas as pd

from app.db import get_engine


def run() -> pd.DataFrame:
    """Load approved, anonymized grade records from the database."""
    sql = """
        SELECT
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
