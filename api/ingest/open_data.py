"""Load the collected open data (public/data/warwick, public/data/gb tiles and the raw national
files) into PostGIS. Run after schema.sql:

    python -m ingest.open_data --public ../public/data [--ppd-dir raw/ppd] [--dft raw/dft_traffic_counts_aadf.csv]

Idempotent: every table is upserted on its primary key. Geometry arrives as GeoJSON text and is
converted with ST_GeomFromGeoJSON, so no client-side geometry library is needed.
"""
from __future__ import annotations

import argparse
import asyncio
import glob
import json
import os
from datetime import datetime, timezone
from pathlib import Path

import asyncpg

from .parsers import dft, ppd


async def upsert(conn: asyncpg.Connection, table: str, cols: list[str], rows: list[tuple], key: str, geom_col: str | None = None, batch: int = 2000) -> int:
    if not rows:
        return 0
    placeholders = []
    for i, c in enumerate(cols, start=1):
        placeholders.append(f"ST_SetSRID(ST_GeomFromGeoJSON(${i}), 4326)" if c == geom_col else f"${i}")
    updates = ", ".join(f"{c} = excluded.{c}" for c in cols if c != key)
    sql = f"insert into {table} ({', '.join(cols)}) values ({', '.join(placeholders)}) on conflict ({key}) do update set {updates}"
    n = 0
    for i in range(0, len(rows), batch):
        await conn.executemany(sql, rows[i : i + batch])
        n += len(rows[i : i + batch])
    return n


def point(lon, lat) -> str | None:
    return json.dumps({"type": "Point", "coordinates": [lon, lat]}) if lon is not None and lat is not None else None


async def load_places(conn, features: list[dict]) -> int:
    rows = []
    for f in features:
        p = f.get("properties", f)
        lon, lat = f["geometry"]["coordinates"] if "geometry" in f else (f["lon"], f["lat"])
        rows.append((p["id"], p.get("name"), p.get("category"), p.get("sector"), p.get("confidence"), p.get("address"), p.get("postcode"), p.get("locality"), p.get("website"), p.get("phone"), p.get("brand"), point(lon, lat)))
    return await upsert(conn, "places", ["place_id", "name", "category", "sector", "confidence", "address", "postcode", "locality", "website", "phone", "brand", "geom"], rows, "place_id", "geom")


async def load_roads(conn, fc: dict) -> int:
    rows = [(f["properties"]["id"], f["properties"].get("name"), f["properties"].get("class"), bool(f["properties"].get("major")), json.dumps(f["geometry"])) for f in fc["features"]]
    return await upsert(conn, "roads", ["road_id", "name", "class", "major", "geom"], rows, "road_id", "geom")


async def load_buildings(conn, fc: dict) -> int:
    rows = [(f["properties"]["id"], f["properties"].get("name"), f["properties"].get("class"), f["properties"].get("subtype"), f["properties"].get("height"), f["properties"].get("levels"), json.dumps(f["geometry"])) for f in fc["features"]]
    return await upsert(conn, "buildings", ["building_id", "name", "class", "subtype", "height_m", "levels", "geom"], rows, "building_id", "geom")


async def load_traffic(conn, records: list[dict]) -> int:
    rows = [(r["countPointId"], f"{r['roadName']} ({r['startJunction']} to {r['endJunction']})" if r.get("startJunction") and r.get("endJunction") else r["roadName"], r["roadType"], point(r["lon"], r["lat"]), r["year"], r["method"], r["aadf"], r["cars"], r["lgv"], r["hgv"], r["pedalCycles"], json.dumps(r["history"])) for r in records]
    return await upsert(conn, "traffic_counts", ["count_point_id", "road_name", "road_type", "geom", "year", "method", "aadf", "cars", "lgv", "hgv", "pedal_cycles", "history"], rows, "count_point_id", "geom")


async def load_price_paid(conn, records: list[dict]) -> int:
    rows = [(r["id"], r["price"], datetime.fromisoformat(r["date"]).date(), r.get("postcode"), r["type"], bool(r.get("newBuild")), r.get("tenure"), r.get("address"), r.get("locality"), r.get("town"), r.get("district"), r.get("county"), r.get("category") or "A", r.get("geocode"), point(r.get("lon"), r.get("lat"))) for r in records]
    return await upsert(conn, "price_paid", ["transaction_id", "price", "sale_date", "postcode", "property_type", "new_build", "tenure", "address", "locality", "town", "district", "county", "ppd_category", "geocode", "geom"], rows, "transaction_id", "geom")


