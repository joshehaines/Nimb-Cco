"""Self-fetching jobs and the linkage job: parsers against small fixtures, loads against a recording connection."""
import asyncio
import io
import json
import zipfile

import pytest
from datetime import date
from pathlib import Path

from ingest import gazette, linkage, planning_planit, postcodes
from ingest._upsert import norm_company_sql


class RecordingConn:
    def __init__(self, fetchrow=None, fetchval=0):
        self.sql: list[tuple[str, tuple]] = []
        self._fetchrow, self._fetchval = fetchrow, fetchval

    async def execute(self, sql, *args):
        self.sql.append((" ".join(sql.split()), args))
        return "OK"

    async def executemany(self, sql, rows):
        for args in rows:
            self.sql.append((" ".join(sql.split()), tuple(args)))
        return "OK"

    async def fetchrow(self, sql, *args):
        self.sql.append((" ".join(sql.split()), args))
        return self._fetchrow(args) if callable(self._fetchrow) else self._fetchrow

    async def fetchval(self, sql, *args):
        self.sql.append((" ".join(sql.split()), args))
        return self._fetchval

    async def fetch(self, sql, *args):
        self.sql.append((" ".join(sql.split()), args))
        return []


def _codepoint_zip(tmp_path: Path) -> Path:
    z = tmp_path / "codepo_gb.zip"
    with zipfile.ZipFile(z, "w") as zf:
        zf.writestr("Data/CSV/cv.csv", '"CV324AB",10,431858,265970,"E92000001","E19000001","E18000005","E10000031","E07000222","E05013248"\n'
                                       '"CV32 5AA",90,0,0,"E92000001","E19000001","E18000005","E10000031","E07000222","E05013248"\n'
                                       '"CV1 1AA",10,433530,279090,"E92000001","E19000001","E18000005","","E08000026","E05010853"\n')
        zf.writestr("Doc/Code-Point_Open_Column_Headers.csv", "PC,PQ,EA,NO\n")
    return z


def test_codepoint_parse_skips_unlocated_and_docs(tmp_path):
    rows = list(postcodes.parse(_codepoint_zip(tmp_path)))
    assert rows == [("CV32 4AB", 10, 431858, 265970), ("CV1 1AA", 10, 433530, 279090)]


def test_codepoint_load_upserts_and_geocodes(tmp_path):
    conn = RecordingConn()
    n = asyncio.run(postcodes.load(conn, _codepoint_zip(tmp_path)))
    assert n == 2
    inserts = [s for s in conn.sql if s[0].startswith("insert into postcode_centroids")]
    assert len(inserts) == 2 and inserts[0][1] == ("CV32 4AB", 431858, 265970, 10) and "27700" in inserts[0][0]
    assert sum(1 for s in conn.sql if s[0].startswith("update register_records")) == 1


GAZETTE_FEED = {
    "entry": [
        {"id": "https://www.thegazette.co.uk/id/notice/5231263", "f:notice-code": "2450", "title": "GBR SOLUTIONS LIMITED", "published": "2026-10-15T10:10:10",
         "category": {"@term": "Petitions to Wind Up (Companies)"}, "geo:Point": {"geo:lat": "51.6045", "geo:long": "-0.32679"},
         "link": [{"@href": "https://www.thegazette.co.uk/id/notice/5231263", "@rel": "self"}, {"@href": "https://www.thegazette.co.uk/notice/5231263"}],
         "content": "<div><p>In the High Court of Justice ...</p></div>"},
        {"id": "https://www.thegazette.co.uk/id/notice/5231264", "f:notice-code": "2443", "title": "ARDEN INNS LTD", "published": "2026-10-15T09:00:00Z",
         "category": {"@term": "Appointment of Liquidators"}},
        {"id": "", "title": "NO ID"},
    ]
}


def test_gazette_parse():
    rows = list(gazette.parse(GAZETTE_FEED))
    assert [r["notice_id"] for r in rows] == ["5231263", "5231264"]
    assert rows[0]["company_name"] == "GBR SOLUTIONS LIMITED" and rows[0]["lat"] == 51.6045 and rows[0]["link"] == "https://www.thegazette.co.uk/notice/5231263"
    assert rows[0]["published"].tzinfo is not None and rows[1]["published"].date() == date(2026, 10, 15)
    assert rows[1]["link"].endswith("/notice/5231264")


