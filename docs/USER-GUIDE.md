# User guide

A short walk-through for Christie & Co staff. The demo runs on a synthetic Leamington Spa and Warwick dataset; every figure is illustrative until the live feeds are connected.

## Finding a property or operator

Use the search bar at the top (or press ⌘K / Ctrl+K). It accepts an address, postcode, title number, business name, operator or landlord company, or a planning reference. Picking a result opens it on the map with the info panel.

## Reading the map

The basemap picker at the top right of the map offers Streets, Minimal (grey), Dark, Satellite, Hybrid (imagery with roads and labels) and, once an Ordnance Survey key is set in Settings, OS Light and OS Road. Title outlines are plain by default and draw from zoom 14.5; **Title colouring** in the layer panel switches them to proprietor type or tenure, and a dashed red outline marks a distress signal from zoom 16. In the demo areas the titles follow the real building footprints.


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

## Pipeline

**Pipeline** shows every watched site as a card in one of eight stages (Prospect, Approach, Instructed, Marketing, Under offer, Exchanged, Completed, Lost). Drag a card to move it, or use the stage menu on the card. The edit form on each card records office, assignee, guide price, fee estimate and next action. The header totals fees weighted by stage probability; **Stage report** opens a client-ready page for one stage that you can print.

## Comparables

**Comparables** lists sold trading businesses with the metrics valuers use: £ per bed, place, room or cover, rateable-value multiple and EBITDA multiple. Pick a sector chip, then narrow by tenure, sale date, capacity and price. Type a site name to search within 1 to 25 km of it; without a site the radius applies to the current map centre. Christie & Co's own deals are marked **confidential** and excluded when you untick "Christie & Co deals only". **Plot on map** adds the comps as a layer sized by price; click one for its detail. **Export CSV** writes the schedule.

## Catchment

**Catchment** answers "is there room for another one here?". Choose a site and radius (500 m to 8 km) to see population by age band, households, the competitors of that sector inside the ring, and supply ratios against England benchmarks, labelled Undersupplied, In line or Saturated. Add a second site to compare the two side by side with percentage differences. The info panel's **Catchment** button opens this page centred on the selected site.

## Campaigns

**Campaigns** turns a sourcing result or a site list into a letter campaign with the lawful-basis check built in. Each recipient shows why they can or cannot be written to: operators are business contacts; private freeholders are blocked until the title register is purchased (free CCOD data is licensed for research only); company freeholders need a register or an existing CRM relationship; anyone on the suppression list is excluded. Record the legitimate-interests assessment, pick a template (care owner, pub tenant, nursery owner, generic freeholder), preview the merged letter, then **Approve**. From there you can export a mail-merge CSV, print one letter per page, mark the campaign as sent and log responses.

## Appraisal

The **Appraise** button in the info panel builds an appraisal pack for one business: comps of the same sector within 25 km (widened to 60 km when thin), preferring the same tenure, an indicative range from the per-unit and rateable-value methods, adjustments for EPC and MEES risk, short unexpired lease, distress flags and regulator rating, a catchment summary and the comparable schedule. Print it from the browser.

## Signing in, roles and settings

With single sign-on configured the app asks for your company account; otherwise it runs with a demo persona you can switch in **Settings** (bottom of the navigation). Three roles matter: everyone is an agent; **compliance** can approve campaigns and read the audit log; **admin** can do both and see the data sources page. Settings also holds the Ordnance Survey key for the British basemap, the demo areas, the theme and the guided tour.

## Export to CRM

**Export to CRM** builds clean records for your CRM from a sourcing result, the pipeline (or one stage), My Sites or a campaign's recipients. Pick the preset for your CRM (Salesforce, HubSpot, Dynamics 365 or generic), choose the objects (accounts, contacts, sites, deals), and download a zip with one CSV per object and a README. External IDs are stable, so re-importing updates rather than duplicates. The licence gate runs automatically: accounts known only from free HM Land Registry ownership data are excluded (or exported with Marketing Allowed = FALSE if you untick the option), redacted private individuals never become contacts, and VOA rateable values stay in the platform unless you choose otherwise. Upload your current CRM export on the clean-up page first and the export can skip records you already hold. Column headers are editable in the preview and saved as your template.

## Audit log

Every document order, CSV export, CRM export, campaign creation, approval and send is recorded with who did it and the licence classes involved. Compliance and admin users see it under **Audit log** and can export it. When the API is in use the server keeps the record.

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
