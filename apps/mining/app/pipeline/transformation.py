"""KDD Step 3 — Transformation.

Derives the `passed` boolean flag and builds per-course cohort stats.
Also constructs student-semester baskets for association-rule mining.

Note on the pass threshold: 1.0 / 5.0 → 1.0 on a 4.00 scale corresponds to a D
or local equivalent. The threshold is set at 1.0 (out of whichever max scale
the institution uses), matching "any passing grade". Adjust per institution if
grade mappings become available.
"""

import pandas as pd

_PASS_THRESHOLD = 1.0  # grade_point >= 1.0 is considered passing


def run(df: pd.DataFrame) -> dict[str, pd.DataFrame]:
    """Return a dict of transformed DataFrames keyed by usage."""
    df = df.copy()
    df["passed"] = df["grade_point"] >= _PASS_THRESHOLD

    # Per-course cohort (for difficulty indexing)
    course_stats = (
        df.groupby("course_id")
        .agg(
            n_students=("passed", "count"),
            pass_rate=("passed", "mean"),
            avg_grade_point=("grade_point", "mean"),
        )
        .reset_index()
    )

    # Basket: one row per (institution_id, academic_year, semester) tuple,
    # listing courses taken. Used by association-rule mining.
    # We use (institution_id, academic_year, semester, row_number) as a
    # synthetic student-semester identifier since profile_id is not in the view.
    df["_basket_key"] = (
        df["institution_id"].astype(str)
        + "_"
        + df["academic_year"].astype(str)
        + "_S"
        + df["semester"].astype(str)
    )

    # Build a list of courses per basket key for mlxtend
    baskets = (
        df.groupby("_basket_key")["course_id"]
        .apply(list)
        .reset_index()
        .rename(columns={"course_id": "courses"})
    )

    return {
        "clean": df,
        "course_stats": course_stats,
        "baskets": baskets,
    }
