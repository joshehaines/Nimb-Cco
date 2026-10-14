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
