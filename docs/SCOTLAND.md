# Scotland: scoping note

Nimbus shows Scottish property boundaries as a separate toggle because Scotland is a different legal and data jurisdiction. Nothing in the England and Wales pipeline transfers without change. This note sets out what differs, which sources exist, what a build would involve, and what it is likely to cost. Items marked **verify** need confirming with the publisher before budgeting; terms and prices move.

## Why it is a separate build

| Topic | England and Wales (built) | Scotland |
|---|---|---|
| Land register | HM Land Registry: INSPIRE polygons free, CCOD/OCOD free monthly, official copies £7 | Registers of Scotland (RoS): the Land Register of Scotland (map-based, replacing the Sasine Register) and ScotLIS for online searches. Cadastral map polygons are not published as an open bulk download in the way INSPIRE is (**verify** current open data offer). Title sheets and plans are paid per search |
| Corporate ownership | CCOD lists every company-owned title | No direct equivalent. RoS publishes some open datasets, and the Register of Persons Holding a Controlled Interest in Land (RCI, 2022) records who controls land behind owners; Companies House still covers Scottish companies (SC prefix) |
| Business rates | VOA rating list | Scottish Assessors Association (SAA) valuation roll via saa.gov.uk; bulk access terms differ (**verify**) |
| EPC | Open Data Communities register | Scottish EPC Register (Energy Saving Trust); open data published by the Scottish Government (**verify** scope of bulk file) |
| Care homes | CQC | Care Inspectorate (datastore publishes services, grades and capacity as open data) |
| Nurseries and schools | Ofsted | Care Inspectorate (early learning and childcare) and Education Scotland |
| Food hygiene | FSA FHRS ratings 0 to 5 | FSA Food Hygiene Information Scheme (FHIS): Pass / Improvement Required, not a 0 to 5 score. Sourcing filters on FHRS 0 to 1 need a Scottish equivalent |
| Pharmacies | NHSBSA dispensing data | Public Health Scotland prescribing data by pharmacy (**verify** granularity) |
| Licensing | Local authority premises licences | Licensing boards per council under the Licensing (Scotland) Act 2005; registers are published per board, formats vary |
| Planning | planning.data.gov.uk plus council portals | No national planning data platform; eDevelopment.scot for submissions, each council publishes its own register; the Improvement Service's Spatial Hub holds local development plan and some constraint layers (licence terms for commercial use **verify**) |
| Constraints | Environment Agency, Historic England, Natural England | SEPA flood maps, Historic Environment Scotland (listed buildings, scheduled monuments, conservation areas via councils), NatureScot (SSSI, designations) |
| Addresses and postcodes | ONS Postcode Directory, AddressBase (OS) | One Scotland Gazetteer (OSG) for addresses; postcodes via the same ONS directory |
| Price paid | HM Land Registry Price Paid Data | RoS property price statistics and ScotLIS searches; bulk open price-paid at transaction level is more limited (**verify**) |
| Use classes | Use Classes Order 1987 as amended 2020 | Town and Country Planning (Use Classes) (Scotland) Order 1997: different classes (no Class E), so the use-class table needs a Scottish mapping |
| Tenure | Freehold / leasehold | Outright ownership (feudal tenure abolished 2004); long leases are rare and commercial leases over 175 years are prohibited, so the leasehold filters mostly do not apply |

## What the platform would need

1. **A Scottish title layer.** The honest options are a RoS data licence for cadastral polygons (if offered), or showing building footprints and OSG addresses as the clickable unit with "find title at ScotLIS" links. Nimbus's "Scotland Property Boundaries" toggle suggests they licensed polygons; the cost is the question to ask RoS.
2. **Owner lookup.** Per-title ScotLIS searches on demand (paid), cached once bought, the way we treat the HMLR register. Plus Companies House for SC companies and RCI for controlling interests.
3. **Register adapters.** Care Inspectorate datastore, FHIS, SAA valuation roll, Scottish EPC, Public Health Scotland prescribing, HES and SEPA layers. Each is a parser in `api/ingest/parsers/` with the same shape as the English ones.
4. **Rule changes.** FHIS instead of FHRS in distress flags; Scottish use classes in `useClasses.ts`; tenure filters hidden north of the border; VOA rows labelled SAA.
5. **Geography.** Postcode areas AB to ZE, Scottish council areas for office patches, and a third demo area (Edinburgh or Glasgow) seated on Overture roads and buildings, which already cover Scotland.

## Effort and cost

- **Engineering**: roughly four to six weeks for the adapters, the use-class and distress rule changes, a demo area and the reporting changes, assuming open data for everything except titles.
- **Data**: open sources above are free under the Open Government Licence or similar. The two paid items are RoS title data (bulk polygons if licensable, and per-search fees otherwise) and any Improvement Service layers with commercial restrictions. Ask RoS for a commercial data licence quote before committing; without polygons the Scottish map is footprints and addresses, which is still useful for sourcing but weaker for ownership.
- **Order of work**: Care, hotels and pubs are the Scottish sectors with the most open data (Care Inspectorate, FHIS, licensing boards), so they come first; dental and pharmacy depend on Public Health Scotland access.

## Recommendation

Treat Scotland as phase two, after the England and Wales load is live and the team is using it. Open the RoS licence conversation now, because the answer decides whether Scottish ownership is a map layer or a per-search lookup, and that shapes everything else.
