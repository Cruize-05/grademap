"""KDD Step 5 — Evaluation.

Writes summary metrics back to the mining_runs table and returns a dict
that can be serialised as JSON for the run notes.
"""

import datetime
import json
import logging

import pandas as pd
import sqlalchemy as sa

from app.db import get_engine

logger = logging.getLogger(__name__)


def run(
    run_id: str,
    course_stats: pd.DataFrame,
    rules: pd.DataFrame,
    row_count_input: int,
) -> dict:
    """Compute evaluation metrics and write them to mining_runs.notes."""
    mean_pass = float(course_stats["pass_rate"].mean()) if not course_stats.empty else None
    mean_lift = float(rules["lift"].mean()) if not rules.empty else None

    metrics = {
        "row_count_input": row_count_input,
        "n_courses_indexed": int(len(course_stats)),
        "n_association_rules": int(len(rules)),
        "mean_pass_rate": mean_pass,
        "mean_lift": mean_lift,
        "evaluated_at": datetime.datetime.utcnow().isoformat(),
    }

    engine = get_engine()
    with engine.begin() as conn:
        conn.execute(
            sa.text(
                "UPDATE mining_runs SET finished_at = now(),"
                " status = 'completed', notes = :notes WHERE id = :id"
            ),
            {"notes": json.dumps(metrics), "id": run_id},
        )

    logger.info("Mining run %s evaluation: %s", run_id, metrics)
    return metrics