def test_gazette_load_matches_and_alerts(tmp_path):
    path = tmp_path / "notices.json"
    path.write_text(json.dumps(GAZETTE_FEED))

    def fetchrow(args):  # the first notice matches a company, the second does not
        matched = "01234567" if args[0] == "5231263" else None
        return {"notice_id": args[0], "company_number": matched, "company_name": args[3], "notice_code": args[1], "category": args[2], "published": args[4], "lat": args[5], "lon": args[6], "link": args[7]}

    conn = RecordingConn(fetchrow=fetchrow)
    n = asyncio.run(gazette.load(conn, path))
    assert n == 2
    assert conn.sql[0][0].startswith("create table if not exists gazette_notices")
    alerts = [s for s in conn.sql if s[0].startswith("insert into alerts")]
    assert len(alerts) == 1 and alerts[0][1][3] == "critical" and alerts[0][1][4] == "01234567" and alerts[0][1][0] == "Gazette notice: GBR SOLUTIONS LIMITED"
    appends = [s for s in conn.sql if s[0].startswith("update companies set gazette_notices")]
    assert len(appends) == 1 and json.loads(appends[0][1][1])[0]["code"] == "2450"


PLANIT_PAGE = {
    "area": "Warwick",
    "records": [
        {"address": "The Queen and Castle, Castle Green, Kenilworth, CV8 1ND", "app_size": "Small", "app_state": "Undecided", "app_type": "Trees", "area_name": "Warwick",
         "decided_date": None, "description": "1 x Ash (T52)", "link": "https://www.planit.org.uk/planapplic/Warwick/W/26/1473/TP/", "location": {"coordinates": [-1.590691, 52.348981], "type": "Point"},
         "name": "Warwick/W/26/1473/TP", "postcode": "cv8 1nd", "reference": "W/26/1473/TP", "start_date": "2026-10-09", "uid": "Warwick/W/26/1473/TP", "url": "https://planningdocuments.warwickdc.gov.uk/x",
         "other_fields": {"agent_company": "Ground Control Ltd", "applicant_name": "See source", "application_type": "TPO Trees", "date_received": "2026-10-09", "status": "Registered",
                          "source_url": "https://planningdocuments.warwickdc.gov.uk/online-applications/search.do?action=advanced"}},
        {"area_name": "Warwick", "reference": "W/26/0001/FUL", "app_state": "Permitted", "app_type": "Full", "decided_date": "2026-09-30", "location_x": -1.5, "location_y": 52.3, "description": "Change of use to care home"},
        {"area_name": None, "reference": "X"},
    ],
}


def test_planit_parse():
    rows = list(planning_planit.parse(PLANIT_PAGE))
    assert len(rows) == 2
    a, b = rows
    assert a["reference"] == "W/26/1473/TP" and a["authority"] == "Warwick" and a["postcode"] == "CV8 1ND" and a["lon"] == -1.590691
    assert a["applicant"] is None and a["agent"] == "Ground Control Ltd" and a["type"] == "TPO Trees" and a["status"] == "Registered"
    assert a["received_date"] == date(2026, 10, 9) and a["portal_url"] == "https://planningdocuments.warwickdc.gov.uk/x"
    assert b["status"] == "Permitted" and b["decision_date"] == date(2026, 9, 30) and b["lat"] == 52.3 and b["type"] == "Full"


def test_planit_load_upserts(tmp_path):
    path = tmp_path / "warwick.json"
    path.write_text(json.dumps(PLANIT_PAGE))
    conn = RecordingConn()
    n = asyncio.run(planning_planit.load(conn, path))
    assert n == 2
    ins = [s for s in conn.sql if s[0].startswith("insert into planning_applications")]
    assert len(ins) == 2 and ins[0][1][:2] == ("W/26/1473/TP", "Warwick") and "on conflict (authority, reference)" in ins[0][0]


def test_linkage_runs_every_step_and_counts():
    conn = RecordingConn(fetchval=42)
    n = asyncio.run(linkage.load(conn, Path("/raw")))
    assert n == 42
    sql = " ".join(s[0] for s in conn.sql)
    for fragment in ("insert into businesses", "insert into business_registers", "st_contains(t.geom, b.geom)", "join proprietors p on p.title_number = x.title_number and p.seq = 1", "t.tenure = 'Leasehold'", "companies_norm_name_idx",
                     "hereditament_uarn = p.uarn", "epc_certificate_id = p.certificate_id", "fhrs_rating = x.rating", "set distress_flags"):
        assert fragment in sql, fragment
    assert "'Pub', 'Restaurant', 'Hotel', 'Convenience Retail'" in sql
    # a business whose flags all clear must get '{}', never NULL (the column is NOT NULL)
    assert "set distress_flags = coalesce((select array_agg(distinct x) from unnest(f.f) x), '{}')" in sql
    assert sql.count("create index if not exists") == 9


def test_norm_company_sql_matches_index_expression():
    # The query-side expression on an aliased column and the index-side expression on the bare column differ only by the alias.
    assert norm_company_sql("c.name").replace("c.name", "name") == norm_company_sql("name")
    assert "'\\mLIMITED\\M', 'LTD'" in norm_company_sql("name")


