# User guide

A short walk-through for Christie & Co staff. The demo runs on a synthetic Leamington Spa and Warwick dataset; every figure is illustrative until the live feeds are connected.

## The assistant

The **Ask** button at the bottom of the navigation (or the ? key) opens the assistant. Tell it what you want in plain English: "find The Copper Kettle", "go to Bristol", "colour titles by owner", "show price paid and traffic", "distressed care homes in Bristol", "alert me when a pub goes into administration", "who competes with The Leam Ferry", "draw a site area", "what is CCOD". It searches, moves and styles the map, opens pages, sources a sector, drafts an alert for you to confirm, runs competition and explains terms from this guide. It never sends, orders, exports or approves anything itself. Without an API key it works from a built-in set of commands; with `ANTHROPIC_API_KEY` set on the API it is backed by Claude and understands freer requests, using the same actions.

## Finding a property or operator

Use the search bar at the top (or press ⌘K / Ctrl+K). It accepts an address, postcode, title number, business name, operator or landlord company, or a planning reference. Picking a result opens it on the map with the info panel.

## Reading the map

The map opens on **title plans only**: no pins. The layer panel on the left is a set of tick boxes grouped as Ownership, Businesses, Market evidence, Planning and Context. Tick a layer to add it, untick to remove it, and **Clear all** takes every pin off again. A count on each group shows what is on. Layers marked **Demo** are synthetic (fictional operators, comparables, planning and constraints); everything else is real open data. Your ticks are remembered in the browser.

The **toolbar** along the bottom of the map has the view controls (map type, zoom, rotate, reset north, 3D tilt) and the tools: the **yellow person** opens Google Street View where you click, the **ruler** measures a distance, the **pentagon** draws a site and reads its area in square metres, square feet, acres and hectares (double-click or Enter to finish, Esc to cancel, Backspace to undo a point; **Remove my polygons** clears them), the **pin** answers "what is here?" with the registered title, businesses, sales and traffic at any point, plus a Street View link and a Watch this spot button, and the target finds your own location.

**Location Analysis** is the tab on the right edge of the map. It groups every layer by question: boundaries (title plans with freehold and leasehold counts in view), planning, planning policy constraints, environmental and heritage constraints, strategic land, residential and commercial markets, energy and infrastructure, mobility. Rows marked "not collected" name the open source that fills them on the office load.

The **Active layers** card under the basemap picker is the map key: switch title colouring between Plain, **Owner type** (company, private individual, council, housing association, charity, overseas company) and **Tenure** there, and read the symbol for every layer that is on. Collapse it to a Keys button when you want the map.

The basemap picker at the top right offers Streets, Minimal (grey), Dark, Satellite, Hybrid (imagery with roads and labels) and, once an Ordnance Survey key is set in Settings, OS Light and OS Road. Title outlines are plain by default and draw from zoom 14.5; **Title colouring** in the layer panel switches them to proprietor type or tenure, and a dashed red outline marks a distress signal from zoom 16. In the demo areas the titles follow the real building footprints.

- **Title plans** shaded by proprietor type when colouring is on: blue for companies, grey for private individuals, green for local authorities, pink for charities, purple for overseas companies.
- **Real businesses** are small dark-ringed dots coloured by sector, from Overture Maps places, nationwide from zoom 13. In the demo areas each dot sits at the centre of its title or building footprint rather than on the road. A building with several businesses is one slightly larger dot with a count; click it and the panel lists them all. The info panel says how far the listing's own point was. Names appear from zoom 16.5.
- **Demo businesses** are larger white-ringed dots coloured by sector, in the demo areas only. A red halo marks a distress signal; a yellow halo marks a highlight from Sourcing or the CRM clean-up. Plotting a list on the map ticks this layer for you.
- **Price paid** is HM Land Registry sales: purple non-residential, grey residential, sized by price.
- **Sold comparables** are sized by price with a dark ring.
- **Applications** are coloured by status (blue pending, green approved, red refused, grey withdrawn). **Constraints** show flood zones, conservation areas, listed buildings, Green Belt, Article 4 and TPOs; pick types once the layer is on.
- **Traffic counts** are Department for Transport count points sized by vehicles per day; darker blue means a more recent count.
- **Footfall** is a hexagonal heatmap from the mobile-location vendor (demo cells today).
- The **Sectors** chips appear once a business layer is on and narrow the dots to the sectors you pick.
- Hover any feature for a summary; click to open the info panel. Press Escape to close it.

## The info panel

Click any title or business and the panel opens on the right. The **Overview** reads like a title summary:

- Address, then a **Use classes** table (description, class before September 2020, class today, number of properties) derived from the operator's sector and the VOA description.
- **Title number** with tenure, and **Owner** with company number, owner type colour and a **Search company properties** link to every title the company holds. CCOD-licensed owners carry a no-marketing note.
- **Downloads**: title plan and register with lease schedule (ordered once at HM Land Registry cost and stored for the firm), the free site report and the catchment report. **Share this title** copies the link.
- Expandable rows, with **Expand all**: site area (m², sq ft, acres, hectares); building footprints (footprint and site coverage from Overture Maps in the demo areas); building heights (height, storeys, estimated gross internal area); commercial uses, sizes and rates assessments (every VOA hereditament); price paid (this title plus HM Land Registry sales within 150 m); EPC with MEES status; planning on the title and nearby; the **likely-to-transact** score with its reasons; and **Highlight competition**.
- **Highlight competition** ranks the same-sector operators around the site, real and demo, within a radius you choose (defaults per sector, 800 m for a pub up to 8 km for a garden centre). Each competitor is scored for proximity, same offer, scale against this site, rating and brand or group backing, with the breakdown on hover. The verdict is low, moderate or high pressure from competitors per km². **Highlight on map** draws the radius ring and puts a yellow halo on every competitor; the layer panel and the keys card show the analysis until you clear it. Listings at the same premises are excluded.

