"""API tests run against a scripted fake asyncpg pool: they check routing, parameters and JSON
shaping. Integration against real PostGIS is `docker compose up` plus `pytest -m integration`.
"""
from __future__ import annotations

import sys
from contextlib import asynccontextmanager
from datetime import date, datetime, timezone
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


class Row(dict):
    def keys(self):  # asyncpg.Record compatibility used by the handlers
        return super().keys()


class FakeConn:
    def __init__(self, script):
        self.script = script  # list of (sql fragment, result)
        self.calls = []

    def _match(self, sql, args):
        self.calls.append((sql, args))
        for frag, result in self.script:
            if frag in sql:
                return result
        return []

    async def fetch(self, sql, *args):
        return self._match(sql, args)

    async def fetchrow(self, sql, *args):
        r = self._match(sql, args)
        return r[0] if isinstance(r, list) and r else (r or None)

    async def fetchval(self, sql, *args):
        r = self._match(sql, args)
        return r if not isinstance(r, list) else (r[0] if r else 0)

    async def execute(self, sql, *args):
        self._match(sql, args)


class FakePool:
    def __init__(self, script):
        self.conn = FakeConn(script)

    @asynccontextmanager
    async def acquire(self):
        yield self.conn

    async def close(self):
        pass


@pytest.fixture
def make_client():
    from fastapi.testclient import TestClient
    from app.main import app

    def _make(script):
        pool = FakePool(script)
        app.state.pool = pool
        return TestClient(app), pool.conn

    return _make


@pytest.fixture
def place_row():
    return Row(place_id="p1", name="The Copper Kettle", category="pub", sector="Pub", confidence=0.9, address="12 Mill Lane", postcode="CV32 4AB", locality="Leamington Spa", website=None, phone=None, brand=None,
               source="Overture Maps places (CDLA-Permissive-2.0)", lon=-1.5365, lat=52.289, distance_m=42.4)


@pytest.fixture
def sale_row():
    return Row(transaction_id="T1", price=1250000, sale_date=date(2025, 8, 29), postcode="CV32 4AB", property_type="O", new_build=False, tenure="Freehold", address="12 Mill Lane", locality="", town="Leamington Spa", district="Warwick",
               ppd_category="B", lon=-1.5365, lat=52.289, geocode="postcode", distance_m=10.2)


@pytest.fixture
def traffic_row():
    return Row(count_point_id="17070", road_name="A425", road_type="Major", lon=-1.5589, lat=52.2897, year=2025, method="Estimated", aadf=13797, cars=11300, lgv=2050, hgv=196, pedal_cycles=68,
               history=[{"year": 2024, "aadf": 13637}, {"year": 2025, "aadf": 13797}], source="DfT Road Traffic Statistics", licence="OGL", fetched_at=datetime(2026, 10, 14, tzinfo=timezone.utc), distance_m=300.0)
