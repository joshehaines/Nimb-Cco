# Competitor scope and feature roadmap

Research pass on Nimbus Maps and its competitors (Searchland, LandTech/LandInsight, Landstack, Carterwood for care-sector analytics), used to choose the five features built in October 2026. All vendor claims are from their own marketing pages unless stated.

## What competitors sell

| Capability | Nimbus | Searchland | LandInsight | Landstack | Our status |
|---|---|---|---|---|---|
| Ownership polygons, CCOD, title documents | Yes, £7 docs via tokens | Yes | Yes | Yes | Built (mock), same sources |
| Planning applications and constraints | Daily, links to portals | Yes, AI summaries | Yes, local plan overlays | Yes, appeals tracker and planning MCP | Built; appeal statistics not yet |
| Site sourcing with presets | 4 to 12 preset strategies by tier | Yes, AI sourcing assistant | AI search from requirements | Yes | Built, 6 Christie-sector presets |
| My Sites with **stages and stage reports** | Enterprise only | Site pipeline | Integrated site management, mobile app | Pipeline | **Built: Kanban pipeline, fee forecast, stage reports** |
| **Comparables** | "Complete Comparables Tool", 30 m records, AI deal detection | Sold prices | Sold prices | Sold prices | **Built: trading-business comps with £/unit, RV and EBITDA multiples, radius search, map layer** |
| **Direct-to-vendor letters** | Yes, via Stannp, custom template | Yes, mass campaigns with ownership details and site map | Not prominent | Not prominent | **Built with compliance gate (CCOD licence, LIA record, suppression)** |
| Footfall and traffic | Enterprise: mobile pings plus DfT | No | No | No | DfT built; footfall needs a vendor |
| Corporate portfolios | Yes | Company ownership | Ownership | Yes | Built with group roll-up |
| Distressed owners and tenants | Enterprise | Partly | No | No | Built, plus regulator signals |
| **Catchment and need analysis** | Competitor overlays only | No | No | No | **Built: demographics, supply ratios vs England benchmarks, two-site compare** (Carterwood-style need assessment for care) |
| **Appraisal / valuation support** | No | No (LandFund is a separate finance tool) | LandFund for development appraisal | No | **Built: indicative value range from comps, adjustments, catchment, schedule** |
| Sector registers (CQC, Ofsted, NHSBSA, FSA) | No | No | No | No | Built, the main differentiator for Christie & Co |
| CRM clean-up | No | No | No | No | Built |
| Lease event calendar and document extraction | No | No | No | No | Built |
| MCP connector for AI assistants | No | Yes, with every licence | No | Yes (planning MCP) | Planned: expose the API as an MCP server in phase 2 |
| Mobile companion | No | No | LandInsight GO | No | Responsive web covers tablets and phones |

## Why these five

1. **Pipeline with stage reports**: the one Nimbus feature every competitor also has that our first build lacked, and the thing teams use daily. Stage reports are Nimbus Enterprise-only.
2. **Comparables**: Nimbus' headline 2025-2026 launch and the core of Christie & Co's valuation work. Our version is built around trading-business metrics (per bed, per place, RV and EBITDA multiples) rather than £ per square foot, and flags Christie's own deals as confidential evidence.
3. **Catchment analysis**: nobody in the land-sourcing market does this; Carterwood sells it to the care sector as a consultancy report. Supply ratios against England benchmarks give agents a one-line argument for a pitch or a planning need statement.
4. **Letter campaigns with a compliance gate**: Nimbus and Searchland both sell letters, but neither surfaces the HM Land Registry licence problem that free company-ownership data cannot be used for marketing. Ours blocks those recipients until a register is bought and records the legitimate-interests assessment.
5. **Appraisal pack**: ties comparables, lease, rates, EPC and catchment into the document a valuer or agent actually produces, which no mapping competitor offers.

## Still open after this round

- Planning appeal and approval statistics by authority (Landstack, Searchland publish these). Straightforward once planning applications are ingested.
- AI deal detection (Nimbus): a scored "likely to transact" model over ownership age, distress, lease expiry, planning and regulator signals. The inputs already exist; the model is a phase 2 item once real data is loaded.
- MCP server so staff can ask an assistant questions over the platform's data.
- Footfall vendor integration.
- Letter dispatch API (Stannp or equivalent) and CRM write-back.

## Sources

- Nimbus features, My Sites stage reports, DTV letters via Stannp, Complete Comparables Tool and AI deal detection: nimbusmaps.co.uk feature and blog pages, Estates Gazette 1 November 2025.
- Searchland letters, mass campaigns, AI sourcing assistant, MCP connector: searchland.co.uk and 2026 comparison coverage.
- LandInsight site management, LandInsight GO, LandFund: land.tech product pages.
- Landstack housing appeals tracker 2026 and planning MCP: housing-appeals-2026.landstack.co.uk.
- Carterwood need-assessment methodology (circa 5-mile catchment, 65+ and 85+ demand, supply netting): published planning need assessments.
