import { useNavigate } from 'react-router-dom'
import { useUi } from '@/store/ui'
import { Drawer, Chip, Input, Select, Toggle, Button } from '@/components/ui'
import { SECTORS, type DistressFlag, type ConstraintKind, type Proprietor } from '@/data/types'
import { SECTOR_COLOURS } from '@/lib/sectors'

const DISTRESS: DistressFlag[] = ['Administration', 'Receivership', 'Liquidation', 'Late accounts', 'Gazette notice', 'Regulator inadequate', 'FHRS 0-1', 'New charge registered', 'Dispensing volume falling']
const OWNER_CATS: Proprietor['category'][] = ['Limited Company or Public Limited Company', 'Private Individual', 'Local Authority', 'Charity', 'Overseas Company']
const CONSTRAINTS: ConstraintKind[] = ['Flood Zone 3', 'Flood Zone 2', 'Conservation Area', 'Listed Building', 'Green Belt', 'Article 4']
const PRESETS: { label: string; hint: string; patch: Parameters<ReturnType<typeof useUi.getState>['setFilters']>[0] }[] = [
  { label: 'Distressed care homes', hint: 'CQC inadequate or operator insolvency', patch: { sectors: ['Care Home'], distressOnly: true } },
  { label: 'Pub leases expiring < 24 mo', hint: 'Leasehold pubs, registered lease ending soon', patch: { sectors: ['Pub'], tenure: 'Leasehold', leaseExpiringWithinMonths: 24 } },
  { label: 'Nurseries owned by individuals', hint: 'Freehold held privately, often retirement sales', patch: { sectors: ['Childcare'], ownerCategories: ['Private Individual'] } },
  { label: 'Sub-standard EPC hospitality', hint: 'Pubs, restaurants, hotels rated E or worse', patch: { sectors: ['Pub', 'Restaurant', 'Hotel'], epcWorseThan: 'D' } },
  { label: 'Pharmacies losing volume', hint: 'Dispensing items down >8 % year on year', patch: { sectors: ['Pharmacy'], distressFlags: ['Dispensing volume falling'] } },
  { label: 'Long-held freeholds (pre-2005)', hint: 'Owner on title 20+ years', patch: { ownedSince: '2005-01-01' } },
]

