"""KDD Step 2 — Preprocessing.

Cleans the raw DataFrame: drops nulls, removes implausible grade points,
and deduplicates. Because the view has no profile_id, deduplication is
best-effort (same course + semester + year within a row grouping).
"""

import pandas as pd

# Institutional GPA scales can be 4.00 or 5.00 depending on institution.
# We accept up to 5.00 as the upper bound; anything above is implausible.
_MIN_GRADE_POINT = 0.0
_MAX_GRADE_POINT = 5.0


def run(df: pd.DataFrame) -> pd.DataFrame:
    """Clean and deduplicate the raw grades DataFrame."""
    initial_count = len(df)

    df = df.dropna(subset=["grade_point", "course_id", "institution_id"])

    # Drop implausible grade points
    mask = df["grade_point"].between(_MIN_GRADE_POINT, _MAX_GRADE_POINT)
    df = df[mask]

    # Deduplicate on the natural key available in the anonymized view.
    # Since we lack a student identifier, we deduplicate at the aggregate level.
    df = df.drop_duplicates()

    dropped = initial_count - len(df)
    if dropped > 0:
        import logging

        logging.getLogger(__name__).info(
            "Preprocessing: dropped %d implausible/duplicate rows", dropped
        )

    return df.reset_index(drop=True)
