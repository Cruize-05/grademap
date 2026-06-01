"""GPA trajectory prediction endpoint."""

import logging
import os
import pathlib

import joblib
import numpy as np
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.db import read_query

router = APIRouter(tags=["trajectory"])
logger = logging.getLogger(__name__)

MODELS_DIR = pathlib.Path(os.environ.get("MODELS_DIR", "models"))
K_THRESHOLD = int(os.environ.get("K_ANONYMITY_THRESHOLD", "10"))


class PlannedSemester(BaseModel):
    courses: list[str]


class TrajectoryRequest(BaseModel):
    studentId: str
    plannedSemesters: list[PlannedSemester]


class TrajectoryPoint(BaseModel):
    semesterIndex: int
    gpa: float
    ciLow: float
    ciHigh: float


class TrajectoryResponse(BaseModel):
    projections: list[TrajectoryPoint]
    modelInfo: str


@router.post("/trajectory", response_model=TrajectoryResponse)
async def compute_trajectory(req: TrajectoryRequest) -> TrajectoryResponse:
    # Fetch the student's historical grade points to seed the model
    history_rows = read_query(
        """
        SELECT gs.grade_point
        FROM grade_submissions gs
        WHERE gs.profile_id = :sid
          AND gs.status = 'approved'
        ORDER BY gs.academic_year, gs.semester
        """,
        {"sid": req.studentId},
    )

    if not history_rows:
        raise HTTPException(
            status_code=422,
            detail="No approved grade history. Submit and get grades approved first.",
        )

    hist_gps = [float(r["grade_point"]) for r in history_rows]
    cum_mean = float(np.mean(hist_gps))
    cum_n = len(hist_gps)

    # Identify institution for model selection
    institution_rows = read_query(
        "SELECT institution_id FROM profiles WHERE id = :sid",
        {"sid": req.studentId},
    )
    if not institution_rows:
        raise HTTPException(status_code=404, detail="Profile not found.")

    institution_id = str(institution_rows[0]["institution_id"])
    model_path = MODELS_DIR / f"{institution_id}.pkl"

    if not model_path.exists():
        raise HTTPException(
            status_code=503,
            detail=(
                "Trajectory model not yet available for your institution."
                " Run the mining pipeline first."
            ),
        )

    artifact = joblib.load(model_path)
    # Backwards-compat: older runs persisted the bare estimator; newer runs
    # persist {"model", "residual_std"}.
    if isinstance(artifact, dict):
        model = artifact["model"]
        residual_std = float(artifact.get("residual_std", 0.0))
    else:
        model = artifact
        residual_std = 0.0

    # 90% confidence half-width from the model's training residuals
    # (z = 1.645). Floor at a small band so a near-perfect fit still shows
    # honest uncertainty rather than a zero-width interval.
    ci_half = max(1.645 * residual_std, 0.1)

    projections: list[TrajectoryPoint] = []
    for i, semester in enumerate(req.plannedSemesters):
        n_planned = len(semester.courses)
        X = np.array([[cum_mean, cum_n + n_planned]])
        pred_gpa = float(model.predict(X)[0])
        pred_gpa = max(0.0, min(pred_gpa, 4.0))
        projections.append(
            TrajectoryPoint(
                semesterIndex=i + 1,
                gpa=round(pred_gpa, 2),
                ciLow=round(max(0.0, pred_gpa - ci_half), 2),
                ciHigh=round(min(4.0, pred_gpa + ci_half), 2),
            )
        )
        cum_mean = (cum_mean * cum_n + pred_gpa * n_planned) / (cum_n + n_planned)
        cum_n += n_planned

    return TrajectoryResponse(
        projections=projections,
        modelInfo=f"RidgeCV model for institution {institution_id}",
    )
