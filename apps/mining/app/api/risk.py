"""Risk score endpoint."""

import os

from fastapi import APIRouter
from pydantic import BaseModel

from app.db import read_query

router = APIRouter(tags=["risk"])

K_THRESHOLD = int(os.environ.get("K_ANONYMITY_THRESHOLD", "10"))


class RiskRequest(BaseModel):
    studentId: str
    plannedCourseIds: list[str]


class RiskDriver(BaseModel):
    description: str
    courseIds: list[str]
    severity: str


class RiskResponse(BaseModel):
    score: float
    drivers: list[RiskDriver]
    plannedCourseIds: list[str]


@router.post("/risk-score", response_model=RiskResponse)
async def compute_risk_score(req: RiskRequest) -> RiskResponse:
    course_ids = req.plannedCourseIds

    if not course_ids:
        return RiskResponse(score=0.0, drivers=[], plannedCourseIds=[])

    # Fetch difficulty scores for the planned courses
    placeholders = ", ".join(f":c{i}" for i in range(len(course_ids)))
    params = {f"c{i}": cid for i, cid in enumerate(course_ids)}
    difficulty_rows = read_query(
        f"""
        SELECT course_id, n_students, pass_rate,
               (1.0 - pass_rate) AS difficulty_score
        FROM course_difficulty_cache
        WHERE course_id IN ({placeholders})
        AND n_students >= :k
        """,
        {**params, "k": K_THRESHOLD},
    )

    # Fetch dangerous combinations involving planned courses
    combo_rows = read_query(
        f"""
        SELECT course_a, course_b, confidence, lift, n_students
        FROM dangerous_combinations_cache
        WHERE (course_a IN ({placeholders}) OR course_b IN ({placeholders}))
        AND course_a IN ({placeholders}) AND course_b IN ({placeholders})
        AND n_students >= :k
        ORDER BY lift DESC
        """,
        {**params, "k": K_THRESHOLD},
    )

    drivers: list[RiskDriver] = []
    score_components: list[float] = []

    # Driver 1: high-difficulty courses
    for row in difficulty_rows:
        d = float(row["difficulty_score"])
        if d >= 0.6:
            severity = "high" if d >= 0.8 else "medium"
            pr = round(float(row["pass_rate"]) * 100, 1)
            drivers.append(
                RiskDriver(
                    description=f"Course has a {pr}% pass rate (n={row['n_students']})",
                    courseIds=[str(row["course_id"])],
                    severity=severity,
                )
            )
        score_components.append(d * 40)

    # Driver 2: dangerous co-enrollment combinations
    for combo in combo_rows:
        co_fail = round((1 - float(combo["confidence"])) * 100, 1)
        drivers.append(
            RiskDriver(
                description=f"Co-failure rate {co_fail}% (n={combo['n_students']})",
                courseIds=[str(combo["course_a"]), str(combo["course_b"])],
                severity="high" if float(combo["lift"]) >= 2.0 else "medium",
            )
        )
        score_components.append(float(combo["lift"]) * 10)

    # Driver 3: heavy credit load
    n_courses = len(course_ids)
    if n_courses >= 7:
        drivers.append(
            RiskDriver(
                description=f"Heavy load: {n_courses} courses planned",
                courseIds=course_ids,
                severity="medium",
            )
        )
        score_components.append(20.0)

    raw_score = min(100.0, sum(score_components))
    return RiskResponse(
        score=round(raw_score, 1),
        drivers=drivers,
        plannedCourseIds=course_ids,
    )
