import { useMemo, useState } from 'react'
import { X, UserPlus } from 'lucide-react'
import { STAFF, staffById } from '@/data/mock/staff'
import { Input, cx } from '@/components/ui'
import { CHANNEL_LABEL, type AlertChannel, type Recipient } from '@/lib/alerts'

const CHANNELS: AlertChannel[] = ['inapp', 'email', 'sms']

/** Add colleagues to an alert and choose how each one hears about it. */
export function StaffPicker({ value, onChange, excludeId }: { value: Recipient[]; onChange: (v: Recipient[]) => void; excludeId?: string }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const options = useMemo(() => {
    const t = q.trim().toLowerCase()
    return STAFF.filter((s) => s.id !== excludeId && !value.some((v) => v.staffId === s.id) && (!t || `${s.name} ${s.office} ${s.team} ${s.email}`.toLowerCase().includes(t))).slice(0, 8)
  }, [q, value, excludeId])
  const add = (id: string) => { onChange([...value, { staffId: id, channels: ['inapp', 'email'] }]); setQ(''); setOpen(false) }
  const addTeam = (team: string) => onChange([...value, ...STAFF.filter((s) => s.team === team && s.id !== excludeId && !value.some((v) => v.staffId === s.id)).map((s) => ({ staffId: s.id, channels: ['inapp', 'email'] as AlertChannel[] }))])
  return (
    <div className="space-y-2">
      <div className="relative">
        <Input value={q} onChange={(e) => { setQ(e.target.value); setOpen(true) }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} placeholder="Add a colleague by name, office or team" aria-label="Add colleague" />
        {open && options.length > 0 && (
          <ul className="card absolute z-20 mt-1 max-h-64 w-full overflow-y-auto py-1 shadow-xl" role="listbox">
            {options.map((s) => (
              <li key={s.id}><button type="button" className="flex w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-ink-50" onMouseDown={(e) => e.preventDefault()} onClick={() => add(s.id)}><span><span className="font-medium">{s.name}</span><span className="text-ink-500"> · {s.office} · {s.team}</span></span><UserPlus size={14} className="text-ink-400" /></button></li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex flex-wrap gap-1 text-[11px] text-ink-500">Whole team: {['Pubs & Restaurants', 'Hotels', 'Care', 'Childcare & Education', 'Medical & Dental', 'Pharmacy', 'Retail', 'Leisure'].map((t) => <button key={t} type="button" className="rounded-full border border-ink-200 px-2 py-0.5 hover:bg-ink-100" onClick={() => addTeam(t)}>{t}</button>)}</div>
      {value.length > 0 && (
        <ul className="divide-y divide-ink-100 rounded-md border border-ink-200">
          {value.map((r) => {
            const s = staffById(r.staffId)
            if (!s) return null
            return (
              <li key={r.staffId} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1"><span className="font-medium">{s.name}</span><span className="block truncate text-[11px] text-ink-500">{s.office} · {s.team} · {s.email}{s.mobile ? ` · ${s.mobile}` : ' · no mobile on record'}</span></span>
                <span className="flex gap-1">{CHANNELS.map((ch) => <button key={ch} type="button" disabled={ch === 'sms' && !s.mobile} title={ch === 'sms' && !s.mobile ? 'No mobile number in the directory' : CHANNEL_LABEL[ch]} onClick={() => onChange(value.map((v) => (v.staffId === r.staffId ? { ...v, channels: v.channels.includes(ch) ? v.channels.filter((c) => c !== ch) : [...v.channels, ch] } : v)))} className={cx('rounded-full border px-2 py-0.5 text-[11px] disabled:cursor-not-allowed disabled:opacity-40', r.channels.includes(ch) ? 'border-brand-600 bg-brand-600 text-white' : 'border-ink-200 text-ink-700 hover:bg-ink-100')}>{CHANNEL_LABEL[ch]}</button>)}</span>
                <button type="button" className="btn-ghost btn-sm" onClick={() => onChange(value.filter((v) => v.staffId !== r.staffId))} aria-label={`Remove ${s.name}`}><X size={13} /></button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
