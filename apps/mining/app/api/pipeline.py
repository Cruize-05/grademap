"""Admin-only pipeline trigger endpoint."""

import datetime
import logging
import os
import uuid

import pandas as pd
import sqlalchemy as sa
from fastapi import APIRouter, HTTPException, Request

from app.db import get_engine
from app.pipeline import evaluation, mining, preprocessing, selection, transformation

router = APIRouter(prefix="/pipeline", tags=["pipeline"])
logger = logging.getLogger(__name__)

_MINING_SECRET = os.environ.get("MINING_SHARED_SECRET", "")


def _verify_secret(request: Request) -> None:
    secret = request.headers.get("x-mining-secret", "")
    if not _MINING_SECRET or secret != _MINING_SECRET:
        raise HTTPException(status_code=403, detail="Invalid mining secret.")


@router.post("/run")
async def run_pipeline(request: Request) -> dict:
    _verify_secret(request)

    run_id = str(uuid.uuid4())
    engine = get_engine()

    with engine.begin() as conn:
        conn.execute(
            sa.text(
                "INSERT INTO mining_runs (id, started_at, status)"
                " VALUES (:id, :started_at, 'running')"
            ),
            {"id": run_id, "started_at": datetime.datetime.utcnow()},
        )

    try:
        raw_df = selection.run()
        row_count = len(raw_df)
        clean_df = preprocessing.run(raw_df)
        transformed = transformation.run(clean_df)
        course_stats = mining.compute_difficulty(transformed["course_stats"])
        rules = mining.mine_associations(transformed["baskets"])
        mining.train_trajectory_models(transformed["clean"])
        _write_difficulty_cache(course_stats, run_id)
        _write_combinations_cache(rules, run_id)
        metrics = evaluation.run(run_id, course_stats, rules, row_count)
        return {"runId": run_id, "status": "completed", "metrics": metrics}

    except Exception as exc:
        logger.exception("Pipeline run %s failed", run_id)
        with engine.begin() as conn:
            conn.execute(
                sa.text(
                    "UPDATE mining_runs SET finished_at = now(),"
                    " status = 'failed', notes = :notes WHERE id = :id"
                ),
                {"notes": str(exc), "id": run_id},
            )
        raise HTTPException(status_code=500, detail=str(exc)) from exc


def _write_difficulty_cache(course_stats: pd.DataFrame, run_id: str) -> None:
    engine = get_engine()
    k = int(os.environ.get("K_ANONYMITY_THRESHOLD", "10"))
    eligible = course_stats[course_stats["n_students"] >= k]

    with engine.begin() as conn:
        conn.execute(sa.text("DELETE FROM course_difficulty_cache"))
        for _, row in eligible.iterrows():
            conn.execute(
                sa.text(
                    "INSERT INTO course_difficulty_cache"
                    " (course_id, n_students, pass_rate, avg_grade_point,"
                    "  last_run_id, updated_at)"
                    " VALUES (:course_id, :n_students, :pass_rate,"
                    "  :avg_grade_point, :last_run_id, now())"
                ),
                {
                    "course_id": str(row["course_id"]),
                    "n_students": int(row["n_students"]),
                    "pass_rate": float(row["pass_rate"]),
                    "avg_grade_point": float(row["avg_grade_point"]),
                    "last_run_id": run_id,
                },
            )


def _write_combinations_cache(rules: pd.DataFrame, run_id: str) -> None:
    engine = get_engine()
    with engine.begin() as conn:
        conn.execute(sa.text("DELETE FROM dangerous_combinations_cache"))
        for _, rule in rules.iterrows():
            course_a = next(iter(rule["antecedents"]))
            course_b = next(iter(rule["consequents"]))
            conn.execute(
                sa.text(
                    "INSERT INTO dangerous_combinations_cache"
                    " (id, course_a, course_b, support, confidence, lift,"
                    "  n_students, last_run_id, updated_at)"
                    " VALUES (gen_random_uuid(), :a, :b, :support,"
                    "  :confidence, :lift, :n, :run_id, now())"
                ),
                {
                    "a": str(course_a),
                    "b": str(course_b),
                    "support": float(rule["support"]),
                    "confidence": float(rule["confidence"]),
                    "lift": float(rule["lift"]),
                    "n": int(rule["n_students"]),
                    "run_id": run_id,
                },
            )
