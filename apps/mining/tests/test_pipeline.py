"""Unit tests for the KDD pipeline — runs against synthetic in-memory data."""

import pandas as pd
import pytest
from app.pipeline import mining, preprocessing, transformation


@pytest.fixture()
def raw_df() -> pd.DataFrame:
    """Minimal synthetic DataFrame mimicking v_anonymized_grades output.

    student_hash is assigned so that three students fail BOTH course_a and
    course_b (global rows 4&22, 9&27, 14&32 share a hash). That gives the
    failed-course basket builder a real co-failure pair to surface; everyone
    else gets a unique hash.
    """
    # Default: each row is its own (single-course) student.
    student_hash = [f"s{i:02d}" for i in range(50)]
    # Stitch three co-failure students across the course_a / course_b fail rows.
    for a_row, b_row, h in [(4, 22, "cf1"), (9, 27, "cf2"), (14, 32, "cf3")]:
        student_hash[a_row] = h
        student_hash[b_row] = h

    return pd.DataFrame(
        {
            "student_hash": student_hash,
            "institution_id": ["UB"] * 50,
            "course_id": (["course_a"] * 20 + ["course_b"] * 15 + ["course_c"] * 15),
            "semester": [1] * 25 + [2] * 25,
            "academic_year": [2024] * 50,
            "grade_point": (
                [4.0, 3.5, 3.0, 2.0, 0.0] * 4  # course_a varied
                + [3.0, 2.5, 0.0, 3.5, 4.0] * 3  # course_b
                + [4.0, 3.5, 3.0] * 5  # course_c mostly passing
            ),
        }
    )


def test_preprocessing_drops_nulls(raw_df: pd.DataFrame) -> None:
    df_with_nulls = raw_df.copy()
    df_with_nulls.loc[0, "grade_point"] = None
    cleaned = preprocessing.run(df_with_nulls)
    assert cleaned["grade_point"].isna().sum() == 0


def test_preprocessing_drops_implausible(raw_df: pd.DataFrame) -> None:
    df_bad = raw_df.copy()
    df_bad.loc[0, "grade_point"] = 99.0
    df_bad.loc[1, "grade_point"] = -1.0
    cleaned = preprocessing.run(df_bad)
    assert (cleaned["grade_point"] > 5.0).sum() == 0
    assert (cleaned["grade_point"] < 0.0).sum() == 0


def test_preprocessing_returns_dataframe(raw_df: pd.DataFrame) -> None:
    result = preprocessing.run(raw_df)
    assert isinstance(result, pd.DataFrame)
    assert len(result) > 0


def test_transformation_adds_passed_column(raw_df: pd.DataFrame) -> None:
    cleaned = preprocessing.run(raw_df)
    result = transformation.run(cleaned)
    assert "passed" in result["clean"].columns
    assert result["clean"]["passed"].dtype == bool


def test_transformation_course_stats_shape(raw_df: pd.DataFrame) -> None:
    cleaned = preprocessing.run(raw_df)
    result = transformation.run(cleaned)
    stats = result["course_stats"]
    assert "course_id" in stats.columns
    assert "pass_rate" in stats.columns
    assert "n_students" in stats.columns
    assert len(stats) == 3  # 3 courses in synthetic data


def test_transformation_builds_per_student_failure_baskets(raw_df: pd.DataFrame) -> None:
    cleaned = preprocessing.run(raw_df)
    result = transformation.run(cleaned)
    baskets = result["baskets"]

    # Only multi-course failure baskets survive (single-course dropped).
    assert (baskets["courses"].apply(len) >= 2).all()

    # The three stitched co-failure students each failed course_a AND course_b.
    co_fail = {"course_a", "course_b"}
    matches = baskets["courses"].apply(lambda cs: co_fail.issubset(set(cs)))
    assert matches.sum() == 3


def test_difficulty_computes_score(raw_df: pd.DataFrame) -> None:
    cleaned = preprocessing.run(raw_df)
    result = transformation.run(cleaned)
    # Lower K for unit tests so small synthetic data passes
    original_k = mining.K_THRESHOLD
    mining.K_THRESHOLD = 3
    try:
        difficulty = mining.compute_difficulty(result["course_stats"])
        assert "difficulty_score" in difficulty.columns
        assert (difficulty["difficulty_score"] >= 0).all()
        assert (difficulty["difficulty_score"] <= 1).all()
    finally:
        mining.K_THRESHOLD = original_k


def test_health_endpoint_schema() -> None:
    """The health endpoint must return the expected keys."""
    from app.main import app
    from fastapi.testclient import TestClient

    client = TestClient(app)
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["service"] == "grademap-mining"
