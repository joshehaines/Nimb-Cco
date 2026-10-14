from __future__ import annotations

import csv
import io
import re
from datetime import date, datetime
from pathlib import Path
from typing import IO, Iterable, Iterator


def open_text(path: str | Path | IO[str]) -> IO[str]:
    if hasattr(path, "read"):
        return path  # type: ignore[return-value]
    return open(path, "r", encoding="utf-8-sig", newline="")


def read_csv(path, **kw) -> Iterator[dict[str, str]]:
    f = open_text(path)
    reader = csv.DictReader(f, **kw)
    reader.fieldnames = [norm_header(h) for h in (reader.fieldnames or [])]
    for row in reader:
        yield {k: (v.strip() if isinstance(v, str) else v) for k, v in row.items() if k is not None}


def norm_header(h: str) -> str:
    """Lower-case, trimmed, punctuation collapsed to single underscores: 'Proprietor Name (1)' -> 'proprietor_name_1'."""
    h = (h or "").strip().lower()
    h = re.sub(r"[^a-z0-9]+", "_", h)
    return h.strip("_")


def pick(row: dict[str, str], *candidates: str, contains: Iterable[str] = ()) -> str | None:
    """First non-empty value among exact normalised headers, else the first header containing all tokens."""
    for c in candidates:
        v = row.get(norm_header(c))
        if v not in (None, ""):
            return v
    toks = [t.lower() for t in contains]
    if toks:
        for k, v in row.items():
            if v not in (None, "") and all(t in k for t in toks):
                return v
    return None


_DATE_FORMATS = ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%d-%b-%Y", "%d-%B-%Y", "%Y-%m-%d %H:%M", "%Y-%m-%dT%H:%M:%S", "%d %B %Y", "%Y%m%d")


def parse_date(v: str | None) -> date | None:
    if not v:
        return None
    v = v.strip()
    if len(v) == 11 and v[2] == '-' and v[6] == '-':
        v = v[:3] + v[3:6].title() + v[6:]
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(v[: len(datetime.now().strftime(fmt))] if fmt.endswith("%M") else v, fmt).date()
        except ValueError:
            continue
    try:
        return datetime.fromisoformat(v.replace("Z", "+00:00")).date()
    except ValueError:
        return None


def to_int(v) -> int | None:
    if v in (None, ""):
        return None
    try:
        return int(float(str(v).replace(",", "").strip()))
    except ValueError:
        return None


def to_float(v) -> float | None:
    if v in (None, ""):
        return None
    try:
        return float(str(v).replace(",", "").strip())
    except ValueError:
        return None


def norm_postcode(v: str | None) -> str | None:
    if not v:
        return None
    s = re.sub(r"\s+", "", v.upper())
    if len(s) < 5:
        return s or None
    return f"{s[:-3]} {s[-3:]}"


def text_of(data: str | bytes | Path | IO) -> str:
    if isinstance(data, Path):
        return data.read_text(encoding="utf-8-sig")
    if hasattr(data, "read"):
        d = data.read()
        return d.decode("utf-8-sig") if isinstance(d, bytes) else d
    if isinstance(data, bytes):
        return data.decode("utf-8-sig")
    return data


def sio(text: str) -> IO[str]:
    return io.StringIO(text)
