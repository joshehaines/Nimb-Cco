"""ONS Census 2021 small areas.

Source: https://www.nomisweb.co.uk/sources/census_2021_bulk
Cadence: decennial
Notes: Usual residents by five-year age band (TS007A) and households (TS041) for every 2021 Lower layer Super
Output Area in England and Wales, from the Nomis bulk downloads, joined to the LSOA (Dec 2021) super generalised
clipped boundaries from the ONS Open Geography Portal feature service. Loads census_areas, which the catchment
analysis area-weights against its radius. OGL v3: "Source: Office for National Statistics licensed under the Open
Government Licence v.3.0. Contains OS data © Crown copyright and database right 2021".
"""
from __future__ import annotations

import csv
import io
import json
import time
import zipfile
from pathlib import Path
from typing import Iterator

import httpx

from .base import USER_AGENT, download, writable_dir

SOURCE_URL = "https://www.nomisweb.co.uk/sources/census_2021_bulk"
CADENCE = "decennial"
LICENCE = "OGL"
NOMIS = "https://www.nomisweb.co.uk/output/census/2021/census2021-{table}.zip"
BOUNDARIES = "https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/LSOA_2021_EW_BSC_V4_RUC/FeatureServer/0/query"
PAGE = 2000

CREATE = [
    """create table if not exists census_areas (
      code         text primary key,
      name         text,
      geom         geometry(MultiPolygon, 4326),
      population   integer,
      households   integer,
      age_0_4      integer,
      age_65_plus  integer,
      age_85_plus  integer,
      adults       integer,
      imd_score    real,
      imd_rank     integer,
      imd_decile   smallint,
      income_rate  real,
      source       text not null default 'ONS Census 2021 (TS007A, TS041), LSOA Dec 2021 BSC boundaries',
      licence      licence_class not null default 'OGL',
      fetched_at   timestamptz not null default now()
    )""",
    "create index if not exists census_areas_geom_gix on census_areas using gist (geom)",
]


def fetch(workdir: Path) -> Path:
    """Nomis zips and the boundary pages into <workdir>/ons; returns that folder."""
    out = writable_dir(workdir, "ons_census") / "ons"
    out.mkdir(parents=True, exist_ok=True)
    for table in ("ts007a", "ts041"):
        if not (out / f"census2021-{table}.zip").exists():
            download(NOMIS.format(table=table), out, f"census2021-{table}.zip")
    target = out / "lsoa2021_bsc.geojson"
    if not target.exists():
        features: list[dict] = []
        with httpx.Client(headers={"User-Agent": USER_AGENT}, timeout=120) as client:
            offset = 0
            while True:
                r = client.get(BOUNDARIES, params={"where": "1=1", "outFields": "LSOA21CD,LSOA21NM", "outSR": 4326, "f": "geojson", "resultOffset": offset, "resultRecordCount": PAGE})
                r.raise_for_status()
                batch = r.json().get("features") or []
                features.extend(batch)
                if len(batch) < PAGE:
                    break
                offset += PAGE
                time.sleep(0.5)
        target.write_text(json.dumps({"type": "FeatureCollection", "features": features}))
    return out


def _lsoa_rows(zip_path: Path) -> Iterator[dict[str, str]]:
    with zipfile.ZipFile(zip_path) as z:
        name = next(n for n in z.namelist() if n.lower().endswith("-lsoa.csv"))
        yield from csv.DictReader(io.TextIOWrapper(z.open(name), encoding="utf-8-sig"))


def _int(v) -> int:
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return 0


def parse_ages(zip_path: Path) -> dict[str, dict[str, int]]:
    """LSOA code -> population, 0-4, 65+, 85+ and adults (18+, taking two fifths of the 15-19 band)."""
    out = {}
    for r in _lsoa_rows(zip_path):
        code = r.get("geography code")
        if not code:
            continue
        band = {k.split("Age: ", 1)[-1]: _int(v) for k, v in r.items() if k.startswith("Age:")}
        older = ("65 to 69", "70 to 74", "75 to 79", "80 to 84")
        children = band.get("Aged 4 years and under", 0) + band.get("Aged 5 to 9 years", 0) + band.get("Aged 10 to 14 years", 0)
        adults = band.get("Total", 0) - children - round(band.get("Aged 15 to 19 years", 0) * 0.6)   # 18+: three fifths of 15-19 are under 18
        out[code] = {
            "population": band.get("Total", 0),
            "age_0_4": band.get("Aged 4 years and under", 0),
            "age_85_plus": band.get("Aged 85 years and over", 0),
            "age_65_plus": sum(band.get(f"Aged {o} years", 0) for o in older) + band.get("Aged 85 years and over", 0),
            "adults": adults,
            "name": r.get("geography"),
        }
    return out


def parse_households(zip_path: Path) -> dict[str, int]:
    out = {}
    for r in _lsoa_rows(zip_path):
        code = r.get("geography code")
        val = next((v for k, v in r.items() if k.startswith("Number of households")), None)
        if code:
            out[code] = _int(val)
    return out


UPSERT = """insert into census_areas (code, name, geom, population, households, age_0_4, age_65_plus, age_85_plus, adults)
    values ($1, $2, ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($3), 4326)), $4, $5, $6, $7, $8, $9)
    on conflict (code) do update set name = excluded.name, geom = excluded.geom, population = excluded.population, households = excluded.households,
        age_0_4 = excluded.age_0_4, age_65_plus = excluded.age_65_plus, age_85_plus = excluded.age_85_plus, adults = excluded.adults, fetched_at = now()"""


async def load(conn, path: Path) -> int:
    from ._upsert import Batcher

    for sql in CREATE:
        await conn.execute(sql)
    ages = parse_ages(path / "census2021-ts007a.zip")
    hh = parse_households(path / "census2021-ts041.zip")
    fc = json.loads((path / "lsoa2021_bsc.geojson").read_text())
    b = Batcher(conn, UPSERT, size=500)
    for f in fc["features"]:
        p = f.get("properties") or {}
        code = p.get("LSOA21CD")
        a = ages.get(code)
        if not code or not a or not f.get("geometry"):
            continue
        await b.add(code, p.get("LSOA21NM") or a["name"], json.dumps(f["geometry"]), a["population"], hh.get(code, 0), a["age_0_4"], a["age_65_plus"], a["age_85_plus"], a["adults"])
    await b.flush()
    await conn.execute("analyze census_areas")
    return b.count


def diff(conn) -> int:
    return 0
