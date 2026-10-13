# User guide

A short walk-through for Christie & Co staff. The demo runs on a synthetic Leamington Spa and Warwick dataset; every figure is illustrative until the live feeds are connected.

## Finding a property or operator

Use the search bar at the top (or press ⌘K / Ctrl+K). It accepts an address, postcode, title number, business name, operator or landlord company, or a planning reference. Picking a result opens it on the map with the info panel.

## Reading the map

- **Ownership titles** are shaded by proprietor type: blue for companies, grey for private individuals, green for local authorities, pink for charities, purple for overseas companies. A red outline means the occupier or owner has a distress signal.
- **Trading businesses** are dots coloured by sector. A red halo marks distress. Zoom in for names.
- **Planning applications** are dots coloured by status (blue pending, green approved, red refused).
- **Traffic counts** are DfT count points sized by vehicles per day; dark blue means counted in the last three years.
- **Footfall** is a hexagonal heatmap from the mobile-location vendor (demo cells today).
- **Constraints** show flood zones, conservation areas, listed buildings, Green Belt, Article 4 and TPOs; pick types in the layer panel.
- Hover any feature for a summary; click to open the info panel. Press Escape to close it.

## The info panel

- **Overview**: freeholder, occupier, rateable value, floor area, EPC, lease, register rating and capacity, last sale, planning and mobility in one view, plus every identifier (title, UPRN, VOA, EPC, CQC, Ofsted, FSA and so on).
- **Ownership**: proprietors, charges, price paid, and buttons to order the official register or title plan at HM Land Registry cost (£7). Private owners' names appear once the register is purchased. The owner's wider estate links to the company page.
- **Leases & docs**: registered leases with term and expiry. Ordering the lease document extracts rent, reviews, breaks, repairing terms, permitted use and tie, with a confidence score, and files the PDF in the firm-wide document store.
- **Operator**: the trading company from Companies House and each regulator record (CQC beds and rating, Ofsted places and rating, NHS pharmacy contract and dispensing trend, FSA hygiene rating, premises licence hours).
- **Planning**: applications on the title and within 250 m, with links back to the council portal.
- **Rates & EPC**: VOA description, rateable value, floor-by-floor areas, estimated rates payable, EPC with MEES status.
- **Mobility**: footfall cells and DfT counts with history sparklines.
- **Constraints**: anything intersecting the title.

Use **Add to My Sites** to watch a site, **Report** to open a printable PDF, **Zoom** to centre the map and **Link** to copy a shareable URL.

## Sourcing

Open **Sourcing** (or the Filters button on the map). Pick a strategy preset such as "Distressed care homes" or "Pub leases expiring < 24 months", or combine filters: sectors, tenure, lease expiry, rateable value, floor area, EPC, owner type, distress signals, regulator rating, constraint exclusions, planning activity and free text. Results can be sorted, exported to CSV (with licence notices), watched in bulk, or plotted on the map as highlighted dots.

## My Sites and alerts

**My Sites** holds everything you watch, grouped into projects with notes. **Alerts** lists ownership changes, planning events, regulator rating changes, company status changes, late accounts, lease events, EPC lodgements and VOA changes. The **Alert rules** card lets each user choose event types, sectors, radius, digest frequency and channel.

## Lease events

A calendar of expiries from registered leases, plus breaks and rent reviews once the lease has been bought and parsed. Filter by horizon and event type; click a row to open the site.

## CRM clean-up

1. Upload a CSV export from the CRM or load the sample. Column mapping is detected automatically and can be corrected.
2. Click **Run matching**. Every record is normalised, resolved to a UPRN and title, matched to a trading business and its regulator record, and its company checked at Companies House.
3. Work the **Review queue**: each card shows the CRM record beside the matched entity with the reasons and any issues (owner changed, company dissolved, business deregistered, capacity or tenure mismatch, invalid postcode, stale contact). Accept or reject.
4. Open **Duplicates** to merge groups into the suggested survivor.
5. **Plot matched on map** to see the client base geographically, or **Export cleaned CSV** for the CRM import, which carries the new identifiers and a decision column.

Nothing is written back to the CRM automatically.

## Company pages

Status, officers, persons with significant control, charges and lenders, group structure, trading sites operated or owned, and all freehold titles held by the group, with a watch button.

## Documents and data sources

**Documents** is the firm-wide store of purchased HM Land Registry copies with extraction summaries and spend. **Data sources** shows every upstream feed, its licence class, cadence, last run and status.

## Licences in one line each

Open Government Licence data (most sources) may be reused with attribution. HM Land Registry company-ownership data may not be used to market to the proprietors. VOA data is for internal use unless the restricted terms travel with it. Ordnance Survey premium data stays inside the organisation. Footfall vendor data follows the vendor contract.
