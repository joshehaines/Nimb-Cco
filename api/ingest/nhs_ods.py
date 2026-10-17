"""NHS Organisation Data Service: GP and dental practices.

Source: https://www.odsdatasearchandexport.nhs.uk/
Cadence: monthly
Notes: The ODS data search and export reports epraccur (GP practices and other prescribing settings) and egdpprac
(general dental practices), header-less CSVs. Active GP practices (primary role RO76) and active dental
practices go into register_records as register 'NHS ODS' with extra.kind gp|dental; postcodes are geocoded by the
linkage through postcode_centroids. The linkage attaches a practice to an existing CQC location at the same
postcode with a similar name rather than creating a second business. OGL.
"""
from __future__ import annotations

from pathlib import Path
from typing import Iterator

from .base import download, writable_dir
from .parsers._util import iter_inputs, norm_postcode, parse_date

SOURCE_URL = "https://www.odsdatasearchandexport.nhs.uk/"
CADENCE = "monthly"
LICENCE = "OGL"
REPORT = "https://www.odsdatasearchandexport.nhs.uk/api/getReport?report={name}"
REPORTS = {"epraccur": "gp", "egdpprac": "dental"}


def fetch(workdir: Path) -> list[Path]:
    out = []
    for name in REPORTS:
        p = workdir / "registers" / f"ods_{name}.csv"
        if not (p.exists() and p.stat().st_size > 0):
            p = download(REPORT.format(name=name), writable_dir(workdir, "nhs_ods") / "registers", f"ods_{name}.csv")
        out.append(p)
    return out


def parse(path) -> Iterator[dict]:
    """epraccur/egdpprac columns: 0 code, 1 name, 2 national grouping, 3 health geography, 4-8 address, 9 postcode,
    10 open date, 11 close date, 12 status, 13 sub-type, 14 commissioner, ... 25 primary role (epraccur: RO76 = GP practice;
    the older files carried a numeric prescribing setting there, 4 = GP practice)."""
    import csv

    kind = "dental" if "egdpprac" in str(path) else "gp"
    for _, f in iter_inputs(path, (".csv",)):
        for c in csv.reader(f):
            if len(c) < 13 or c[12].strip().upper() != "ACTIVE":
                continue
            if kind == "gp" and (len(c) <= 25 or c[25].strip() not in ("RO76", "4")):
                continue
            yield {
                "register": "NHS ODS", "register_id": c[0].strip(), "name": c[1].strip().title(), "status": "Active",
                "registered_at": parse_date(c[10].strip()), "address": ", ".join(x.strip().title() for x in c[4:9] if x.strip()),
                "postcode": norm_postcode(c[9]), "provider_name": None,
                "extra": {"kind": kind, "commissioner": c[14].strip() if len(c) > 14 else None, "nationalGrouping": c[2].strip()},
                "source": "NHS ODS", "licence": "OGL",
            }


async def load(conn, path: Path) -> int:
    from ._upsert import upsert_register

    return await upsert_register(conn, parse(path))


def diff(conn) -> int:
    return 0
