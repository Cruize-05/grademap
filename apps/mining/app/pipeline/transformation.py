"""KDD Step 3 — Transformation.

Derives the `passed` boolean flag and builds per-course cohort stats.
Also constructs per-student failed-course baskets for association-rule mining
(keyed by the salted-HMAC student_hash, so co-failure patterns group per
student without exposing profile_id).

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

    # Basket: one row per student (student_hash), listing the courses that
    # student FAILED. Association-rule mining over failed-course baskets surfaces
    # *co-failure* patterns ("students who fail A tend to fail B") rather than
    # co-enrollment noise. Keying by student_hash links a student's rows without
    # exposing profile_id (the hash is a salted, irreversible HMAC pseudonym).
    failed = df[~df["passed"]]

    baskets = (
        failed.groupby("student_hash")["course_id"]
        .apply(lambda s: sorted(set(s)))
        .reset_index()
        .rename(columns={"course_id": "courses"})
    )

    # Drop degenerate single-course baskets — a basket with one failed course
    # cannot contribute to any pairwise association rule.
    baskets = baskets[baskets["courses"].apply(len) >= 2].reset_index(drop=True)

    return {
        "clean": df,
        "course_stats": course_stats,
        "baskets": baskets,
    }
