"""Charity Commission register of charities (England and Wales).

Source: https://register-of-charities.charitycommission.gov.uk/register/full-register-download
Cadence: daily extract (load monthly)
Notes: The public extract of main charities (publicextract.charity, JSON). Registered main charities (not linked
subsidiaries) go into `charities` with their company number where incorporated, income and insolvency flags.
The linkage job matches operators to charities by normalised name, which recovers many care, childcare and
nursery operators that are not companies. OGL.
"""
from __future__ import annotations

import json
import zipfile
from pathlib import Path
from typing import Iterator

from .base import download, writable_dir

SOURCE_URL = "https://register-of-charities.charitycommission.gov.uk/register/full-register-download"
CADENCE = "monthly"
LICENCE = "OGL"
EXTRACT = "https://ccewuksprdoneregsadata1.blob.core.windows.net/data/json/publicextract.charity.zip"

CREATE = [
    """create table if not exists charities (
      charity_number      bigint primary key,
      name                text not null,
      status              text,
      company_number      text,
      address             text,
      postcode            text,
      income              bigint,
      insolvent           boolean not null default false,
      in_administration   boolean not null default false,
      registered          date,
      source              text not null default 'Charity Commission register',
      licence             licence_class not null default 'OGL',
      fetched_at          timestamptz not null default now()
    )""",
]


def fetch(workdir: Path) -> Path:
    for p in (workdir / "registers" / "charity_publicextract.zip", workdir / "charity_publicextract.zip"):
        if p.exists() and p.stat().st_size > 0:
            return p
    return download(EXTRACT, writable_dir(workdir, "charities") / "registers", "charity_publicextract.zip")


def iter_objects(lines: Iterator[str]) -> Iterator[dict]:
    """The extract is a JSON array written one object per line ('[{...}', ',{...}', ']'); parse it line by line."""
    for line in lines:
        s = line.strip().lstrip("﻿")
        if s.startswith("["):
            s = s[1:]
        if s.startswith(","):
            s = s[1:]
        if s.endswith("]"):
            s = s[:-1]
        s = s.strip().rstrip(",")
        if not s.startswith("{"):
            continue
        try:
            yield json.loads(s)
        except ValueError:
            continue


def parse(lines: Iterator[str]) -> Iterator[tuple]:
    from .companies_house_psc import norm_number
    from .parsers._util import norm_postcode

    for c in iter_objects(lines):
        if c.get("charity_registration_status") != "Registered" or c.get("linked_charity_number") not in (0, None):
            continue
        addr = ", ".join(x for x in (c.get(f"charity_contact_address{i}") for i in range(1, 6)) if x)
        reg = (c.get("date_of_registration") or "")[:10] or None
        yield (int(c["registered_charity_number"]), c.get("charity_name") or "", c.get("charity_registration_status"), norm_number(c.get("charity_company_registration_number")),
               addr or None, norm_postcode(c.get("charity_contact_postcode")), int(c["latest_income"]) if c.get("latest_income") is not None else None,
               bool(c.get("charity_insolvent")), bool(c.get("charity_in_administration")), reg)


UPSERT = """insert into charities (charity_number, name, status, company_number, address, postcode, income, insolvent, in_administration, registered)
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::date)
    on conflict (charity_number) do update set name = excluded.name, status = excluded.status, company_number = excluded.company_number, address = excluded.address,
        postcode = excluded.postcode, income = excluded.income, insolvent = excluded.insolvent, in_administration = excluded.in_administration, fetched_at = now()"""


async def load(conn, path: Path) -> int:
    import io

    from ._upsert import Batcher, norm_company_sql

    for sql in CREATE:
        await conn.execute(sql)
    b = Batcher(conn, UPSERT, size=2000)
    with zipfile.ZipFile(path) as z, z.open(z.namelist()[0]) as raw:
        for row in parse(io.TextIOWrapper(raw, encoding="utf-8-sig", errors="replace")):
            await b.add(*row)
    await b.flush()
    await conn.execute(f"create index if not exists charities_norm_name_idx on charities (({norm_company_sql('name')}))")
    await conn.execute("analyze charities")
    return b.count


def diff(conn) -> int:
    return 0