def test_planit_get_backs_off_on_429(monkeypatch):
    import httpx
    from ingest import planning_planit as pp

    calls = []

    class R:
        def __init__(self, status):
            self.status_code = status

        def raise_for_status(self):
            if self.status_code >= 400:
                raise httpx.HTTPStatusError("x", request=None, response=None)

        def json(self):
            return {"records": [], "total": 0}

    class C:
        def get(self, url, params):
            calls.append(params["index"])
            return R(429 if len(calls) < 3 else 200)

    monkeypatch.setattr(pp.time, "sleep", lambda s: None)
    assert pp._get(C(), {"auth": "Warwick", "index": 0}) == {"records": [], "total": 0}
    assert len(calls) == 3


def test_fsa_xml_rows_carry_sector_hint_for_linkage():
    from ingest.parsers import fsa

    rows = list(fsa.parse(Path(__file__).parent / "fixtures" / "fhrs_sample.xml"))
    assert rows and all("sectorHint" in r["extra"] and "businessType" in r["extra"] for r in rows)
    assert any(r["extra"]["sectorHint"] for r in rows), "fixture should contain at least one mapped business type"


def test_postcode_parts():
    from app.main import postcode_parts

    assert postcode_parts("cv32 4ab") == ("CV32 4AB", "full")
    assert postcode_parts("CV324AB") == ("CV32 4AB", "full")
    assert postcode_parts("cv32 4") == ("CV32 4", "sector")
    assert postcode_parts("CV32") == ("CV32", "outward")
    assert postcode_parts("Leamington") is None
    assert postcode_parts("12") is None


def test_search_ranks_place_then_records(make_client):
    from tests.conftest import Row

    script = [
        ("from postcode_centroids where postcode = $1", [Row(lon=-1.5365, lat=52.289, n=12)]),
        ("select geom from businesses", [Row(n=0, lon=None, lat=None)]),
        ("from businesses", [Row(business_id="FSA:1", name="Aviary Cafe", sector="Restaurant", address="Jephson Gardens", postcode="CV32 4AB", lon=-1.53, lat=52.28, score=0.85)]),
        ("from companies", []),
        ("from titles", [Row(title_number="WK1", address="12 Parade", postcode="CV32 4AB", lon=-1.53, lat=52.28, score=0.6)]),
        ("from planning_applications", []),
    ]
    client, _ = make_client(script)
    r = client.get("/api/search", params={"q": "CV32 4AB"}, headers={"X-Demo-User": "demo-agent"})
    assert r.status_code == 200
    kinds = [x["kind"] for x in r.json()]
    assert kinds == ["postcode", "business", "address"], kinds
    assert r.json()[0]["location"]["coordinates"] == [-1.5365, 52.289] and "score" not in r.json()[0]
    assert client.get("/api/search", params={"q": "a"}, headers={"X-Demo-User": "demo-agent"}).json() == []


def test_every_word_clause():
    from app.main import _every_word

    sql, params = _every_word(["name", "address"], ["londis", "leamington"], 5)
    assert sql == "(name ilike $5 or address ilike $5) and (name ilike $6 or address ilike $6)"
    assert params == ["%londis%", "%leamington%"]


def test_sector_and_place():
    from app.main import sector_and_place

    assert sector_and_place(["pharmacy", "CV32"]) == ("Pharmacy", "CV32")
    assert sector_and_place(["care", "home", "Bath"]) == ("Care Home", "Bath")
    assert sector_and_place(["Greene", "King"]) is None
    assert sector_and_place(["pub"]) is None


def test_overture_buildings_bbox_filter_and_row_shape():
    pa = pytest.importorskip("pyarrow")
    from ingest import overture_buildings as ob

    table = pa.table({
        "id": ["in", "out"],
        "class": ["commercial", None],
        "subtype": [None, None],
        "height": [7.5, None],
        "num_floors": [2, None],
        "names": [{"primary": "The Kings Head"}, None],
        "bbox": [{"xmin": -1.54, "xmax": -1.539, "ymin": 52.29, "ymax": 52.291}, {"xmin": 30.0, "xmax": 30.1, "ymin": 10.0, "ymax": 10.1}],
        "geometry": [b"\x01\x03", b"\x01\x03"],
    })
    rows = list(ob.rows_in_bbox(table, ob.BBOX))
    assert rows == [("in", "The Kings Head", "commercial", None, 7.5, 2, b"\x01\x03")]


def test_linkage_drops_invalid_indexes_before_creating():
    from ingest import linkage

    class Conn(RecordingConn):
        async def fetch(self, sql, *args):
            self.sql.append((" ".join(sql.split()), args))
            return [{"relname": "businesses_title_idx"}] if "indisvalid" in sql else []

    conn = Conn(fetchval=1)
    asyncio.run(linkage.load(conn, Path("/raw")))
    sql = [s[0] for s in conn.sql]
    assert any(s.startswith('drop index if exists "businesses_title_idx"') for s in sql)
    assert sql.index(next(s for s in sql if s.startswith("drop index"))) < sql.index(next(s for s in sql if "create index if not exists businesses_title_idx" in s))
