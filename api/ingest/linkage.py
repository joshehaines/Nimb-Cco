"""Business linkage.

Source: n/a (internal or vendor)
Cadence: after each load
Notes: Builds the businesses table from the loaded registers and joins each business to the other sources:
register_records (CQC, Ofsted, NHSBSA, FSA) -> point (register coordinates, else the postcode centroid)
-> title by INSPIRE polygon containment -> freeholder from the first CCOD proprietor -> operator company by
normalised name against Companies House -> VOA hereditament and EPC by postcode plus address similarity
-> FHRS rating. Computes distress_flags from the operator's accounts, Gazette notices and regulator ratings.
Pure SQL; idempotent; re-run after any register, title, company or VOA load.
"""
from __future__ import annotations

from pathlib import Path

from ._upsert import norm_company_sql

SOURCE_URL = ""
CADENCE = "after each load"
LICENCE = "Internal"

# FSA covers every food business; the care, childcare and health registers already describe their premises,
# so FSA only contributes the hospitality and retail sectors to avoid double counting a care home's kitchen.
FSA_SECTORS = ("Pub", "Restaurant", "Hotel", "Convenience Retail")

SECTOR_SQL = """case r.register
    when 'CQC' then case when coalesce((r.extra->>'careHome')::boolean, false) then 'Care Home'
                         when exists (select 1 from jsonb_array_elements_text(coalesce(r.extra->'serviceTypes', '[]'::jsonb)) s where s ilike '%dental%') then 'Dental'
                         else 'Medical' end
    when 'Ofsted' then 'Childcare'
    when 'NHSBSA' then 'Pharmacy'
    when 'FSA' then r.extra->>'sectorHint'
    when 'NHS ODS' then case r.extra->>'kind' when 'dental' then 'Dental' else 'Medical' end
    when 'CI Scotland' then case when coalesce((r.extra->>'careHome')::boolean, false) then 'Care Home' else 'Childcare' end
    else 'Other' end"""

SUB_SECTOR_SQL = """case r.register
    when 'CQC' then (select string_agg(s, ', ') from jsonb_array_elements_text(coalesce(r.extra->'serviceTypes', '[]'::jsonb)) s)
    when 'Ofsted' then r.extra->>'subtype'
    when 'FSA' then r.extra->>'businessType'
    when 'NHSBSA' then r.extra->>'contractType'
    when 'NHS ODS' then case r.extra->>'kind' when 'dental' then 'Dental practice' else 'GP practice' end
    when 'CI Scotland' then coalesce(r.extra->>'subtype', r.extra->>'careService')
    else null end"""

# VOA descriptions read "CARE HOME AND PREMISES", "DAY NURSERY AND PREMISES", "PUBLIC HOUSE AND PREMISES"...
HEREDITAMENT_MATCH = """case b.sector
    when 'Care Home' then h.description ilike '%CARE HOME%' or h.description ilike '%NURSING%' or h.description ilike '%RESIDENTIAL HOME%' or h.description ilike '%REST HOME%' or h.description ilike '%HOME AND PREMISES%' or h.description ilike '%HOSPICE%' or h.description ilike '%RESPITE%'
    when 'Childcare' then h.description ilike '%NURSERY%' or h.description ilike '%CHILDREN%' or h.description ilike '%CRECHE%' or h.description ilike '%PLAYGROUP%'
    when 'Pharmacy' then h.description ilike '%PHARMAC%' or h.description ilike '%CHEMIST%' or h.description ilike '%SHOP%'
    when 'Dental' then h.description ilike '%DENTAL%' or h.description ilike '%SURGERY%'
    when 'Medical' then h.description ilike '%SURGERY%' or h.description ilike '%CLINIC%' or h.description ilike '%HEALTH%' or h.description ilike '%HOSPITAL%' or h.description ilike '%MEDICAL%'
    when 'Pub' then h.description ilike '%PUBLIC HOUSE%' or h.description ilike '%BAR%' or h.description ilike '%INN %' or h.description ilike '%INN'
    when 'Restaurant' then h.description ilike '%RESTAURANT%' or h.description ilike '%CAFE%' or h.description ilike '%TAKEAWAY%' or h.description ilike '%TAKE AWAY%'
    when 'Hotel' then h.description ilike '%HOTEL%' or h.description ilike '%GUEST%' or h.description ilike '%BED AND BREAKFAST%'
    when 'Convenience Retail' then h.description ilike '%SHOP%' or h.description ilike '%STORE%' or h.description ilike '%SUPERMARKET%' or h.description ilike '%KIOSK%'
    else true end"""