async def load_postcodes(conn, pcs: dict) -> int:
    rows = [(pc, point(lon, lat), "overture-places") for pc, (lon, lat) in pcs.get("postcodes", {}).items()]
    return await upsert(conn, "postcode_centroids", ["postcode", "geom", "method"], rows, "postcode", "geom")


async def mark(conn, source_id: str, records: int, note: str):
    await conn.execute("update data_sources set last_run=$2, status='ok', records=$3, note=$4 where id=$1", source_id, datetime.now(timezone.utc), records, note)


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--public", default=os.environ.get("PUBLIC_DATA_DIR", "../public/data"))
    ap.add_argument("--ppd-dir", help="directory of raw pp-YYYY.csv files to load in full (otherwise only tiles/Warwick)")
    ap.add_argument("--dft", help="raw dft_traffic_counts_aadf.csv to load nationally (otherwise only tiles)")
    args = ap.parse_args()
    conn = await asyncpg.connect(os.environ.get("DATABASE_URL", "postgresql://cpi:cpi@localhost:5432/cpi"))
    pub = Path(args.public)
    j = lambda p: json.loads(Path(p).read_text())  # noqa: E731

    totals: dict[str, int] = {}
    w = pub / "warwick"
    if w.exists():
        totals["places"] = await load_places(conn, j(w / "places.geojson")["features"])
        totals["roads"] = await load_roads(conn, j(w / "roads.geojson"))
        if (w / "buildings.geojson").exists():
            totals["buildings"] = await load_buildings(conn, j(w / "buildings.geojson"))
        totals["traffic"] = await load_traffic(conn, j(w / "traffic.json"))
        totals["price_paid"] = await load_price_paid(conn, j(w / "price_paid.json"))
        totals["postcodes"] = await load_postcodes(conn, j(w / "postcodes.json"))
    gb = pub / "gb"
    for theme, loader in (("places", load_places), ("price_paid", load_price_paid), ("traffic", load_traffic)):
        for f in glob.glob(str(gb / theme / "*_*.json")):
            totals[theme] = totals.get(theme, 0) + await loader(conn, j(f))
    if args.ppd_dir:
        for f in sorted(glob.glob(os.path.join(args.ppd_dir, "pp-*.csv"))):
            recs = [{"id": r["transaction_id"], "price": r["price"], "date": r["date"].isoformat(), "postcode": r["postcode"], "type": r["property_type"], "newBuild": r["new_build"], "tenure": r["tenure"], "address": r["address"], "locality": r["locality"], "town": r["town"], "district": r["district"], "county": r["county"], "category": r["ppd_category"], "geocode": None, "lon": None, "lat": None} for r in ppd.parse(f)]
            totals["price_paid"] = totals.get("price_paid", 0) + await load_price_paid(conn, recs)
        # geocode by postcode centroid where available
        await conn.execute("update price_paid p set geom = c.geom, geocode = 'postcode' from postcode_centroids c where p.geom is null and p.postcode = c.postcode")
    if args.dft:
        recs = [{"countPointId": r["count_point_id"], "roadName": r["road_name"], "startJunction": r["start_junction"], "endJunction": r["end_junction"], "roadType": r["road_type"], "lon": r["lon"], "lat": r["lat"], "year": r["year"], "method": r["method"], "aadf": r["aadf"], "cars": r["cars"], "lgv": r["lgv"], "hgv": r["hgv"], "pedalCycles": r["pedal_cycles"], "history": r["history"]} for r in dft.parse(args.dft)]
        totals["traffic"] = await load_traffic(conn, recs)

    await mark(conn, "overture-places", totals.get("places", 0), "Loaded from scripts/data output")
    await mark(conn, "overture-roads", totals.get("roads", 0), "Loaded from scripts/data output")
    await mark(conn, "overture-buildings", totals.get("buildings", 0), "Loaded from scripts/data output")
    await mark(conn, "hmlr-ppd", totals.get("price_paid", 0), "Loaded from scripts/data output; positions from postcode centroids")
    await mark(conn, "dft-aadf", totals.get("traffic", 0), "Loaded from scripts/data output")
    await conn.close()
    print(totals)


if __name__ == "__main__":
    asyncio.run(main())
