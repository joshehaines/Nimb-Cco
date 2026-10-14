from datetime import date
from pathlib import Path

from ingest.parsers import ccod, companies_house, cqc, dft, epc, fsa, inspire, nhsbsa, ofsted, planning_data, ppd, voa

FX = Path(__file__).parent / "fixtures"


def test_ccod_full_and_ocod_change():
    rows = list(ccod.parse(FX / "ccod_sample.csv"))
    assert [r["title_number"] for r in rows] == ["WK123456", "WK654321"]
    assert rows[0]["price_paid"] == 1250000 and rows[0]["date_proprietor_added"] == date(2019, 3, 15)
    assert rows[0]["proprietors"][0]["company_number"] == "04512345"
    assert len(rows[1]["proprietors"]) == 2 and rows[1]["proprietors"][1]["category"] == "Local Authority"
    assert rows[1]["multiple_address"] is True and rows[0]["licence"] == "HMLR-CCOD"
    oc = list(ccod.parse(FX / "ocod_change_sample.csv", dataset="OCOD"))
    assert oc[0]["proprietors"][0]["country_incorporated"] == "LUXEMBOURG" and oc[0]["change_indicator"] == "A"


def test_inspire_reprojects_to_wgs84():
    rows = list(inspire.parse(FX / "inspire_sample.gml"))
    assert [r["inspire_id"] for r in rows] == [25000001, 25000002]
    ring = rows[0]["geometry"]["coordinates"][0]
    assert ring[0] == ring[-1] and len(ring) == 5
    lon, lat = ring[0]
    assert -1.60 < lon < -1.50 and 52.27 < lat < 52.30  # Leamington Spa
    assert rows[0]["valid_from"] == date(2008, 11, 5)


def test_cqc_api_and_csv_agree():
    api = list(cqc.parse_api(FX / "cqc_location.json"))[0]
    csv_rows = list(cqc.parse_csv(FX / "cqc_locations.csv"))
    assert api["register_id"] == csv_rows[0]["register_id"] == "1-100000001"
    assert api["capacity"] == csv_rows[0]["capacity"] == 42 and api["capacity_label"] == "beds"
    assert api["rating"] == csv_rows[0]["rating"] == "Good"
    assert api["postcode"] == "CV34 4AB" and abs(api["lat"] - 52.2826) < 1e-6
    assert csv_rows[1]["extra"]["careHome"] is False and csv_rows[1]["capacity"] is None


def test_ofsted_places_and_rating():
    rows = list(ofsted.parse(FX / "ofsted_sample.csv"))
    assert rows[0]["register_id"] == "EY123456" and rows[0]["capacity"] == 64 and rows[0]["capacity_label"] == "places"
    assert rows[0]["rating"] == "Good" and rows[0]["rating_date"] == date(2023, 5, 3)
    assert rows[1]["provider_type"] == "Childminder" and rows[1]["postcode"] == "CV34 5QJ"


def test_fhrs_xml():
    rows = list(fsa.parse(FX / "fhrs_sample.xml"))
    assert rows[0]["register_id"] == "1234567" and rows[0]["rating"] == "5" and rows[0]["sector_hint"] == "Pub"
    assert rows[0]["extra"]["hygiene"] == 0 and rows[0]["lon"] == -1.5365
    assert rows[1]["extra"]["newRatingPending"] is True and rows[1]["sector_hint"] == "Care Home"


def test_nhsbsa_list_and_dispensing():
    rows = list(nhsbsa.parse_list(FX / "nhsbsa_list_sample.csv"))
    assert rows[1]["register_id"] == "FB456" and rows[1]["extra"]["contractType"] == "100 hour" and rows[1]["postcode"] == "CV31 3HH"
    disp = list(nhsbsa.parse_dispensing(FX / "nhsbsa_dispensing_sample.csv"))
    assert disp[0] == {"register_id": "FA123", "year_month": "202607", "items": 8421}


