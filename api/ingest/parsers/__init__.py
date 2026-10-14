"""Pure parsers for every bulk source, one module each.

Each parser takes a path (or file object) and yields plain dicts whose keys match the
PostGIS columns in api/schema.sql, so loaders only have to COPY/upsert. No network,
no database: the parsers are unit-tested against small fixtures that follow the
published file layouts (see api/tests/fixtures/README.md).
"""
from . import ccod, inspire, cqc, ofsted, fsa, nhsbsa, voa, epc, companies_house, planning_data, ppd, dft  # noqa: F401
