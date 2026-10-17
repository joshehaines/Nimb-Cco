import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, MapPin, Building2, FileText, Hash, Store, Map as MapIcon, Loader2 } from 'lucide-react'
import { provider, type SearchResult } from '@/data'
import { useUi } from '@/store/ui'
import { cx } from '@/components/ui'

const ICON = { address: Hash, title: Hash, company: Building2, business: Store, postcode: MapPin, planning: FileText, area: MapIcon }
const KIND_LABEL: Record<SearchResult['kind'], string> = { address: 'title', title: 'title', company: 'company', business: 'business', postcode: 'postcode', planning: 'planning', area: 'area' }

/**
 * One box for everything. Type a place, postcode, business, company, address, title or planning reference and the
 * API returns a ranked list; Enter takes the top result, a postcode or area moves the map there.
 */
export function SearchBox() {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const nav = useNavigate()
  const select = useUi((s) => s.select)
  const fly = useUi((s) => s.requestFlyTo)
  const ref = useRef<HTMLDivElement>(null)
  const seq = useRef(0)

  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) {
      setResults([])
      setSearched(false)
      setLoading(false)
      return
    }
    const mine = ++seq.current
    setLoading(true)
    const h = setTimeout(() => {
      provider
        .search(term)
        .then((r) => {
          if (mine !== seq.current) return // a newer keystroke superseded this request
          setResults(r ?? [])
          setActive(0)
          setSearched(true)
        })
        .catch(() => {
          if (mine === seq.current) {
            setResults([])
            setSearched(true)
          }
        })
        .finally(() => {
          if (mine === seq.current) setLoading(false)
        })
    }, 150)
    return () => clearTimeout(h)
  }, [q])

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        ref.current?.querySelector('input')?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [])

  const go = (r: SearchResult) => {
    setOpen(false)
    setQ('')
    if (r.kind === 'company') {
      nav(`/companies/${r.id}`)
      return
    }
    if (r.kind === 'postcode' || r.kind === 'area') {
      // A place, not a record: move the map there. A full postcode is a street, a district or area is a town.
      if (r.location) fly(r.location.coordinates[0], r.location.coordinates[1], r.kind === 'postcode' && /\d[A-Z]{2}$/i.test(r.id) ? 16.5 : r.kind === 'postcode' ? 14 : 13.5)
      nav('/map')
      return
    }
    if (r.location) fly(r.location.coordinates[0], r.location.coordinates[1], 17.5)
    if (r.kind === 'business') {
      select({ type: 'business', id: r.id })
      nav(`/map/business/${r.id}`)
    } else if (r.kind === 'planning') {
      select({ type: 'planning', id: r.id })
      nav(`/map/planning/${encodeURIComponent(r.id)}`)
    } else {
      select({ type: 'title', id: r.id })
      nav(`/map/title/${r.id}`)
    }
  }

  const showList = open && q.trim().length >= 2
  return (
    <div ref={ref} className="relative w-full" data-tour="search">
      <div className="relative">
        <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" />
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)) }
            if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
            if (e.key === 'Enter' && results[active]) go(results[active])
            if (e.key === 'Escape') setOpen(false)
          }}
          placeholder={typeof window !== 'undefined' && window.innerWidth < 768 ? 'Search anything…' : 'Search places, postcodes, businesses, companies, titles, or "care homes in Bath"'}
          aria-label="Search"
          className="h-10 w-full rounded-full border border-ink-200 bg-ink-50 pl-10 pr-14 text-sm text-ink-900 placeholder:text-ink-400 transition-colors focus:border-brand-400 focus:bg-surface focus:outline-none focus:ring-2 focus:ring-brand-300"
        />
        {loading ? <Loader2 size={14} className="absolute right-4 top-1/2 -translate-y-1/2 animate-spin text-ink-400" /> : <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-ink-200 bg-surface px-1.5 text-[10px] font-medium text-ink-500 md:block">⌘K</kbd>}
      </div>
      {showList && (results.length > 0 || (searched && !loading)) && (
        <ul className="absolute z-50 mt-1.5 max-h-[70vh] w-full overflow-y-auto rounded-xl border border-ink-200 bg-surface py-1 shadow-xl" role="listbox">
          {results.length === 0 && (
            <li className="px-3 py-3 text-sm text-ink-500">Nothing matched “{q.trim()}”. Try a postcode, a town, part of a name, or a company number.</li>
          )}
          {results.map((r, i) => {
            const Icon = ICON[r.kind] ?? Hash
            return (
              <li key={`${r.kind}-${r.id}-${i}`} role="option" aria-selected={i === active}>
                <button onMouseEnter={() => setActive(i)} onClick={() => go(r)} className={cx('flex w-full items-start gap-2.5 px-3 py-2 text-left', i === active ? 'bg-brand-50 dark:bg-brand-950/40' : 'hover:bg-ink-50')}>
                  <Icon size={15} className="mt-0.5 shrink-0 text-ink-400" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-ink-900">{r.label}</span>
                    {r.sublabel && <span className="block truncate text-xs text-ink-500">{r.sublabel}</span>}
                  </span>
                  <span className="ml-auto flex shrink-0 items-center gap-2 text-[10px] uppercase tracking-wide text-ink-400">
                    {i === active && <span className="rounded border border-ink-200 px-1 normal-case">↵</span>}
                    {KIND_LABEL[r.kind] ?? r.kind}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