The other tabs go deeper:

- **Ownership**: proprietors, charges, price paid, order buttons, and the owner's wider estate.
- **Leases & docs**: registered leases with term and expiry. Ordering the lease document extracts rent, reviews, breaks, repairing terms, permitted use and tie, with a confidence score, and files the PDF in the firm-wide document store.
- **Operator**: the trading company from Companies House and each regulator record (CQC beds and rating, Ofsted places and rating, NHS pharmacy contract and dispensing trend, FSA hygiene rating, premises licence hours).
- **Planning**: applications on the title and within 250 m, with links back to the council portal and the authority's decision statistics.
- **Rates & EPC**, **Mobility** (footfall cells and DfT counts with history) and **Constraints**.

Use **Add to My Sites** to watch a site, **Report** to open a printable PDF, **Zoom** to centre the map and **Link** to copy a shareable URL.

## Sourcing

Filters now also cover building footprint and site coverage (footprint over site area), commercial space, lease start and end dates, **distressed owners** (the freeholder company is insolvent, in the Gazette or late filing) separately from **distressed tenants** (a leasehold operator with signals), with strategies such as Distressed landlords and Big sites, low coverage.

Open **Sourcing** (or the Filters button on the map). Pick a strategy preset such as "Distressed care homes" or "Pub leases expiring < 24 months", or combine filters: sectors, tenure, lease expiry, rateable value, floor area, EPC, owner type, distress signals, regulator rating, constraint exclusions, planning activity and free text. Results can be sorted, exported to CSV (with licence notices), watched in bulk, or plotted on the map as highlighted dots.

## My Sites and alerts

**My Sites** holds everything you watch, grouped into projects with notes.

**Alerts** is where dirty deals get tracked. The **Inbox** lists every event the platform detected: administrations and Gazette notices, new charges, regulator downgrades and enforcement, ownership changes and recorded sales, lease breaks, planning, EPC and rateable-value changes, new competitors, licence reviews and sites crossing the high transact band. Each row shows which of your alerts caught it. Select rows to mark read, snooze for a day or a week, **assign** to a colleague or **dismiss**; the **Assigned to me** view is a to-do list. **Add to pipeline** puts the site into Prospect with the event as its first note. **Run alerts now** evaluates every active alert and writes the messages to Deliveries.

**My alerts** are custom rules. Each one says **what** (event types, sectors, severity, keywords, distressed operators only, minimum deal score, owner type, tenure), **where** (everywhere, around My Sites or pipeline deals within a radius, named sites, postcode districts or office patches), **who** (you, plus any Christie & Co colleagues from the staff directory, each with their own channels, and an escalation if a critical event sits unread), and **how** (in app, email, text message or a Teams channel; instantly, hourly, daily or weekly; critical events can skip the digest). The editor previews how many recent events would have matched and shows the exact email, text or Teams card. Presets cover the common cases, starting with **Dirty deals**. **Alert me on this search** on the Sourcing page and **Alert** on any site's panel create a rule pre-filled from where you are.

**My channels** holds your email, mobile and Teams webhook with verification, quiet hours and digest times. **Deliveries** is the log of every message sent, simulated or suppressed, with its text and recipient, exportable as CSV. On the demo build nothing leaves the browser: messages are written to the log exactly as they would be sent.

## Pipeline

Click a deal card to open the **deal drawer**: the stage, the deal owner and office, the next action and its due date, fee and guide price, the **signal timeline** (every alert on the business, its title or its operator, plus stage changes and dated notes), and the alert rules feeding it. **Alert on this deal** creates an instant rule for that site shared with the owner. Cards show a signal count; the dashboard's **Deals needing action** card lists overdue actions, deals without an owner and deals without a next action.

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

The app opens on a sign-in page. With single sign-on configured (Microsoft Entra ID, Okta or any OpenID Connect provider) **Continue with your company account** sends you to the company sign-in and back; without it the page offers three demo personas so the role gates and the audit trail can be tried. Three roles matter: everyone is an agent; **compliance** can approve campaigns and read the audit log; **admin** can do both and see the data sources page. **Sign out** in Settings returns to the sign-in page. Settings also holds the Ordnance Survey key for the British basemap, the demo areas, the theme and the guided tour.

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

A company page is the portfolio view for the whole group: freehold titles held, sites operated, sites owned and let, sites with distress signals and outstanding charges. **Plot portfolio** highlights every site on the map, **CSV** exports titles and sites (CCOD licence note included), **Alert on portfolio** creates an instant rule covering every site and company in the group. Ask the assistant "what does Arden Inns own" to get there.

Status, officers, persons with significant control, charges and lenders, group structure, trading sites operated or owned, and all freehold titles held by the group, with a watch button.

## Documents and data sources

**Documents** is the firm-wide store of purchased HM Land Registry copies with extraction summaries and spend. **Data sources** shows every upstream feed, its licence class, cadence, last run and status.

## Licences in one line each

Open Government Licence data (most sources) may be reused with attribution. HM Land Registry company-ownership data may not be used to market to the proprietors. VOA data is for internal use unless the restricted terms travel with it. Ordnance Survey premium data stays inside the organisation. Footfall vendor data follows the vendor contract.
