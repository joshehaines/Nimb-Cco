"""Companies House persons with significant control.

Source: https://download.companieshouse.gov.uk/en_pscdata.html
Cadence: daily snapshot (load monthly)
Notes: The free PSC snapshot, one JSON record per line (about 13 GB unzipped), streamed from the zip. Active
(not ceased) controllers go into `pscs`; then every company's companies.pscs is rebuilt as a compact list and
companies.parent_company_number is set where a UK-registered corporate controller holds more than 50% of shares
or votes, or is the company's only corporate controller. That gives /api/companies/{n}/group real groups.
Individuals are stored by name and kind only; addresses and dates of birth are not kept. OGL.
"""
from __future__ import annotations

import io
import json
import re
import zipfile
from pathlib import Path
from typing import Iterator

from .base import download, writable_dir

SOURCE_URL = "https://download.companieshouse.gov.uk/en_pscdata.html"
CADENCE = "monthly"
LICENCE = "OGL"
PAGE = "https://download.companieshouse.gov.uk/en_pscdata.html"
MAJORITY = ("ownership-of-shares-50-to-75", "ownership-of-shares-75-to-100", "ownership-of-shares-more-than-50", "voting-rights-50-to-75", "voting-rights-75-to-100", "voting-rights-more-than-50")

CREATE = [
    """create table if not exists pscs (
      company_number      text not null,
      seq                 integer not null,
      name                text,
      kind                text not null,            -- individual | corporate | legal-person | other
      corporate_number    text,                     -- UK company number of a corporate controller, normalised
      natures             text[],
      majority            boolean not null default false,
      primary key (company_number, seq)
    )""",
    "create index if not exists pscs_corporate_idx on pscs (corporate_number) where corporate_number is not null",
]


def fetch(workdir: Path) -> Path:
    for p in sorted((workdir / "registers").glob("psc_snapshot*.zip")) + sorted(workdir.glob("persons-with-significant-control-snapshot*.zip")):
        if p.stat().st_size > 0:
            return p
    import httpx

    from .base import USER_AGENT

    html = httpx.get(PAGE, headers={"User-Agent": USER_AGENT}, timeout=60).text
    name = sorted(set(re.findall(r"persons-with-significant-control-snapshot-[\d-]+\.zip", html)))[-1]
    return download(f"https://download.companieshouse.gov.uk/{name}", writable_dir(workdir, "companies_house_psc") / "registers", "psc_snapshot.zip")


def norm_number(v: str | None) -> str | None:
    s = re.sub(r"\s+", "", (v or "").upper())
    if re.fullmatch(r"\d{1,8}", s):
        return s.zfill(8)
    if re.fullmatch(r"(SC|NI|OC|SO|NC|R0|LP|SL|NL)\d{1,6}", s):
        return s[:2] + s[2:].zfill(6)
    return None


def parse(lines: Iterator[bytes]) -> Iterator[tuple[str, str | None, str, str | None, list[str], bool]]:
    """(company_number, name, kind, corporate_number, natures, majority) for every active controller."""
    for line in lines:
        try:
            rec = json.loads(line)
        except ValueError:
            continue
        cn, d = rec.get("company_number"), rec.get("data") or {}
        if not cn or d.get("ceased_on") or d.get("ceased"):
            continue
        k = d.get("kind") or ""
        if "statement" in k or "exemption" in k or "totals" in k:
            continue
        kind = "individual" if k.startswith("individual") else "corporate" if k.startswith("corporate") else "legal-person" if k.startswith("legal") else "other"
        ident = d.get("identification") or {}
        uk = (ident.get("country_registered") or ident.get("place_registered") or "").lower()
        corp = norm_number(ident.get("registration_number")) if kind == "corporate" and (not uk or any(w in uk for w in ("england", "wales", "scotland", "northern ireland", "united kingdom", "uk", "companies house"))) else None
        natures = [str(n) for n in (d.get("natures_of_control") or [])]
        yield cn, d.get("name"), kind, corp, natures, any(n.startswith(MAJORITY) for n in natures)


INSERT = "insert into pscs (company_number, seq, name, kind, corporate_number, natures, majority) values ($1, $2, $3, $4, $5, $6, $7) on conflict (company_number, seq) do update set name = excluded.name, kind = excluded.kind, corporate_number = excluded.corporate_number, natures = excluded.natures, majority = excluded.majority"

ROLLUP = [
    # Compact controller list on every company that has one.
    """update companies c set pscs = x.list from (
         select company_number, jsonb_agg(jsonb_build_object('name', name, 'kind', case when kind = 'corporate' then 'corporate' else 'individual' end, 'companyNumber', corporate_number) order by seq) list
         from pscs group by company_number) x
       where x.company_number = c.company_number and c.pscs is distinct from x.list""",
    # Parent: a UK corporate controller holding a majority, else the only corporate controller.
    """with corp as (
         select company_number, corporate_number, majority, count(*) over (partition by company_number) n_corp
         from pscs where kind = 'corporate' and corporate_number is not null and corporate_number <> company_number
       ), pick as (
         select distinct on (company_number) company_number, corporate_number from corp
         where majority or n_corp = 1 order by company_number, majority desc
       )
       update companies c set parent_company_number = p.corporate_number from pick p
       where p.company_number = c.company_number and exists (select 1 from companies x where x.company_number = p.corporate_number)
         and c.parent_company_number is distinct from p.corporate_number""",
    "create index if not exists companies_parent_idx on companies (parent_company_number)",
]


async def load(conn, path: Path) -> int:
    from ._upsert import Batcher

    for sql in CREATE:
        await conn.execute(sql)
    await conn.execute("truncate pscs")
    b = Batcher(conn, INSERT, size=5000)
    seq = 0   # one running number across the file: unique however the snapshot orders companies
    with zipfile.ZipFile(path) as z, z.open(next(n for n in z.namelist() if n.endswith(".txt"))) as raw:
        for cn, name, kind, corp, natures, majority in parse(io.BufferedReader(raw, buffer_size=1 << 20)):
            seq += 1
            await b.add(cn, seq, name, kind, corp, natures, majority)
    await b.flush()
    await conn.execute("analyze pscs")
    for sql in ROLLUP:
        await conn.execute(sql)
    return b.count


def diff(conn) -> int:
    return 0
