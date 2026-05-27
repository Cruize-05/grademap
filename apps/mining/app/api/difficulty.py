"""Difficulty index endpoint — returns cached difficulty for a course."""

import os

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.db import read_query

router = APIRouter(tags=["difficulty"])

K_THRESHOLD = int(os.environ.get("K_ANONYMITY_THRESHOLD", "10"))


class DifficultyResponse(BaseModel):
    courseId: str
    nStudents: int
    passRate: float
    avgGradePoint: float
    difficultyScore: float
    updatedAt: str


class InsufficientDataResponse(BaseModel):
    insufficientData: bool = True
    threshold: int


@router.get("/courses/{course_id}/difficulty")
async def get_difficulty(course_id: str) -> DifficultyResponse | InsufficientDataResponse:
    rows = read_query(
        """
        SELECT course_id, n_students, pass_rate, avg_grade_point,
               1.0 - pass_rate AS difficulty_score, updated_at
        FROM course_difficulty_cache
        WHERE course_id = :course_id
        """,
        {"course_id": course_id},
    )

    if not rows:
        raise HTTPException(status_code=404, detail="Course not found or no mining data.")

    row = rows[0]
    if row["n_students"] < K_THRESHOLD:
        return InsufficientDataResponse(threshold=K_THRESHOLD)

    return DifficultyResponse(
        courseId=str(row["course_id"]),
        nStudents=row["n_students"],
        passRate=float(row["pass_rate"]),
        avgGradePoint=float(row["avg_grade_point"]),
        difficultyScore=float(row["difficulty_score"]),
        updatedAt=str(row["updated_at"]),
    )
