from __future__ import annotations

import csv
import io
import re
import sys
import xml.etree.ElementTree as ET
import zipfile
from datetime import date, datetime
from pathlib import Path
from typing import IO, Iterable, Iterator

# planning.data.gov.uk WKT geometries and VOA address fields exceed the csv module's default 128 KB field limit.
csv.field_size_limit(sys.maxsize)

TEXT_ENCODING = "utf-8-sig"


def _is_zip(path: Path) -> bool:
    return path.is_file() and zipfile.is_zipfile(path)


def iter_inputs(path: str | Path | IO, suffixes: Iterable[str] = (".csv",), binary: bool = False, exclude: Iterable[str] = ()) -> Iterator[tuple[str, IO]]:
    """Yield (name, handle) for every input file behind `path`.

    `path` may be an open handle, a plain file, a zip archive (members whose lower-cased name ends with one
    of `suffixes`, nested folders included) or a directory (recursed; zips inside it are opened too).
    Members or files whose lower-cased name contains any of `exclude` are skipped (a plain file given
    directly is always read).
    Text handles decode with utf-8-sig and replace undecodable bytes, which keeps cp1252 stragglers in
    VOA and Companies House files from aborting a multi-hour load.
    """
    if hasattr(path, "read"):
        yield getattr(path, "name", "<stream>"), path  # type: ignore[misc]
        return
    p = Path(path)
    sfx = tuple(s.lower() for s in suffixes)
    skip = tuple(e.lower() for e in exclude)
    if p.is_dir():
        for child in sorted(p.rglob("*")):
            if child.is_file() and (child.name.lower().endswith(sfx) or _is_zip(child)) and not any(e in child.name.lower() for e in skip):
                yield from iter_inputs(child, sfx, binary, skip)
        return
    if _is_zip(p):
        with zipfile.ZipFile(p) as z:
            for info in sorted(z.infolist(), key=lambda i: i.filename):
                low = info.filename.lower()
                if info.is_dir() or not low.endswith(sfx) or "__macosx" in low or any(e in low for e in skip):
                    continue
                with z.open(info) as raw:
                    if binary:
                        yield f"{p.name}:{info.filename}", raw
                    else:
                        yield f"{p.name}:{info.filename}", io.TextIOWrapper(raw, encoding=TEXT_ENCODING, errors="replace", newline="")
        return
    if binary:
        with p.open("rb") as f:
            yield p.name, f
    else:
        with p.open("r", encoding=TEXT_ENCODING, errors="replace", newline="") as f:
            yield p.name, f


def open_text(path: str | Path | IO[str]) -> IO[str]:
    """Open one text file (kept for callers that handle a single plain file themselves)."""
    if hasattr(path, "read"):
        return path  # type: ignore[return-value]
    return open(path, "r", encoding=TEXT_ENCODING, errors="replace", newline="")


def iter_lines(path, suffixes: Iterable[str] = (".csv", ".txt"), exclude: Iterable[str] = ()) -> Iterator[str]:
    """Lines from every text input behind `path` (plain file, zip or directory)."""
    for _, f in iter_inputs(path, suffixes, exclude=exclude):
        yield from f


def read_csv(path, suffixes: Iterable[str] = (".csv",), ods_sheet: int | str = 0, exclude: Iterable[str] = (), **kw) -> Iterator[dict[str, str]]:
    """Rows from every CSV behind `path` as dicts keyed by normalised header.

    Accepts a plain CSV, an .ods spreadsheet (`ods_sheet`: index or case-insensitive part of the sheet
    name), a zip of CSVs, a directory or an open handle.
    """
    p = Path(path) if not hasattr(path, "read") else None
    if p is not None and p.is_file() and p.suffix.lower() == ".ods":
        yield from _rows_to_dicts(read_ods(p, ods_sheet))
        return
    for name, f in iter_inputs(path, tuple(suffixes) + (".ods",), exclude=exclude):
        if name.lower().endswith(".ods"):
            yield from _rows_to_dicts(read_ods(f, ods_sheet))
            continue
        yield from _rows_to_dicts(csv.reader(f, **kw))


