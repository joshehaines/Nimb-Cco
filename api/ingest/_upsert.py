"""Async helpers shared by the ingest loaders."""
from __future__ import annotations

import json
from typing import AsyncIterable, Iterable


async def run(conn, sql: str, *args):
    return await conn.execute(sql, *args)


async def upsert_register(conn, rows: Iterable[dict] | AsyncIterable[dict]) -> int:
    """Upsert normalised register records (CQC, Ofsted, FSA, NHSBSA) into register_records."""
    n = 0
    for r in rows:
        await run(conn, """insert into register_records (register, register_id, name, provider_name, provider_id, status, registered_at, rating, rating_date, capacity, capacity_label, postcode, address, geom, extra, source, licence)
                     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13, case when $14::float8 is null then null else ST_SetSRID(ST_MakePoint($14,$15),4326) end, $16::jsonb, $17, $18)
                     on conflict (register, register_id) do update set name=excluded.name, provider_name=excluded.provider_name, status=excluded.status, rating=excluded.rating,
                     rating_date=excluded.rating_date, capacity=excluded.capacity, postcode=excluded.postcode, address=excluded.address, geom=coalesce(excluded.geom, register_records.geom), extra=excluded.extra, fetched_at=now()""",
            r["register"], r["register_id"], r.get("name"), r.get("provider_name"), r.get("provider_id"), r.get("status"), r.get("registered_at"), r.get("rating"), r.get("rating_date"),
            r.get("capacity"), r.get("capacity_label"), r.get("postcode"), r.get("address"), r.get("lon"), r.get("lat"), json.dumps(r.get("extra") or {}), r["source"], r["licence"])
        n += 1
    return n
