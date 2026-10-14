# Property Intelligence: business case

*Internal platform to replace Nimbus Maps for Christie & Co, with sector registers, deal tracking and CRM export that no mapping product provides.*

## 1. The problem

Christie & Co advises on trading businesses: pubs, restaurants, hotels, care homes, nurseries, dental and medical practices, pharmacies, convenience retail, leisure and garden centres. Nimbus Maps gives us ownership boundaries, planning and a site-finding filter set built for developers. It does not know what a care home is, cannot tell us a CQC rating fell last week, does not track a distressed operator through to an instruction, and exports nothing clean into the CRM. Staff bridge those gaps by hand across Nimbus, Companies House, regulator websites and spreadsheets.

## 2. What has been built

A working platform, demonstrable today, with:

- **Map** of every registered title, with real roads, buildings and 650,000 real trading businesses nationwide (Overture Maps), coloured by owner type or tenure, with a Nimbus-style info panel (use classes, title, owner, downloads, site area, built form, rates, price paid, EPC, planning) and a bottom toolbar (Street View, measure, draw a site, pin lookup, 3D).
- **Sector intelligence**: registers joined to each site (CQC, Ofsted, FSA, NHSBSA, licensing), Companies House and Gazette signals, a transparent likely-to-transact score, competition analysis within a radius, catchment demographics and supply ratios.
- **Sourcing** with Nimbus's filters plus ours: distress flags, regulator ratings, lease dates, footprint and site coverage, distressed owners versus distressed tenants.
- **Deal tracking for dirty deals**: an alerts engine with custom rules (what, where, who, how), email, text and Teams delivery to the owner and named colleagues, a pipeline board with a signal timeline per deal, and campaigns with the licence gate built in.
- **CRM export**: clean, de-duplicated accounts, contacts, sites and deals with stable IDs, in Salesforce, HubSpot, Dynamics or generic layouts; licence rules enforced automatically.
- **Governance**: single sign-on ready, roles, an audit log of every document order, export and campaign approval, and data licence classes on every record.
- **Backend** (PostGIS, FastAPI, loaders for every source, alert worker, Claude-backed assistant) ready for the first live load, and an office load script for the sources that need a company network.

Everything synthetic is labelled Demo. The real layers (titles, roads, buildings, businesses, sales, traffic) are real.

## 3. Options

| Option | What it means | Annual cost (indicative) | Fit |
|---|---|---|---|
| A. Stay on Nimbus | Continue per-seat licences; keep manual workarounds | Current Nimbus spend (**insert from invoices**) | Ownership and planning only; no sectors, no deal tracking, no CRM |
| B. Nimbus plus bolt-ons | Add a CRM connector and separate alert tools | Nimbus spend plus tooling and integration time | Still no sector registers; data stays in silos |
| C. Property Intelligence (this platform) | Internal platform on open and licensed data, hosted internally | Hosting, data licences and maintenance below (**insert**) | Built around our sectors and our deal flow; data we own |
| D. C now, Nimbus retained for a term | Run both for one renewal cycle while the real load bedding in | Both for the overlap period | Lowest risk transition |

Recommendation: **D for one renewal cycle, then C.**

## 4. Costs of option C

Annual, order of magnitude; confirm each with the supplier.

| Item | Basis | Indicative |
|---|---|---|
| Hosting | Two small VMs or containers (web, API, PostGIS, worker), 200 GB storage, backups | £3,000 to £6,000 |
| HM Land Registry | INSPIRE polygons and CCOD/OCOD: free. Official copies £7 each, bought once and stored firm-wide | Usage-based; several hundred copies a year is a few thousand pounds |
| VOA, EPC, CQC, Ofsted, FSA, NHSBSA, Companies House, Gazette, DfT, planning.data.gov.uk | Open Government Licence or free with registration | £0 |
| Ordnance Survey | OS Data Hub: free tier covers OS Maps API at modest volumes; Premium for AddressBase (accurate address-level geocoding) | £0 to £5,000 depending on AddressBase |
| Overture Maps, OpenStreetMap | Open licences | £0 |
| Footfall | Vendor mobile-location data, if wanted | £10,000 to £30,000 (typical market range; quote required) |
| Email and SMS delivery | Firm SMTP relay; Twilio or equivalent for texts | Under £500 |
| Assistant | Anthropic API at expected volumes | £500 to £2,000 |
| Maintenance and development | A developer day a week on average after launch, more in the first quarter | **Insert internal rate** |

The platform's data costs are small; the real cost is people time to run the first load, review licence terms and maintain it. Against that, every Nimbus seat is retired.

## 5. Benefits

- **Earlier instructions on distressed deals.** Gazette notices, administrations, new charges and regulator enforcement reach the right agent the day they land, with the site, owner and operator already joined. One extra instruction a year pays for the platform.
- **Time saved per site.** Ownership, operator, registers, rates, EPC, planning, sales and competition in one panel and one report instead of five websites. Reasonable estimate: 20 to 40 minutes saved per appraisal.
- **Cleaner CRM.** Exports de-duplicate against our own records, carry stable IDs and never move licence-restricted data into marketing by accident.
- **Compliance.** CCOD and VOA terms enforced in code; a complete audit trail; single sign-on and roles.
- **Data we own.** Our own registers of operators, comparables and deals grow with every use, and nothing is lost if a supplier changes its terms.

## 6. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Licence terms misread (CCOD marketing restriction, VOA terms, footfall vendor terms) | Licence classes on every record; gates in campaigns and export; Data sources page lists terms; compliance role owns approvals |
| First live load reveals data quality problems | Loaders are per source with tests; the demo keeps working while sources land one at a time |
| Key person dependency | Documented setup guide, API reference, user guide; standard stack (Postgres, Python, React) |
| Scotland and Northern Ireland not covered | Scoped separately (docs/SCOTLAND.md); Nimbus retained for the overlap period |
| Adoption | The tool mirrors Nimbus's layout where staff know it, adds the assistant and tour, and exports to the CRM they already use |

## 7. Plan

| Phase | Weeks | What |
|---|---|---|
| 1. Live data | 1 to 3 | Run the office load script; stand up PostGIS and the API; verify titles, CCOD, VOA, EPC, registers against known sites |
| 2. Pilot | 4 to 8 | One office, two sectors, single sign-on on, alerts live by email; weekly feedback |
| 3. Firm-wide | 9 to 12 | All offices; CRM export in use; Nimbus seats reduced at renewal |
| 4. Extensions | after 12 | Footfall vendor, AddressBase, nationwide building snapping, Scotland scoping outcome |

## 8. Decision requested

1. Approve the pilot (phase 1 and 2) with one developer and one sponsor in the business.
2. Confirm the Nimbus renewal date so the overlap is one cycle, not two.
3. Authorise the small licences in section 4 and the licence review with compliance.

*Prepared from the working platform. Figures marked insert come from invoices and internal rates; the rest are public prices or market ranges at the time of writing.*