NORM_B = norm_company_sql("coalesce(b.operator_name, b.name)")
NORM_C = norm_company_sql("c.name")
NORM_INDEX = norm_company_sql("name")   # the index is declared on the bare column; the planner matches c.name by expression

STEPS: list[tuple[str, str]] = [
    ("indexes", f"""
        create index if not exists register_records_postcode_idx on register_records (postcode);
        create index if not exists hereditaments_postcode_idx on hereditaments (postcode) where not deleted;
        create index if not exists epcs_postcode_idx on epcs (postcode);
        create index if not exists proprietors_title_idx on proprietors (title_number, seq);
        create index if not exists companies_norm_name_idx on companies (({NORM_INDEX}));
        create index if not exists businesses_postcode_idx on businesses (postcode);
        create index if not exists titles_postcode_idx on titles (postcode) where postcode is not null;
        create index if not exists businesses_title_idx on businesses (title_number) where title_number is not null;
        alter table businesses add column if not exists operator_charity_number bigint;
        create table if not exists charities (charity_number bigint primary key, name text not null, status text, company_number text, address text, postcode text, income bigint,
          insolvent boolean not null default false, in_administration boolean not null default false, registered date, source text not null default 'Charity Commission register',
          licence licence_class not null default 'OGL', fetched_at timestamptz not null default now());
        create index if not exists charities_norm_name_idx on charities (({norm_company_sql('name')}));
        create index if not exists businesses_address_trgm on businesses using gin (address gin_trgm_ops);
    """),
    ("businesses", f"""
        insert into businesses (business_id, name, sector, sub_sector, address, postcode, uprn, geom, operator_name, source, licence)
        select r.register || ':' || r.register_id,
               coalesce(nullif(r.name, ''), nullif(r.provider_name, ''), 'Unnamed'),
               sector, {SUB_SECTOR_SQL}, r.address, r.postcode, r.uprn, coalesce(r.geom, pc.geom), nullif(r.provider_name, ''), 'Composite', 'Internal'
        from (select r.*, {SECTOR_SQL} as sector from register_records r) r
        left join postcode_centroids pc on pc.postcode = r.postcode
        where coalesce(r.geom, pc.geom) is not null
          and r.sector is not null
          and coalesce(r.name, r.provider_name) is not null and coalesce(r.name, '') <> 'REDACTED'
          and (r.register <> 'FSA' or r.sector in {FSA_SECTORS!r})
          and not (r.register = 'NHS ODS' and exists (select 1 from businesses b2 where b2.postcode = r.postcode and b2.business_id like 'CQC:%'
                                                      and b2.sector = r.sector and similarity(upper(b2.name), upper(coalesce(r.name, ''))) > 0.3))
        on conflict (business_id) do update set name = excluded.name, sector = excluded.sector, sub_sector = excluded.sub_sector, address = excluded.address,
            postcode = excluded.postcode, uprn = coalesce(excluded.uprn, businesses.uprn), geom = excluded.geom, operator_name = excluded.operator_name, fetched_at = now()
    """),
    ("business_registers", """
        insert into business_registers (business_id, register, register_id)
        select b.business_id, r.register, r.register_id from register_records r join businesses b on b.business_id = r.register || ':' || r.register_id
        on conflict do nothing
    """),
    ("ods_attach", """
        insert into business_registers (business_id, register, register_id)
        select distinct on (r.register_id) b2.business_id, r.register, r.register_id
        from register_records r join businesses b2 on b2.postcode = r.postcode and b2.business_id like 'CQC:%'
        where r.register = 'NHS ODS' and b2.sector = case r.extra->>'kind' when 'dental' then 'Dental' else 'Medical' end
          and similarity(upper(b2.name), upper(coalesce(r.name, ''))) > 0.3
        order by r.register_id, similarity(upper(b2.name), upper(coalesce(r.name, ''))) desc
        on conflict do nothing
    """),
    ("titles", """
        with hit as (
          select b.business_id, t.title_number, t.tenure
          from businesses b
          join lateral (select title_number, tenure from titles t where t.geom && b.geom and st_contains(t.geom, b.geom) order by st_area(t.geom) limit 1) t on true
          where b.geom is not null
        )
        update businesses b set title_number = h.title_number, tenure = h.tenure from hit h where h.business_id = b.business_id
          and (b.title_number is distinct from h.title_number or b.tenure is distinct from h.tenure)
    """),
    # INSPIRE polygons carry geometry but no title number, postcode or address; CCOD/OCOD rows carry the title
    # number, address, postcode and proprietors but no geometry, and HMLR's open data gives no key between the
    # two. So the freeholder comes from the best-matching CCOD/OCOD title at the business postcode: the
    # freehold title whose address resembles the business address or name. A leasehold match names the
    # occupier's company, which fills operator_company_number when Companies House gave no name match.
    ("operators", f"""
        with cand as (
          select b.business_id, c.company_number, c.status, c.incorporated
          from businesses b join companies c on {NORM_C} = {NORM_B}
          where length({NORM_B}) >= 4
        ), pick as (
          select distinct on (business_id) business_id, company_number from cand
          order by business_id, (status ilike 'active%') desc, incorporated desc nulls last
        )
        update businesses b set operator_company_number = p.company_number from pick p where p.business_id = b.business_id
          and b.operator_company_number is distinct from p.company_number
    """),
    ("charity_operators", f"""
        with cand as (
          select b.business_id, ch.charity_number, ch.company_number, ch.income
          from businesses b join charities ch on {norm_company_sql('ch.name')} = {NORM_B}
          where b.operator_company_number is null and length({NORM_B}) >= 4
        ), pick as (
          select distinct on (business_id) business_id, charity_number, company_number from cand order by business_id, income desc nulls last
        )
        update businesses b set operator_charity_number = p.charity_number,
               operator_company_number = coalesce(b.operator_company_number, (select company_number from companies c where c.company_number = p.company_number))
        from pick p where p.business_id = b.business_id and b.operator_charity_number is distinct from p.charity_number
    """),
    ("ccod_titles", """
        with cand as (
          select b.business_id, t.title_number, t.tenure,
                 greatest(similarity(upper(coalesce(t.address, '')), upper(coalesce(b.address, ''))), similarity(upper(coalesce(t.address, '')), upper(b.name))) sim
          from businesses b join titles t on t.postcode = b.postcode and t.geom is null
          where b.postcode is not null
        ), best as (
          select distinct on (business_id, tenure) business_id, title_number, tenure from cand where sim >= 0.35 order by business_id, tenure, sim desc
        ), fh as (
          select x.business_id, p.name, p.company_number from best x join proprietors p on p.title_number = x.title_number and p.seq = 1 where x.tenure = 'Freehold'
        )
        update businesses b set freeholder_name = fh.name, freeholder_company_number = fh.company_number from fh
        where fh.business_id = b.business_id and (b.freeholder_name is distinct from fh.name or b.freeholder_company_number is distinct from fh.company_number)
    """),
    ("leasehold_operators", """
        with cand as (
          select b.business_id, t.title_number,
                 greatest(similarity(upper(coalesce(t.address, '')), upper(coalesce(b.address, ''))), similarity(upper(coalesce(t.address, '')), upper(b.name))) sim
          from businesses b join titles t on t.postcode = b.postcode and t.geom is null and t.tenure = 'Leasehold'
          where b.postcode is not null and b.operator_company_number is null
        ), best as (
          select distinct on (business_id) business_id, title_number from cand where sim >= 0.45 order by business_id, sim desc
        ), lh as (
          select x.business_id, p.name, p.company_number from best x join proprietors p on p.title_number = x.title_number and p.seq = 1
          where p.company_number is not null and exists (select 1 from companies c where c.company_number = p.company_number)
        )
        update businesses b set operator_company_number = lh.company_number, operator_name = coalesce(b.operator_name, lh.name) from lh where lh.business_id = b.business_id
    """),
    ("hereditaments", f"""
        with cand as (
          select b.business_id, h.uarn, similarity(upper(coalesce(h.address, '')), upper(coalesce(b.address, b.name))) sim, h.rateable_value
          from businesses b join hereditaments h on h.postcode = b.postcode and not h.deleted
          where b.postcode is not null and ({HEREDITAMENT_MATCH})
        ), pick as (
          select distinct on (business_id) business_id, uarn from cand order by business_id, sim desc, rateable_value desc nulls last
        )
        update businesses b set hereditament_uarn = p.uarn from pick p where p.business_id = b.business_id and b.hereditament_uarn is distinct from p.uarn
    """),
    ("epcs", """
        with cand as (
          select b.business_id, e.certificate_id, similarity(upper(coalesce(e.address, '')), upper(coalesce(b.address, b.name))) sim, e.lodged_at
          from businesses b join epcs e on e.postcode = b.postcode
          where b.postcode is not null
        ), pick as (
          select distinct on (business_id) business_id, certificate_id from cand where sim > 0.3 order by business_id, sim desc, lodged_at desc nulls last
        )
        update businesses b set epc_certificate_id = p.certificate_id from pick p where p.business_id = b.business_id and b.epc_certificate_id is distinct from p.certificate_id
    """),
    ("fhrs", """
        with own as (
          select b.business_id, nullif(regexp_replace(r.rating, '[^0-9]', '', 'g'), '')::smallint rating
          from businesses b join business_registers br using (business_id) join register_records r using (register, register_id)
          where r.register = 'FSA'
        ), nearby as (
          select distinct on (b.business_id) b.business_id, nullif(regexp_replace(r.rating, '[^0-9]', '', 'g'), '')::smallint rating
          from businesses b join register_records r on r.register = 'FSA' and r.postcode = b.postcode
          where b.business_id not like 'FSA:%' and similarity(upper(r.name), upper(b.name)) > 0.5
          order by b.business_id, similarity(upper(r.name), upper(b.name)) desc
        )
        update businesses b set fhrs_rating = x.rating from (select * from own union all select * from nearby) x
        where x.business_id = b.business_id and b.fhrs_rating is distinct from x.rating
    """),
    ("distress", """
        with flags as (
          select b.business_id, array_remove(array[
            case when c.accounts_overdue then 'Late accounts' end,
            case when exists (select 1 from charities ch where ch.charity_number = b.operator_charity_number and (ch.insolvent or ch.in_administration)) then 'Administration' end,
            case when jsonb_array_length(coalesce(c.gazette_notices, '[]'::jsonb)) > 0 then 'Gazette notice' end,
            case when c.status is not null and c.status not ilike 'active%' then 'Registration change' end,
            case when exists (select 1 from business_registers br join register_records r using (register, register_id)
                              where br.business_id = b.business_id and (r.rating ilike 'inadequate' or r.rating ilike 'requires improvement' or r.rating ilike '%enforcement%'
                                                                          or (r.register = 'FSA' and nullif(regexp_replace(r.rating, '[^0-9]', '', 'g'), '')::int <= 1)))
                 then 'Regulator enforcement' end,
            case when exists (select 1 from business_registers br join register_records r using (register, register_id)
                              where br.business_id = b.business_id and (r.deregistered_at is not null or r.status ilike '%deregist%' or r.status ilike '%cancel%' or r.status ilike '%closed%'))
                 then 'Registration change' end
          ]::text[], null) as f
          from businesses b left join companies c on c.company_number = b.operator_company_number
        )
        update businesses b set distress_flags = coalesce((select array_agg(distinct x) from unnest(f.f) x), '{}') from flags f
        where f.business_id = b.business_id and b.distress_flags is distinct from coalesce((select array_agg(distinct x) from unnest(f.f) x), '{}')
    """),
    ("distress_empty", "update businesses set distress_flags = '{}' where distress_flags is null"),
]


def fetch(workdir: Path) -> Path:
    """Nothing to download: the job reads tables already loaded."""
    return workdir


INVALID_INDEXES = """select i.relname from pg_index x join pg_class i on i.oid = x.indexrelid join pg_class t on t.oid = x.indrelid
    where not x.indisvalid and t.relname in ('businesses', 'titles', 'companies', 'proprietors', 'hereditaments', 'epcs', 'register_records')"""


async def load(conn, path: Path) -> int:
    # A CREATE INDEX CONCURRENTLY that failed (deadlock, cancel) leaves an invalid index that the planner ignores and
    # that "create index if not exists" treats as present; drop those first so the index step rebuilds them.
    for r in await conn.fetch(INVALID_INDEXES):
        await conn.execute(f'drop index if exists "{r["relname"]}"')
    for name, sql in STEPS:
        for stmt in (s for s in sql.split(";") if s.strip()):
            await conn.execute(stmt)
    return await conn.fetchval("select count(*) from businesses") or 0


def diff(conn) -> int:
    return 0