export function SourcingDrawer() {
  const { showFilters, setShowFilters, filters, setFilters, resetFilters } = useUi()
  const nav = useNavigate()
  const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v])
  return (
    <Drawer open={showFilters} onClose={() => setShowFilters(false)} title="Site sourcing filters">
      <div className="space-y-5 p-4">
        <div>
          <div className="label mb-2">Strategies</div>
          <div className="grid grid-cols-2 gap-2">
            {PRESETS.map((p) => (
              <button key={p.label} onClick={() => { resetFilters(); setFilters(p.patch) }} className="rounded-md border border-ink-200 p-2 text-left hover:border-brand-400 hover:bg-brand-50">
                <div className="text-xs font-semibold text-ink-900">{p.label}</div>
                <div className="text-[11px] text-ink-500">{p.hint}</div>
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="label mb-2">Sectors</div>
          <div className="flex flex-wrap gap-1.5">{SECTORS.filter((s) => s !== 'Other').map((s) => <Chip key={s} label={s} colour={SECTOR_COLOURS[s]} selected={filters.sectors.includes(s)} onClick={() => setFilters({ sectors: toggle(filters.sectors, s) })} />)}</div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs"><span className="label">Tenure</span><Select value={filters.tenure ?? ''} onChange={(e) => setFilters({ tenure: (e.target.value || undefined) as never })}><option value="">Any</option><option>Freehold</option><option>Leasehold</option></Select></label>
          <label className="text-xs"><span className="label">Lease expiring within</span><Select value={filters.leaseExpiringWithinMonths ?? ''} onChange={(e) => setFilters({ leaseExpiringWithinMonths: e.target.value ? Number(e.target.value) : undefined })}><option value="">Any</option><option value="12">12 months</option><option value="24">24 months</option><option value="36">36 months</option><option value="60">5 years</option></Select></label>
          <label className="text-xs"><span className="label">Min rateable value</span><Input type="number" placeholder="£" value={filters.minRateableValue ?? ''} onChange={(e) => setFilters({ minRateableValue: e.target.value ? Number(e.target.value) : undefined })} /></label>
          <label className="text-xs"><span className="label">Max rateable value</span><Input type="number" placeholder="£" value={filters.maxRateableValue ?? ''} onChange={(e) => setFilters({ maxRateableValue: e.target.value ? Number(e.target.value) : undefined })} /></label>
          <label className="text-xs"><span className="label">Min floor area m²</span><Input type="number" value={filters.minAreaSqm ?? ''} onChange={(e) => setFilters({ minAreaSqm: e.target.value ? Number(e.target.value) : undefined })} /></label>
          <label className="text-xs"><span className="label">EPC worse than</span><Select value={filters.epcWorseThan ?? ''} onChange={(e) => setFilters({ epcWorseThan: (e.target.value || undefined) as never })}><option value="">Any</option>{['B', 'C', 'D', 'E'].map((r) => <option key={r}>{r}</option>)}</Select></label>
          <label className="text-xs"><span className="label">Owner on title since (before)</span><Input type="date" value={filters.ownedSince ?? ''} onChange={(e) => setFilters({ ownedSince: e.target.value || undefined })} /></label>
          <label className="text-xs"><span className="label">Planning activity within</span><Select value={filters.planningWithinMonths ?? ''} onChange={(e) => setFilters({ planningWithinMonths: e.target.value ? Number(e.target.value) : undefined })}><option value="">Any</option><option value="6">6 months</option><option value="12">12 months</option><option value="24">24 months</option></Select></label>
        </div>
        <div>
          <div className="label mb-2">Owner type</div>
          <div className="flex flex-wrap gap-1.5">{OWNER_CATS.map((c) => <Chip key={c} label={c.replace(' or Public Limited Company', '')} selected={filters.ownerCategories.includes(c)} onClick={() => setFilters({ ownerCategories: toggle(filters.ownerCategories, c) })} />)}</div>
        </div>
        <div>
          <Toggle checked={filters.distressOnly} onChange={(v) => setFilters({ distressOnly: v })} label="Distressed only" hint="Any insolvency, late accounts, regulator or FHRS signal" />
          <div className="mt-1 flex flex-wrap gap-1.5">{DISTRESS.map((d) => <Chip key={d} label={d} selected={filters.distressFlags.includes(d)} onClick={() => setFilters({ distressFlags: toggle(filters.distressFlags, d) })} />)}</div>
        </div>
        <div>
          <div className="label mb-2">Regulator rating</div>
          <div className="flex flex-wrap gap-1.5">{['Outstanding', 'Good', 'Requires improvement', 'Inadequate'].map((r) => <Chip key={r} label={r} selected={filters.registerRatings.includes(r)} onClick={() => setFilters({ registerRatings: toggle(filters.registerRatings, r) })} />)}</div>
        </div>
        <div>
          <div className="label mb-2">Exclude constraints</div>
          <div className="flex flex-wrap gap-1.5">{CONSTRAINTS.map((c) => <Chip key={c} label={c} selected={filters.excludeConstraints.includes(c)} onClick={() => setFilters({ excludeConstraints: toggle(filters.excludeConstraints, c) })} />)}</div>
        </div>
        <label className="block text-xs"><span className="label">Text (name, address, operator, freeholder)</span><Input value={filters.text ?? ''} onChange={(e) => setFilters({ text: e.target.value || undefined })} placeholder="e.g. Arden" /></label>
        <div className="flex items-center justify-between border-t border-ink-100 pt-3">
          <Button variant="ghost" onClick={resetFilters}>Reset</Button>
          <Button variant="primary" onClick={() => { setShowFilters(false); nav('/sourcing') }}>Show results</Button>
        </div>
      </div>
    </Drawer>
  )
}
