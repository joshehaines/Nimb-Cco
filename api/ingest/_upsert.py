"""Async helpers shared by the ingest loaders."""
from __future__ import annotations

import json
from typing import AsyncIterable, Iterable

BATCH = 1000

# SQL expression normalising a company name for exact matching across sources: upper-case, LIMITED -> LTD,
# PUBLIC LIMITED COMPANY -> PLC, then everything but letters and digits removed. The same expression backs
# the companies_norm_name_idx index created by the linkage job, so keep the two identical.
def norm_company_sql(expr: str) -> str:
    return ("regexp_replace(regexp_replace(regexp_replace(upper(coalesce(" + expr + ", '')), "
            "'PUBLIC LIMITED COMPANY', 'PLC', 'g'), '\\mLIMITED\\M', 'LTD', 'g'), '[^A-Z0-9]', '', 'g')")


async def run(conn, sql: str, *args):
    return await conn.execute(sql, *args)


class Batcher:
    """Collects parameter tuples for one statement and sends them with executemany in chunks.

    Row-at-a-time execute costs a round trip per row; the national files run to millions of rows, so
    batching is the difference between minutes and days. Call `await flush()` at the end.
    """

    def __init__(self, conn, sql: str, size: int = BATCH):
        self.conn, self.sql, self.size = conn, " ".join(sql.split()), size
        self.rows: list[tuple] = []
        self.count = 0

    async def add(self, *args) -> None:
        self.rows.append(args)
        if len(self.rows) >= self.size:
            await self.flush()

    async def flush(self) -> None:
        if not self.rows:
            return
        await self.conn.executemany(self.sql, self.rows)
        self.count += len(self.rows)
        self.rows = []


REGISTER_SQL = """insert into register_records (register, register_id, name, provider_name, provider_id, status, registered_at, rating, rating_date, capacity, capacity_label, postcode, address, geom, extra, source, licence)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13, case when $14::float8 is null then null else ST_SetSRID(ST_MakePoint($14,$15),4326) end, $16::jsonb, $17, $18)
    on conflict (register, register_id) do update set name=excluded.name, provider_name=excluded.provider_name, status=excluded.status, rating=excluded.rating,
    rating_date=excluded.rating_date, capacity=excluded.capacity, postcode=excluded.postcode, address=excluded.address, geom=coalesce(excluded.geom, register_records.geom), extra=excluded.extra, fetched_at=now()"""


async def upsert_register(conn, rows: Iterable[dict] | AsyncIterable[dict]) -> int:
    """Upsert normalised register records (CQC, Ofsted, FSA, NHSBSA) into register_records."""
    b = Batcher(conn, REGISTER_SQL)
    seen: set[tuple[str, str]] = set()
    for r in rows:
        key = (r["register"], r["register_id"])
        if key in seen:  # a repeated key inside one executemany batch would hit the same row twice
            await b.flush()
            seen.clear()
        seen.add(key)
        await b.add(r["register"], r["register_id"], r.get("name"), r.get("provider_name"), r.get("provider_id"), r.get("status"), r.get("registered_at"), r.get("rating"), r.get("rating_date"),
                    r.get("capacity"), r.get("capacity_label"), r.get("postcode"), r.get("address"), r.get("lon"), r.get("lat"), json.dumps(r.get("extra") or {}), r["source"], r["licence"])
    await b.flush()
    return b.count
