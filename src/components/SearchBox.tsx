import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, MapPin, Building2, FileText, Hash, Store } from 'lucide-react'
import { provider, type SearchResult } from '@/data'
import { useUi } from '@/store/ui'
import { cx } from '@/components/ui'

const ICON = { address: MapPin, title: Hash, company: Building2, business: Store, postcode: MapPin, planning: FileText }

export function SearchBox() {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const nav = useNavigate()
  const select = useUi((s) => s.select)
  const fly = useUi((s) => s.requestFlyTo)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!q.trim()) {
      setResults([])
      return
    }
    const h = setTimeout(() => provider.search(q).then((r) => { setResults(r); setActive(0) }), 120)
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

  return (
    <div ref={ref} className="relative w-full max-w-xl">
      <div className="relative">
        <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400" />
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') setActive((a) => Math.min(a + 1, results.length - 1))
            if (e.key === 'ArrowUp') setActive((a) => Math.max(a - 1, 0))
            if (e.key === 'Enter' && results[active]) go(results[active])
            if (e.key === 'Escape') setOpen(false)
          }}
          placeholder={typeof window !== 'undefined' && window.innerWidth < 768 ? 'Search…' : 'Search address, postcode, title, business, company or planning ref…  (⌘K)'}
          className="input pl-8"
        />
      </div>
      {open && results.length > 0 && (
        <ul className="absolute z-50 mt-1 max-h-96 w-full overflow-y-auto rounded-md border border-ink-200 bg-surface py-1 shadow-xl">
          {results.map((r, i) => {
            const Icon = ICON[r.kind]
            return (
              <li key={`${r.kind}-${r.id}-${i}`}>
                <button onMouseEnter={() => setActive(i)} onClick={() => go(r)} className={cx('flex w-full items-start gap-2.5 px-3 py-2 text-left', i === active ? 'bg-brand-50' : 'hover:bg-ink-50')}>
                  <Icon size={15} className="mt-0.5 shrink-0 text-ink-400" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-ink-900">{r.label}</span>
                    {r.sublabel && <span className="block truncate text-xs text-ink-500">{r.sublabel}</span>}
                  </span>
                  <span className="ml-auto shrink-0 text-[10px] uppercase tracking-wide text-ink-400">{r.kind}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
