"""Entry point: python -m ingest.run <job> [--workdir DIR]

Runs fetch -> load -> diff for one job and upserts the job's row in data_sources (last_run, status, records, note).
fetch() may return one path or a list of paths; load() is called once per path and the counts are summed.
"""
from __future__ import annotations

import argparse
import asyncio
import importlib
import inspect
import os
import time
from datetime import datetime, timezone
from pathlib import Path

import asyncpg


def _module_meta(job: str, mod) -> dict:
    doc = (mod.__doc__ or "").strip().splitlines()
    name = doc[0].rstrip(".") if doc else job
    source = next((l.split(":", 1)[1].strip() for l in doc if l.lower().startswith("source:")), None)
    return {"name": name, "cadence": getattr(mod, "CADENCE", None), "licence": getattr(mod, "LICENCE", "OGL"), "docs_url": source if source and source.startswith("http") else getattr(mod, "SOURCE_URL", None) or None}


async def _maybe(fn, *args):
    return await fn(*args) if inspect.iscoroutinefunction(fn) else fn(*args)


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("job")
    ap.add_argument("--workdir", default=os.environ.get("INGEST_WORKDIR", "/tmp/cpi-ingest"))
    args = ap.parse_args()
    mod = importlib.import_module(f"ingest.{args.job}")
    conn = await asyncpg.connect(os.environ.get("DATABASE_URL", "postgresql://cpi:cpi@localhost:5432/cpi"))
    status, records, note = "ok", None, None
    started = time.monotonic()
    try:
        paths = mod.fetch(Path(args.workdir))
        paths = list(paths) if isinstance(paths, (list, tuple)) else [paths]
        records = 0
        for p in paths:
            n = await _maybe(mod.load, conn, p)
            records += n or 0
            print(f"{args.job}: {p} -> {n} records ({time.monotonic() - started:.0f}s)", flush=True)
        raised = await _maybe(mod.diff, conn) if hasattr(mod, "diff") else 0
        note = f"{records} records from {len(paths)} file(s), {raised} alerts, {time.monotonic() - started:.0f}s"
    except NotImplementedError as e:
        status, note = "not-configured", str(e)
    except Exception as e:  # noqa: BLE001
        status, note = "error", f"{type(e).__name__}: {str(e)[:450]}"
    meta = _module_meta(args.job, mod)
    await conn.execute(
        """insert into data_sources (id, name, provider, licence, cadence, status, docs_url, last_run, records, note)
           values ($1, $2, null, $3, $4, $5, $6, $7, $8, $9)
           on conflict (id) do update set last_run=excluded.last_run, status=excluded.status, records=coalesce(excluded.records, data_sources.records),
             note=excluded.note, cadence=coalesce(data_sources.cadence, excluded.cadence), docs_url=coalesce(data_sources.docs_url, excluded.docs_url)""",
        args.job.replace("_", "-"), meta["name"], meta["licence"], meta["cadence"], status, meta["docs_url"], datetime.now(timezone.utc), records, note,
    )
    await conn.close()
    print(args.job, status, note, flush=True)
    if status == "error":
        raise SystemExit(1)


if __name__ == "__main__":
    asyncio.run(main())
