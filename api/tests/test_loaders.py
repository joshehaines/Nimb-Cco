"""Loaders run end to end against a recording connection: parse a fixture, emit upserts."""
import asyncio
from pathlib import Path

import pytest

from ingest import companies_house, cqc, dft_aadf, epc, fsa, hmlr_ccod, hmlr_inspire, hmlr_ppd, nhsbsa, ofsted, planning_pdg, voa

FX = Path(__file__).parent / "fixtures"


class RecordingConn:
    def __init__(self):
        self.sql = []

    async def execute(self, sql, *args):
        self.sql.append((" ".join(sql.split()), args))
        return "OK"

    async def executemany(self, sql, rows):
        for args in rows:
            self.sql.append((" ".join(sql.split()), tuple(args)))
        return "OK"


@pytest.mark.parametrize(
    "mod, fixture, expected_rows, table",
    [
        (hmlr_ccod, "ccod_sample.csv", 2, "insert into titles"),
        (hmlr_inspire, "inspire_sample.gml", 2, "insert into titles"),
        (cqc, "cqc_locations.csv", 2, "insert into register_records"),
        (cqc, "cqc_location.json", 1, "insert into register_records"),
        (ofsted, "ofsted_sample.csv", 2, "insert into register_records"),
        (fsa, "fhrs_sample.xml", 2, "insert into register_records"),
        (nhsbsa, "nhsbsa_list_sample.csv", 2, "insert into register_records"),
        (voa, "voa_list_entries_sample.txt", 2, "insert into hereditaments"),
        (epc, "epc_nondomestic_sample.csv", 2, "insert into epcs"),
        (companies_house, "companies_house_sample.csv", 2, "insert into companies"),
        (planning_pdg, "planning_data_sample.json", 3, "insert into constraints"),
        (hmlr_ppd, "ppd_sample.csv", 2, "insert into price_paid"),
        (dft_aadf, "dft_aadf_sample.csv", 2, "insert into traffic_counts"),
    ],
)
def test_loader_emits_upserts(mod, fixture, expected_rows, table):
    conn = RecordingConn()
    n = asyncio.run(mod.load(conn, FX / fixture))
    assert n == expected_rows
    assert sum(1 for sql, _ in conn.sql if sql.startswith(table)) == expected_rows
    for sql, args in conn.sql:
        assert all(not isinstance(a, dict) for a in args), "parameters must be scalars or JSON strings"


def test_ccod_delete_change_removes_proprietors(tmp_path):
    f = tmp_path / "change.csv"
    f.write_text((FX / "ocod_change_sample.csv").read_text().replace(",A,01-02-2024", ",D,01-02-2024"))
    conn = RecordingConn()
    assert asyncio.run(hmlr_ccod.load(conn, f)) == 0
    assert conn.sql[0][0].startswith("delete from proprietors")


def test_ccod_proprietors_are_deleted_before_reinsert_and_after_titles():
    conn = RecordingConn()
    assert asyncio.run(hmlr_ccod.load(conn, FX / "ccod_sample.csv")) == 2
    kinds = [sql.split(" (")[0].split(" where")[0] for sql, _ in conn.sql]
    assert kinds.index("insert into titles") < kinds.index("delete from proprietors") < kinds.index("insert into proprietors")
    prop_rows = [args for sql, args in conn.sql if sql.startswith("insert into proprietors")]
    assert len(prop_rows) == 3 and all(len(a) == 7 and a[6] == "HMLR CCOD" for a in prop_rows)  # source column is NOT NULL in schema.sql


def test_loaders_accept_zipped_downloads(tmp_path):
    import zipfile

    z = tmp_path / "inspire_Warwick.zip"
    with zipfile.ZipFile(z, "w") as zf:
        zf.write(FX / "inspire_sample.gml", "Land_Registry_Cadastral_Parcels.gml")
        zf.writestr("INSPIRE Download Licence.pdf", b"%PDF-1.4")
    conn = RecordingConn()
    assert asyncio.run(hmlr_inspire.load(conn, z)) == 2
    assert all("ST_Multi" in sql for sql, _ in conn.sql)

    z = tmp_path / "epc_non_domestic.zip"
    with zipfile.ZipFile(z, "w") as zf:
        zf.write(FX / "epc_nondomestic_sample.csv", "certificates-2024.csv")
        zf.writestr("recommendations-2024.csv", "LMK_KEY,RECOMMENDATION\nabc,Insulate\n")
    conn = RecordingConn()
    assert asyncio.run(epc.load(conn, z)) == 2
    inserts = [args for sql, args in conn.sql if sql.startswith("insert into epcs")]
    assert inserts[0][5] == "C" and inserts[0][9] is not None  # rating, expires_at
    assert conn.sql[0][0].startswith("alter table epcs alter column score type integer")

    z = tmp_path / "ccod_full.zip"
    with zipfile.ZipFile(z, "w") as zf:
        zf.write(FX / "ccod_sample.csv", "CCOD_FULL_2026_10.csv")
    conn = RecordingConn()
    assert asyncio.run(hmlr_ccod.load(conn, z)) == 2


def test_fetch_resolves_step1_files_and_orders_them(tmp_path):
    for name in ("voa_2026_listentries_changeupdate_0003.zip", "voa_2026_listentries_baseline.zip", "pp-2026.csv", "pp-monthly-update.csv", "planning_flood-risk-zone.csv", "planning_green-belt.csv"):
        (tmp_path / name).write_text("x")
    assert [p.name for p in voa.fetch(tmp_path)] == ["voa_2026_listentries_baseline.zip", "voa_2026_listentries_changeupdate_0003.zip"]
    assert [p.name for p in hmlr_ppd.fetch(tmp_path)] == ["pp-2026.csv", "pp-monthly-update.csv"]
    assert [p.name for p in planning_pdg.fetch(tmp_path)][-1] == "planning_flood-risk-zone.csv"
    with pytest.raises(NotImplementedError, match="fetch_sources.sh"):
        cqc.fetch(tmp_path)


def test_run_maps_job_to_data_sources_id():
    from ingest import run

    meta = run._module_meta("hmlr_ppd", hmlr_ppd)
    assert meta["name"].startswith("Price Paid") and meta["cadence"] == "monthly" and meta["licence"] == "OGL"
    assert run._module_meta("voa", voa)["licence"] == "VOA-Restricted"


def test_voa_zip_skips_historic_member(tmp_path):
    import zipfile

    z = tmp_path / "voa_2026_listentries_baseline.zip"
    live = (FX / "voa_list_entries_sample.txt").read_text()
    with zipfile.ZipFile(z, "w") as zf:
        zf.writestr("uk-englandwales-ndr-2026-listentries-compiled-epoch-0004-baseline-csv.csv", live)
        zf.writestr("uk-englandwales-ndr-2026-listentries-compiled-epoch-0004-baseline-historic-csv.csv", live.replace("42500", "1"))
    conn = RecordingConn()
    assert asyncio.run(voa.load(conn, z)) == 2
    assert conn.sql[0][1][5] == 42500 and conn.sql[0][1][7] == 2026  # rateable value from the live file, list_year from the name
