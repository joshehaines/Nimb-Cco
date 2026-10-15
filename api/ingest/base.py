from __future__ import annotations

import hashlib
from pathlib import Path

import httpx

USER_AGENT = "ChristiePropertyIntelligence/0.1 (+internal; data@christie.com)"


def download(url: str, workdir: Path, name: str | None = None, headers: dict | None = None) -> Path:
    """Stream a file to workdir, skipping if an identical copy exists (by content hash of first MB + size)."""
    workdir.mkdir(parents=True, exist_ok=True)
    target = workdir / (name or url.rsplit("/", 1)[-1].split("?")[0])
    with httpx.stream("GET", url, headers={"User-Agent": USER_AGENT, **(headers or {})}, follow_redirects=True, timeout=120) as r:
        r.raise_for_status()
        tmp = target.with_suffix(target.suffix + ".part")
        with tmp.open("wb") as f:
            for chunk in r.iter_bytes():
                f.write(chunk)
    tmp.rename(target)
    return target


def file_hash(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def local_inputs(workdir: Path, *patterns: str, job: str = "") -> list[Path]:
    """The step 1 downloads for one job: files in `workdir` matching any of the glob `patterns`, sorted.

    Raises NotImplementedError (which ingest.run records as 'not-configured' rather than 'error') when
    nothing matches, naming the files scripts/data/fetch_sources.sh would have produced.
    """
    found: list[Path] = []
    for pat in patterns:
        found.extend(p for p in workdir.glob(pat) if p.is_file() and p.stat().st_size > 0)
    found = sorted(set(found))
    if not found:
        raise NotImplementedError(f"{job or 'loader'}: no files matching {', '.join(patterns)} in {workdir}; run scripts/data/fetch_sources.sh first")
    return found


def writable_dir(workdir: Path, job: str) -> Path:
    """`workdir` when it accepts writes, else a per-job directory under INGEST_STATE_DIR (default /var/tmp/cpi-ingest).

    The loader container mounts the step 1 downloads read-only; jobs that fetch for themselves (Gazette,
    PlanIt, Code-Point) keep their pages and last-run marker in the writable location instead.
    """
    import os
    try:
        workdir.mkdir(parents=True, exist_ok=True)
        probe = workdir / f".write-test-{job}"
        probe.write_text("")
        probe.unlink()
        return workdir
    except OSError:
        alt = Path(os.environ.get("INGEST_STATE_DIR", "/var/tmp/cpi-ingest"))
        alt.mkdir(parents=True, exist_ok=True)
        return alt
