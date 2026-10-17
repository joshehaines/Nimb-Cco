"""Care Inspectorate Scotland datastore.

Source: https://www.careinspectorate.scot/resources-data/data-and-statistics/datastore
Cadence: monthly
Notes: Every registered care service in Scotland with provider, capacity, grades and postcode. Care homes and day
care of children go into register_records as register 'CI Scotland' (child minders are individuals and are left
out, as Ofsted's are). The latest month's CSV is found from the datastore library page. Care Inspectorate Wales
publishes no bulk register (search and reports only), so Welsh care services are not loaded. OGL.
"""
from __future__ import annotations

import re
from pathlib import Path
from typing import Iterator

from .base import USER_AGENT, download, writable_dir
from .parsers._util import norm_postcode, parse_date, to_int

SOURCE_URL = "https://www.careinspectorate.scot/resources-data/data-and-statistics/datastore"
CADENCE = "monthly"
LICENCE = "OGL"
KEEP = {"Care Home Service": "care home", "Day Care of Children": "day care of children"}


def fetch(workdir: Path) -> Path:
    p = workdir / "registers" / "ci_scotland_datastore.csv"
    if p.exists() and p.stat().st_size > 0:
        return p
    import httpx

    base = "https://www.careinspectorate.scot"
    html = httpx.get(SOURCE_URL, headers={"User-Agent": USER_AGENT}, timeout=60, follow_redirects=True).text
    pages = sorted(set(re.findall(r"/resources-data/publications-and-statistics/library/datastore-[a-z0-9-]+", html)))
    for page in reversed(pages):   # newest month first is not guaranteed by name; try until a CSV link appears
        sub = httpx.get(base + page, headers={"User-Agent": USER_AGENT}, timeout=60, follow_redirects=True).text
        links = re.findall(r"https://[^\"']+datastoreexternal\.csv", sub)
        if links:
            return download(links[0], writable_dir(workdir, "ci_scotland") / "registers", "ci_scotland_datastore.csv")
    raise NotImplementedError("ci_scotland: no datastore CSV link found on the library pages")


def parse(path) -> Iterator[dict]:
    import csv

    with open(path, encoding="cp1252", errors="replace", newline="") as f:
        for r in csv.DictReader(f):
            service = (r.get("CareService") or "").strip()
            if service not in KEEP or (r.get("ServiceStatus") or "").strip() != "Active":
                continue
            beds = to_int(r.get("TotalBeds")) or to_int(r.get("Registered_Places"))
            grade = (r.get("MinGrade") or "").strip()
            yield {
                "register": "CI Scotland", "register_id": r["CSNumber"].strip(), "name": (r.get("ServiceName") or "").strip(), "provider_name": (r.get("ServiceProvider") or "").strip() or None,
                "provider_id": (r.get("SP_number") or "").strip() or None, "status": "Registered", "registered_at": parse_date((r.get("DateReg") or "").strip()),
                "rating": f"Grade {grade}" if grade else None, "rating_date": parse_date((r.get("Publication_of_Latest_Grading") or "").strip()),
                "capacity": beds, "capacity_label": "beds" if service == "Care Home Service" else "places",
                "address": ", ".join(x.strip() for x in (r.get("Address_line_1"), r.get("Address_line_2"), r.get("Address_line_3"), r.get("Address_line_4"), r.get("Service_town")) if x and x.strip()),
                "postcode": norm_postcode(r.get("Service_Postcode")),
                "extra": {"careService": service, "subtype": (r.get("Subtype") or "").strip() or None, "serviceType": (r.get("ServiceType") or "").strip() or None,
                          "careHome": service == "Care Home Service", "maxGrade": to_int(r.get("MaxGrade")), "simdDecile": to_int(r.get("SIMD2020_Decile"))},
                "source": "Care Inspectorate Scotland", "licence": "OGL",
            }


async def load(conn, path: Path) -> int:
    from ._upsert import upsert_register

    return await upsert_register(conn, parse(path))


def diff(conn) -> int:
    return 0