def test_voa_list_and_summary_valuations():
    rows = list(voa.parse_list_entries(FX / "voa_list_entries_sample.txt"))
    assert rows[0]["uarn"] == "123456789012" and rows[0]["rateable_value"] == 42500 and rows[0]["description"] == "SHOP AND PREMISES"
    assert rows[0]["postcode"] == "CV32 4AB" and rows[0]["effective_date"] == date(2023, 4, 1) and rows[0]["scat_code"] == "249G"
    assert rows[1]["rateable_value"] == 118000 and rows[1]["licence"] == "VOA-Restricted"
    sv = list(voa.parse_summary_valuations(FX / "voa_summary_sample.txt"))
    assert len(sv) == 2 and sv[0]["uarn"] == "123456789012" and len(sv[0]["floors"]) == 3
    assert sv[0]["floors"][0]["area_sqm"] == 62.0 and sv[0]["floors"][0]["value"] == 27900 and sv[0]["additions"][0]["description"] == "Car parking"
    assert sv[1]["floors"][0]["description"] == "Hotel (bedrooms)" and sv[1]["rateable_value"] == 118000


def test_epc_bands_and_mees():
    nd = list(epc.parse(FX / "epc_nondomestic_sample.csv"))
    assert nd[0]["kind"] == "non-domestic" and nd[0]["band"] == "C" and nd[0]["score"] == 68 and nd[0]["below_mees"] is False
    assert nd[1]["band"] == "F" and nd[1]["below_mees"] is True and nd[1]["floor_area_sqm"] == 2140 and nd[1]["uprn"] == "100070000002"
    dom = list(epc.parse(FX / "epc_domestic_sample.csv"))
    assert dom[0]["kind"] == "domestic" and dom[0]["band"] == "D" and dom[0]["score"] == 62


def test_companies_house_status_sector_and_overdue():
    rows = list(companies_house.parse(FX / "companies_house_sample.csv", today=date(2026, 10, 14)))
    assert rows[0]["company_number"] == "04512345" and rows[0]["sector"] == "Pub" and rows[0]["status"] == "active"
    assert rows[0]["incorporated"] == date(2002, 8, 12) and rows[0]["accounts_overdue"] is True and rows[0]["charges_outstanding"] == 2
    assert rows[1]["status"] == "liquidation" and rows[1]["sector"] == "Care Home" and rows[1]["registered_postcode"] == "B1 1AA"


def test_planning_data_entities():
    rows = list(planning_data.parse(FX / "planning_data_sample.json"))
    kinds = {r["kind"] for r in rows}
    assert kinds == {"Conservation Area", "Listed Building", "Article 4"}
    lb = next(r for r in rows if r["kind"] == "Listed Building")
    assert lb["grade"] == "II*" and lb["geometry"]["type"] == "Point"
    ca = next(r for r in rows if r["kind"] == "Conservation Area")
    assert ca["geometry"]["type"] == "MultiPolygon" and ca["start_date"] == date(1969, 6, 1)


def test_ppd_headerless():
    rows = list(ppd.parse(FX / "ppd_sample.csv"))
    assert rows[0]["transaction_id"] == "402A3A66-B9C5-A7DF-E063-4804A8C0B80D" and rows[0]["price"] == 1250000 and rows[0]["property_type"] == "O"
    assert rows[0]["ppd_category"] == "B" and rows[0]["address"] == "12 Mill Lane" and rows[0]["date"] == date(2025, 8, 29)
    assert rows[1]["tenure"] == "Leasehold" and rows[1]["address"] == "Flat 1 99 Upper Holly Walk"


def test_dft_latest_with_history():
    rows = {r["count_point_id"]: r for r in dft.parse(FX / "dft_aadf_sample.csv")}
    assert rows["17070"]["year"] == 2025 and rows["17070"]["method"] == "Estimated" and rows["17070"]["aadf"] == 13797
    assert rows["17070"]["history"] == [{"year": 2024, "aadf": 13637}, {"year": 2025, "aadf": 13797}]
    assert rows["17070"]["road_type"] == "Major" and rows["48523"]["road_type"] == "Minor" and rows["48523"]["hgv"] == 36