def _rows_to_dicts(rows: Iterator[list[str]], min_header_cells: int = 3) -> Iterator[dict[str, str]]:
    """Zip rows against the first row that looks like a header.

    Publishers put title and note lines above the header (Ofsted's CSV has two, CQC's sheet one), so the
    header is the first row with at least `min_header_cells` non-empty cells; blank rows are skipped.
    """
    header: list[str] | None = None
    for cells in rows:
        if header is None:
            if sum(1 for c in cells if c.strip()) < min_header_cells:
                continue
            header = [norm_header(c) for c in cells]
            continue
        if not any(c.strip() for c in cells):
            continue
        cells = cells + [""] * (len(header) - len(cells))
        yield {h: cells[i].strip() for i, h in enumerate(header) if h}


_ODS_NS = {
    "table": "urn:oasis:names:tc:opendocument:xmlns:table:1.0",
    "text": "urn:oasis:names:tc:opendocument:xmlns:text:1.0",
    "office": "urn:oasis:names:tc:opendocument:xmlns:office:1.0",
}
_T = "{%s}" % _ODS_NS["table"]
_TX = "{%s}" % _ODS_NS["text"]
_OF = "{%s}" % _ODS_NS["office"]


def _ods_sheet_index(src, sheet: int | str) -> int:
    if isinstance(sheet, int):
        return sheet
    with zipfile.ZipFile(src) as z, z.open("content.xml") as content:
        names = [el.get(_T + "name") or "" for ev, el in ET.iterparse(content, events=("start",)) if el.tag == _T + "table"]
    if hasattr(src, "seek"):
        src.seek(0)
    for i, n in enumerate(names):
        if sheet.lower() in n.lower():
            return i
    return 0


def read_ods(path: str | Path | IO, sheet: int | str = 0, max_repeat: int = 2000) -> Iterator[list[str]]:
    """Rows of one sheet of an OpenDocument spreadsheet as lists of strings, without extra dependencies.

    CQC and Ofsted publish their registers as .ods. Streams content.xml with iterparse, honours
    number-columns-repeated / number-rows-repeated (capped so trailing blank runs do not explode),
    and trims trailing empty cells. Dates come back as the ISO value the file stores.
    """
    src = path if hasattr(path, "read") else Path(path)
    sheet = _ods_sheet_index(src, sheet)
    with zipfile.ZipFile(src) as z, z.open("content.xml") as content:
        sheet_index = -1
        for event, el in ET.iterparse(content, events=("start", "end")):
            if event == "start" and el.tag == _T + "table":
                sheet_index += 1
                continue
            if event != "end":
                continue
            if el.tag == _T + "table-row" and sheet_index == sheet:
                cells: list[str] = []
                for c in el:
                    if c.tag not in (_T + "table-cell", _T + "covered-table-cell"):
                        continue
                    rep = min(int(c.get(_T + "number-columns-repeated", "1")), max_repeat)
                    val = c.get(_OF + "date-value") or c.get(_OF + "value") if c.get(_OF + "value-type") in ("date", "float", "percentage", "currency") else None
                    if val is None:
                        val = "\n".join("".join(p.itertext()) for p in c.iter(_TX + "p")) or ""
                    cells.extend([val] * rep)
                while cells and not cells[-1].strip():
                    cells.pop()
                rows_rep = min(int(el.get(_T + "number-rows-repeated", "1")), 1 if not cells else max_repeat)
                for _ in range(rows_rep):
                    yield list(cells)
                el.clear()
            elif el.tag == _T + "table":
                el.clear()
                if sheet_index == sheet:
                    return


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


_DATE_FORMATS = ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%d-%b-%Y", "%d-%B-%Y", "%Y-%m-%d %H:%M", "%Y-%m-%dT%H:%M:%S", "%d %B %Y", "%Y%m%d", "%d/%m/%Y %H:%M", "%d/%m/%Y %H:%M:%S")


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
        return data.read_text(encoding=TEXT_ENCODING, errors="replace")
    if hasattr(data, "read"):
        d = data.read()
        return d.decode(TEXT_ENCODING, errors="replace") if isinstance(d, bytes) else d
    if isinstance(data, bytes):
        return data.decode(TEXT_ENCODING, errors="replace")
    return data


def sio(text: str) -> IO[str]:
    return io.StringIO(text)
