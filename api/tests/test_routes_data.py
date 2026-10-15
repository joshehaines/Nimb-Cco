"""The routes that replaced the 501 stubs, against the scripted pool: shapes, status mapping and the pure pipelines."""
import asyncio
from datetime import date, datetime, timezone

from tests.conftest import Row

TAG = dict(source="test", licence="OGL", fetched_at=datetime(2026, 10, 15, tzinfo=timezone.utc))
H = {"X-Demo-User": "demo-admin"}


def test_planning_status_and_type_mapping():
    from app.routes_data import _planning_status, _planning_type

    assert _planning_status("Permitted") == "Approved" and _planning_status("Refused") == "Refused" and _planning_status("Undecided") == "Pending" and _planning_status(None) == "Pending"
    assert _planning_type("Full planning") == "Full" and _planning_type("TPO Trees") == "Other" and _planning_type("Change of use to care home") == "Change of Use"


def test_company_status_mapping():
    from app.routes_data import company_json

    r = Row(**TAG, company_number="01234567", name="ARDEN INNS LTD", status="In Administration/Administrative Receiver", incorporated=date(2001, 1, 1), sic_codes=["56302"], registered_address="1 High St",
            accounts_overdue=True, last_accounts_made_up_to=None, charges="[]", officers="[]", pscs="[]", parent_company_number=None, gazette_notices='[{"category": "Petitions to Wind Up", "published": "2026-10-15T10:10:10"}]')
    j = company_json(r)
    assert j["status"] == "administration" and j["accountsOverdue"] and j["gazetteNotices"][0]["type"] == "Petitions to Wind Up" and j["charges"] == []


def test_alerts_list_and_read(make_client):
    a = Row(alert_id=7, kind="Gazette notice", title="Gazette notice: X LTD", detail="Winding-Up Orders", occurred_at=datetime(2026, 10, 15, tzinfo=timezone.utc), severity="critical", entity_type="company", entity_id="01234567",
            sector="Pub", read=False, business_id=None, title_number=None, postcode=None, lon=-1.5, lat=52.3, deal_score=None, is_read=False)
    client, conn = make_client([("from alerts a", [a])])
    r = client.get("/api/alerts", headers=H)
    assert r.status_code == 200 and r.json()[0]["alertId"] == "7" and r.json()[0]["location"] == [-1.5, 52.3] and r.json()[0]["read"] is False
    assert client.post("/api/alerts/7/read", headers=H).status_code == 200
    assert any(c[0].startswith("insert into alert_state") for c in conn.calls)


def test_businesses_near_is_not_shadowed_by_business_by_id(make_client):
    b = Row(**TAG, business_id="FSA:1", name="Aviary Cafe", sector="Restaurant", sub_sector=None, address="Jephson Gardens", postcode="CV32 4AB", uprn=None, title_number=None, tenure=None, operator_company_number=None,
            operator_name=None, freeholder_name=None, freeholder_company_number=None, hereditament_uarn=None, epc_certificate_id=None, fhrs_rating=5, distress_flags=[], lon=-1.53, lat=52.28, distance_m=42.4)
    client, _ = make_client([("from businesses b", [b]), ("join register_records r using", [])])
    r = client.get("/api/businesses/near", params={"lon": -1.53, "lat": 52.28, "radius": 500}, headers=H)
    assert r.status_code == 200, r.text
    assert r.json()[0]["businessId"] == "FSA:1" and r.json()[0]["distanceM"] == 42 and r.json()[0]["registers"] == []


def test_dashboard_shape(make_client):
    client, _ = make_client([
        ("filter (where cardinality(distress_flags) > 0) distressed", [Row(n=472240, distressed=22691)]),
        ("group by sector", [Row(sector="Pub", n=49657)]),
        ("filter (where geom is not null) mapped", [Row(mapped=1285990, corporate=4563351)]),
        ("from leases where expiry_date", 0),
        ("from alerts a left join alert_state", 3),
    ])
    j = client.get("/api/dashboard", headers=H).json()
    assert j["businesses"] == 472240 and j["bySector"][0]["sector"] == "Pub" and j["titles"] == 1285990 and j["unreadAlerts"] == 3


def test_crm_duplicates_groups_same_name_and_postcode(make_client):
    client, _ = make_client([])
    recs = [{"recordId": "1", "businessName": "The Kings Head", "address": "1 High St", "postcode": "CV32 4AB", "raw": {}},
            {"recordId": "2", "businessName": "Kings Head", "address": "1 High Street", "postcode": "CV32 4AB", "raw": {}},
            {"recordId": "3", "businessName": "Vara Dental", "address": "9 Parade", "postcode": "E12 6SA", "raw": {}}]
    j = client.post("/api/crm/duplicates", json={"records": recs}, headers=H).json()
    assert len(j) == 1 and sorted(j[0]["recordIds"]) == ["1", "2"] and j[0]["survivorId"] in ("1", "2")


def test_sourcing_sql_builds_bounded_clauses():
    from app.routes_data import _sourcing_sql

    where, params = _sourcing_sql({"sectors": ["Pub"], "distressOnly": True, "text": "arden", "epcWorseThan": "D", "distressedOwners": True, "ownerCategories": [], "distressFlags": [], "registerRatings": []},
                                  {"west": -1.6, "south": 52.2, "east": -1.5, "north": 52.3})
    assert "ST_MakeEnvelope" in where and "b.sector = any($5::text[])" in where and "cardinality(b.distress_flags) > 0" in where and "ilike" in where
    assert params[:4] == [-1.6, 52.2, -1.5, 52.3] and ["E", "F", "G"] in params and "freeholder_company_number" in where
