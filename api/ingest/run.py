"""Entry point: python -m ingest.run <job> [--workdir DIR]

Runs fetch -> load -> diff for one job and updates data_sources.last_run/status.
"""
from __future__ import annotations

import argparse
import asyncio
import importlib
import os
from datetime import datetime, timezone
from pathlib import Path

import asyncpg


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("job")
    ap.add_argument("--workdir", default=os.environ.get("INGEST_WORKDIR", "/tmp/cpi-ingest"))
    args = ap.parse_args()
    mod = importlib.import_module(f"ingest.{args.job}")
    conn = await asyncpg.connect(os.environ.get("DATABASE_URL", "postgresql://cpi:cpi@localhost:5432/cpi"))
    status, records, note = "ok", None, None
    try:
        path = mod.fetch(Path(args.workdir))
        records = mod.load(conn, path)
        raised = mod.diff(conn)
        note = f"{records} records, {raised} alerts"
    except NotImplementedError as e:
        status, note = "not-configured", str(e)
    except Exception as e:  # noqa: BLE001
        status, note = "error", str(e)[:500]
    await conn.execute(
        "update data_sources set last_run=$2, status=$3, records=coalesce($4, records), note=$5 where id=$1",
        args.job, datetime.now(timezone.utc), status, records, note,
    )
    await conn.close()
    print(args.job, status, note)


if __name__ == "__main__":
    asyncio.run(main())
