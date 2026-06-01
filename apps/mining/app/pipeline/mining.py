"""KDD Step 4 — Mining.

Three algorithms:

1. **Difficulty index** — Bayesian-blended pass rate per course.
   Prior: global mean pass rate across all courses with n >= K_THRESHOLD.
   Formula: blended = (n * pass_rate + m * prior) / (n + m)
   where m = K_THRESHOLD (prior weight).

2. **Association rules** — mlxtend Apriori + association_rules on
   student-semester course baskets.
   Hyperparameters (documented):
     min_support = 0.05  (course pair appears in >= 5% of baskets)
     min_threshold = 1.2 (lift must exceed 1.2 to be considered non-trivial)
   Only rules with n_students >= K_THRESHOLD are kept.

3. **GPA trajectory** — Ridge regression per institution on
   (mean_grade_point_so_far, n_courses_so_far) → next-semester GPA.
   Alpha tuned via 5-fold cross-validation (RidgeCV).
   Persisted with joblib in models/<institution_id>.pkl as a dict
   {"model", "residual_std"} so the endpoint can build a residual-based
   confidence interval instead of a hardcoded band.
"""

import logging
import os
import pathlib

import joblib
import numpy as np
import pandas as pd
from mlxtend.frequent_patterns import apriori, association_rules
from mlxtend.preprocessing import TransactionEncoder
from sklearn.linear_model import RidgeCV

logger = logging.getLogger(__name__)

K_THRESHOLD = int(os.environ.get("K_ANONYMITY_THRESHOLD", "10"))
MODELS_DIR = pathlib.Path(os.environ.get("MODELS_DIR", "models"))

# Apriori hyperparameters
_MIN_SUPPORT = 0.05
_MIN_LIFT = 1.2


def compute_difficulty(course_stats: pd.DataFrame) -> pd.DataFrame:
    """Return per-course difficulty index using a Bayesian prior blend."""
    eligible = course_stats[course_stats["n_students"] >= K_THRESHOLD]
    if eligible.empty:
        return eligible.assign(difficulty_score=pd.Series(dtype=float))

    prior = float(eligible["pass_rate"].mean())
    m = float(K_THRESHOLD)

    def blend(row: pd.Series) -> float:
        n = float(row["n_students"])
        pr = float(row["pass_rate"])
        return (n * pr + m * prior) / (n + m)

    course_stats = course_stats.copy()
    course_stats["difficulty_score"] = 1.0 - course_stats.apply(blend, axis=1)
    return course_stats


def mine_associations(baskets: pd.DataFrame) -> pd.DataFrame:
    """Run Apriori + association_rules; return rules with n_students >= K."""
    transactions = baskets["courses"].tolist()

    te = TransactionEncoder()
    te_array = te.fit_transform(transactions)
    basket_df = pd.DataFrame(te_array, columns=te.columns_)

    frequent = apriori(basket_df, min_support=_MIN_SUPPORT, use_colnames=True)
    if frequent.empty:
        return pd.DataFrame(
            columns=["antecedents", "consequents", "support", "confidence", "lift", "n_students"]
        )

    rules = association_rules(frequent, metric="lift", min_threshold=_MIN_LIFT)

    # Only keep pairwise rules (antecedent len == 1, consequent len == 1)
    rules = rules[rules["antecedents"].apply(len) == 1]
    rules = rules[rules["consequents"].apply(len) == 1]

    n_baskets = len(transactions)
    rules["n_students"] = (rules["support"] * n_baskets).round().astype(int)

    rules = rules[rules["n_students"] >= K_THRESHOLD]
    rules = rules.sort_values("lift", ascending=False).reset_index(drop=True)

    return rules


def train_trajectory_models(clean_df: pd.DataFrame) -> dict[str, object]:
    """Train one Ridge regression model per institution."""
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    models: dict[str, object] = {}

    for institution_id, group in clean_df.groupby("institution_id"):
        # Build a per-student panel: for each student (linked via the salted
        # student_hash pseudonym), walk their grade history in chronological
        # order and use cumulative stats to predict their next grade point.
        panels: list[pd.DataFrame] = []
        for _student, sgroup in group.groupby("student_hash"):
            sgroup = sgroup.sort_values(["academic_year", "semester"]).copy()
            sgroup["cum_mean_gp"] = sgroup["grade_point"].expanding().mean()
            sgroup["cum_n_courses"] = range(1, len(sgroup) + 1)
            sgroup["next_gpa"] = sgroup["grade_point"].shift(-1)
            panels.append(sgroup.dropna(subset=["next_gpa"]))

        panel = pd.concat(panels, ignore_index=True) if panels else pd.DataFrame()

        if len(panel) < K_THRESHOLD:
            logger.warning("Institution %s: insufficient data for trajectory model", institution_id)
            continue

        X = panel[["cum_mean_gp", "cum_n_courses"]].values
        y = panel["next_gpa"].values

        model = RidgeCV(alphas=[0.1, 1.0, 10.0], cv=5)
        model.fit(X, y)

        # Residual standard deviation on the training set — drives the
        # confidence band at prediction time (1.645 * std ≈ 90% interval).
        residuals = y - model.predict(X)
        residual_std = float(np.std(residuals, ddof=1)) if len(residuals) > 1 else 0.0

        artifact = {"model": model, "residual_std": residual_std}
        model_path = MODELS_DIR / f"{institution_id}.pkl"
        joblib.dump(artifact, model_path)
        models[str(institution_id)] = artifact
        logger.info(
            "Trajectory model saved: %s (alpha=%.2f, residual_std=%.3f)",
            model_path,
            float(model.alpha_),
            residual_std,
        )

    return models
