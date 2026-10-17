"""English Indices of Deprivation 2025.

Source: https://www.gov.uk/government/statistics/english-indices-of-deprivation-2025
Cadence: every four to five years
Notes: File 7 (all ranks, scores, deciles and population denominators) for every 2021 LSOA in England. Adds the
Index of Multiple Deprivation score, rank and decile and the income deprivation rate to census_areas (run
ons_census first). Wales publishes the Welsh Index of Multiple Deprivation separately on its own scale; Welsh
areas keep a null decile. OGL v3.
"""
from __future__ import annotations

import csv
from pathlib import Path
from typing import Iterator

from .base import download, writable_dir

SOURCE_URL = "https://www.gov.uk/government/statistics/english-indices-of-deprivation-2025"
CADENCE = "quinquennial"
LICENCE = "OGL"
FILE7 = "https://assets.publishing.service.gov.uk/media/691ded56d140bbbaa59a2a7d/File_7_IoD2025_All_Ranks_Scores_Deciles_Population_Denominators.csv"


def fetch(workdir: Path) -> Path:
    for p in (workdir / "ons" / "iod2025_file7.csv", workdir / "iod2025_file7.csv"):
        if p.exists() and p.stat().st_size > 0:
            return p
    return download(FILE7, writable_dir(workdir, "imd") / "ons", "iod2025_file7.csv")


def _col(header: list[str], *starts: str) -> str:
    for s in starts:
        for h in header:
            if h.startswith(s):
                return h
    raise KeyError(starts[0])


def parse(path: Path) -> Iterator[tuple[str, float | None, int | None, int | None, float | None]]:
    """(LSOA 2021 code, IMD score, IMD rank, IMD decile, income deprivation rate)."""
    with open(path, encoding="utf-8-sig", newline="") as f:
        r = csv.DictReader(f)
        h = r.fieldnames or []
        code, score, rank, decile = _col(h, "LSOA code"), _col(h, "Index of Multiple Deprivation (IMD) Score"), _col(h, "Index of Multiple Deprivation (IMD) Rank"), _col(h, "Index of Multiple Deprivation (IMD) Decile")
        income = _col(h, "Income Score")
        for row in r:
            def num(k, cast=float):
                try:
                    return cast(float(row[k]))
                except (TypeError, ValueError, KeyError):
                    return None
            if row.get(code):
                yield row[code], num(score), num(rank, int), num(decile, int), num(income)


UPDATE = "update census_areas set imd_score = $2, imd_rank = $3, imd_decile = $4, income_rate = $5 where code = $1"


async def load(conn, path: Path) -> int:
    from ._upsert import Batcher

    if not await conn.fetchval("select to_regclass('census_areas') is not null"):
        raise NotImplementedError("imd: run the ons_census job first (census_areas does not exist)")
    b = Batcher(conn, UPDATE, size=1000)
    for row in parse(path):
        await b.add(*row)
    await b.flush()
    return await conn.fetchval("select count(*) from census_areas where imd_decile is not null") or 0


def diff(conn) -> int:
    return 0
