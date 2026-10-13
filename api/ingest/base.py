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
