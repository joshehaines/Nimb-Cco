"""DfT road traffic statistics: AADF by count point (dft_traffic_counts_aadf.csv).

Columns: count_point_id, year, local_authority_name, road_name, road_category (PA, PM, TA, TM, MB, MCU),
road_type, start_junction_road_name, end_junction_road_name, latitude, longitude, estimation_method,
pedal_cycles, cars_and_taxis, buses_and_coaches, LGVs, all_HGVs, all_motor_vehicles. Licence: OGL v3.
"""
from __future__ import annotations

from collections import defaultdict
from typing import Iterator

from ._util import pick, read_csv, to_float, to_int


def parse(path) -> Iterator[dict]:
    """Yield the latest year per count point with the full AADF history attached."""
    by_cp: dict[str, list[dict]] = defaultdict(list)
    for row in read_csv(path):
        cp = pick(row, "count_point_id")
        if not cp:
            continue
        by_cp[cp].append(row)
    for cp, rows in by_cp.items():
        rows.sort(key=lambda r: to_int(r.get("year")) or 0)
        last = rows[-1]
        cat = pick(last, "road_category") or ""
        yield {
            "count_point_id": cp,
            "road_name": pick(last, "road_name"),
            "road_type": "Major" if cat.startswith(("P", "T", "M")) and cat not in ("MB", "MCU") else "Minor",
            "road_category": cat,
            "start_junction": pick(last, "start_junction_road_name"),
            "end_junction": pick(last, "end_junction_road_name"),
            "local_authority": pick(last, "local_authority_name"),
            "lon": to_float(pick(last, "longitude")),
            "lat": to_float(pick(last, "latitude")),
            "year": to_int(pick(last, "year")),
            "method": "Counted" if (pick(last, "estimation_method") or "").lower().startswith("count") else "Estimated",
            "aadf": to_int(pick(last, "all_motor_vehicles")),
            "cars": to_int(pick(last, "cars_and_taxis")),
            "lgv": to_int(pick(last, "lgvs", "LGVs")),
            "hgv": to_int(pick(last, "all_hgvs", "all_HGVs")),
            "buses": to_int(pick(last, "buses_and_coaches")),
            "pedal_cycles": to_int(pick(last, "pedal_cycles")),
            "history": [{"year": to_int(r.get("year")), "aadf": to_int(r.get("all_motor_vehicles"))} for r in rows],
            "source": "DfT Road Traffic Statistics",
            "licence": "OGL",
        }
