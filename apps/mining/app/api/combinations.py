"""Dangerous combinations check endpoint."""

import os

from fastapi import APIRouter
from pydantic import BaseModel

from app.db import read_query

router = APIRouter(tags=["combinations"])

K_THRESHOLD = int(os.environ.get("K_ANONYMITY_THRESHOLD", "10"))


class ComboRequest(BaseModel):
    plannedCourseIds: list[str]


class DangerousCombo(BaseModel):
    courseA: str
    courseB: str
    support: float
    confidence: float
    lift: float
    nStudents: int
    coFailRate: float


class ComboResponse(BaseModel):
    combinations: list[DangerousCombo]


@router.post("/combinations/check", response_model=ComboResponse)
async def check_combinations(req: ComboRequest) -> ComboResponse:
    course_ids = req.plannedCourseIds
    if len(course_ids) < 2:
        return ComboResponse(combinations=[])

    placeholders = ", ".join(f":c{i}" for i in range(len(course_ids)))
    params = {f"c{i}": cid for i, cid in enumerate(course_ids)}

    rows = read_query(
        f"""
        SELECT course_a, course_b, support, confidence, lift, n_students
        FROM dangerous_combinations_cache
        WHERE course_a IN ({placeholders}) AND course_b IN ({placeholders})
        AND n_students >= :k
        ORDER BY lift DESC
        """,
        {**params, "k": K_THRESHOLD},
    )

    combos = [
        DangerousCombo(
            courseA=str(r["course_a"]),
            courseB=str(r["course_b"]),
            support=float(r["support"]),
            confidence=float(r["confidence"]),
            lift=float(r["lift"]),
            nStudents=int(r["n_students"]),
            coFailRate=round((1 - float(r["confidence"])) * 100, 1),
        )
        for r in rows
    ]

    return ComboResponse(combinations=combos)
