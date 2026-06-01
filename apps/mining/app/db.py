"""Read-only database connection for the mining service.

Uses a service-role Postgres URL. The mining service NEVER writes to user tables —
only to the *_cache tables and mining_runs.
"""

import os

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine

_engine: Engine | None = None


def get_engine() -> Engine:
    global _engine
    if _engine is None:
        url = os.environ["DATABASE_URL"]
        # The Node/pg ecosystem accepts `postgres://`, but SQLAlchemy requires
        # `postgresql://`. Normalise so one DATABASE_URL works for both runtimes.
        if url.startswith("postgres://"):
            url = "postgresql://" + url[len("postgres://") :]
        _engine = create_engine(url, pool_pre_ping=True, pool_size=3, max_overflow=2)
    return _engine


def read_query(sql: str, params: dict | None = None) -> list[dict]:
    """Execute a read-only SQL query and return rows as dicts."""
    engine = get_engine()
    with engine.connect() as conn:
        result = conn.execute(text(sql), params or {})
        return [dict(row._mapping) for row in result]
