#!/usr/bin/env python3
"""Fail if the live DB schema is missing any table or column defined by the models.

Run AFTER `alembic upgrade head` (CI and pre-deploy). This catches the class of
bug where a model is added but no migration creates its table/column, which a
SQLite-based test suite silently misses. It only checks the *additive* direction
(model -> DB) so it does not false-positive on pgvector's custom HNSW index or
other DB-only objects that Alembic autogenerate cannot model.

Reads the DB URL from settings.DATABASE_URL (env: DATABASE_URL / POSTGRES_*).
Exits 1 on drift, 0 when the DB satisfies every model table and column.
"""
import os
import sys

# Allow running as `python scripts/check_schema_drift.py` from the repo root.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import create_engine, inspect

from app.db.base import Base
import app.models  # noqa: F401  registers most models on Base.metadata
import app.models.transaction  # noqa: F401  ensure Transaction is registered too
from app.core.config import settings

IGNORE_TABLES = {"alembic_version"}


def main() -> int:
    engine = create_engine(settings.DATABASE_URL)
    insp = inspect(engine)

    db_tables = set(insp.get_table_names())
    model_tables = set(Base.metadata.tables.keys())

    missing_tables = sorted(model_tables - db_tables)
    missing_columns = []
    for tname in sorted(model_tables & db_tables):
        db_cols = {c["name"] for c in insp.get_columns(tname)}
        for col in Base.metadata.tables[tname].columns:
            if col.name not in db_cols:
                missing_columns.append(f"{tname}.{col.name}")

    if missing_tables or missing_columns:
        print("SCHEMA DRIFT DETECTED — models define objects the DB is missing:")
        for t in missing_tables:
            print(f"  - missing table:  {t}")
        for c in missing_columns:
            print(f"  - missing column: {c}")
        print("\nGenerate a migration (alembic revision --autogenerate), review it, and commit.")
        return 1

    print(f"OK: all {len(model_tables)} model tables and their columns exist in the DB.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
