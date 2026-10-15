import { type ReactNode, type ButtonHTMLAttributes, type InputHTMLAttributes, type SelectHTMLAttributes, useState } from 'react'
import { X, ChevronDown, Loader2, Check } from 'lucide-react'

export const cx = (...c: (string | false | undefined | null)[]) => c.filter(Boolean).join(' ')

export function Badge({ children, tone = 'neutral', className, title }: { children: ReactNode; tone?: 'neutral' | 'brand' | 'good' | 'warning' | 'critical' | 'info' | 'violet'; className?: string; title?: string }) {
  const tones = {
    neutral: 'bg-ink-100 text-ink-700 border-ink-200',
    brand: 'bg-brand-50 text-brand-700 border-brand-200',
    good: 'bg-green-50 dark:bg-green-950/40 text-green-800 dark:text-green-200 border-green-200 dark:border-green-900/60',
    warning: 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 border-amber-200 dark:border-amber-900/60',
    critical: 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200 border-rose-200 dark:border-rose-900/60',
    info: 'bg-sky-50 dark:bg-sky-950/40 text-sky-800 dark:text-sky-200 border-sky-200 dark:border-sky-900/60',
    violet: 'bg-violet-50 dark:bg-violet-950/40 text-violet-800 dark:text-violet-200 border-violet-200 dark:border-violet-900/60',
  }
  return <span title={title} className={cx('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-4 whitespace-nowrap', tones[tone], className)}>{children}</span>
}

export function Button({ variant = 'secondary', size, className, children, loading, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost'; size?: 'sm'; loading?: boolean }) {
  return (
    <button className={cx(variant === 'primary' ? 'btn-primary' : variant === 'ghost' ? 'btn-ghost' : 'btn-secondary', size === 'sm' && 'btn-sm', className)} disabled={loading || rest.disabled} {...rest}>
      {loading && <Loader2 size={14} className="animate-spin" />}
      {children}
    </button>
  )
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx('input', props.className)} />
}

export function Select({ children, className, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select {...rest} className={cx('input appearance-none pr-7', className)}>
        {children}
      </select>
      <ChevronDown size={14} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-ink-400" />
    </div>
  )
}

/** Tick box with a label, optional hint and colour swatch. Used for map layers, where a tick reads as "shown". */
export function Checkbox({ checked, onChange, label, hint, colour, swatch, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; hint?: string; colour?: string; swatch?: ReactNode; disabled?: boolean }) {
  return (
    <label className={cx('flex items-start gap-2.5 py-1.5', disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer')}>
      <span className="relative mt-0.5 h-4 w-4 shrink-0">
        <input type="checkbox" className="peer h-4 w-4 cursor-pointer appearance-none rounded border border-ink-300 bg-surface transition-colors checked:border-brand-600 checked:bg-brand-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-500 disabled:cursor-not-allowed" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
        <Check size={12} strokeWidth={3} aria-hidden className="pointer-events-none absolute left-0.5 top-0.5 text-white opacity-0 peer-checked:opacity-100" />
      </span>
      <span className="flex min-w-0 flex-1 items-start gap-2 text-sm text-ink-800">
        {swatch ?? (colour && <span className="mt-1 h-3 w-3 shrink-0 rounded-full border border-black/10" style={{ background: colour }} />)}
        <span className="min-w-0">
          {label}
          {hint && <span className="block text-[11px] leading-snug text-ink-500">{hint}</span>}
        </span>
      </span>
    </label>
  )
}

export function Toggle({ checked, onChange, label, hint, colour }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; hint?: string; colour?: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 py-1.5">
      <span className="flex items-center gap-2 text-sm text-ink-800">
        {colour && <span className="h-3 w-3 rounded-sm border border-black/10" style={{ background: colour }} />}
        <span>
          {label}
          {hint && <span className="block text-[11px] text-ink-500">{hint}</span>}
        </span>
      </span>
      <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className={cx('relative h-5 w-9 shrink-0 rounded-full transition-colors', checked ? 'bg-brand-600' : 'bg-ink-300')}>
        <span className={cx('absolute left-0 top-0.5 h-4 w-4 rounded-full bg-surface shadow transition-transform', checked ? 'translate-x-4' : 'translate-x-0.5')} />
      </button>
    </label>
  )
}

export function Card({ title, actions, children, className, padded = true }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; padded?: boolean }) {
  return (
    <section className={cx('card', className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-2 border-b border-ink-100 px-4 py-2.5">
          <h3 className="text-sm font-semibold text-ink-900">{title}</h3>
          {actions}
        </header>
      )}
      <div className={padded ? 'p-4' : ''}>{children}</div>
    </section>
  )
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'good' | 'warning' | 'critical' | 'neutral' }) {
  const toneCls = tone === 'good' ? 'text-green-700 dark:text-green-300' : tone === 'warning' ? 'text-amber-700 dark:text-amber-300' : tone === 'critical' ? 'text-rose-700 dark:text-rose-300' : 'text-ink-900'
  return (
    <div className="card px-4 py-3">
      <div className="label">{label}</div>
      <div className={cx('mt-1 text-2xl font-semibold tabular-nums', toneCls)}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-ink-500">{sub}</div>}
    </div>
  )
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string; count?: number }[]; value: T; onChange: (t: T) => void }) {
  return (
    <div role="tablist" className="flex gap-0.5 overflow-x-auto border-b border-ink-200 px-2">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)} className={cx('whitespace-nowrap border-b-2 px-2.5 py-2 text-xs font-medium transition-colors', value === t.id ? 'border-brand-600 text-brand-700' : 'border-transparent text-ink-500 hover:text-ink-800')}>
          {t.label}
          {t.count !== undefined && <span className="ml-1 rounded-full bg-ink-100 px-1.5 text-[10px] text-ink-600">{t.count}</span>}
        </button>
      ))}
    </div>
  )
}

export function KV({ rows }: { rows: [ReactNode, ReactNode][] }) {
  return (
    <dl className="kv">
      {rows.map(([k, v], i) => (
        <div key={i} className="contents">
          <dt>{k}</dt>
          <dd>{v ?? '—'}</dd>
        </div>
      ))}
    </dl>
  )
}

export function Empty({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-ink-200 px-6 py-10 text-center">
      <div className="text-sm font-medium text-ink-800">{title}</div>
      {hint && <div className="max-w-sm text-xs text-ink-500">{hint}</div>}
      {action}
    </div>
  )
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 p-4 text-sm text-ink-500">
      <Loader2 size={16} className="animate-spin" /> {label ?? 'Loading…'}
    </div>
  )
}

export function Drawer({ open, onClose, title, children, width = 'w-[420px]' }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; width?: string }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-40 flex">
      <div className="flex-1 bg-black/20" onClick={onClose} />
      <aside className={cx('flex h-full flex-col bg-surface shadow-2xl', width)}>
        <header className="flex items-center justify-between border-b border-ink-200 px-4 py-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button className="btn-ghost btn-sm" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </aside>
    </div>
  )
}

export function Chip({ label, selected, onClick, colour }: { label: string; selected: boolean; onClick: () => void; colour?: string }) {
  return (
    <button type="button" onClick={onClick} className={cx('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors', selected ? 'border-brand-600 bg-brand-50 text-brand-800' : 'border-ink-200 bg-surface text-ink-700 hover:bg-ink-50')}>
      {colour && <span className="h-2 w-2 rounded-full" style={{ background: colour }} />}
      {label}
    </button>
  )
}

export function Collapsible({ title, children, defaultOpen = true, right }: { title: ReactNode; children: ReactNode; defaultOpen?: boolean; right?: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-b border-ink-100 last:border-b-0">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center justify-between px-4 py-2 text-left">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-600">{title}</span>
        <span className="flex items-center gap-2">
          {right}
          <ChevronDown size={14} className={cx('text-ink-400 transition-transform', open ? '' : '-rotate-90')} />
        </span>
      </button>
      {open && <div className="px-4 pb-3">{children}</div>}
    </div>
  )
}

/** Horizontal bar list: one measure, categorical rows. Follows the dataviz mark specs (thin, rounded data-end, labels in text ink). */
export function BarList({ rows, max, format = (n: number) => String(n) }: { rows: { label: string; value: number; colour?: string; hint?: string }[]; max?: number; format?: (n: number) => string }) {
  const m = max ?? Math.max(1, ...rows.map((r) => r.value))
  return (
    <ul className="space-y-1.5">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 text-xs" title={r.hint}>
          <div className="min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-ink-700">{r.label}</span>
              <span className="tabular-nums text-ink-900">{format(r.value)}</span>
            </div>
            <div className="mt-0.5 h-1.5 w-full rounded-full bg-ink-100">
              <div className="h-1.5 rounded-full" style={{ width: `${Math.max(2, (r.value / m) * 100)}%`, background: r.colour ?? '#2f64b4' }} />
            </div>
          </div>
        </li>
      ))}
    </ul>
  )
}

export function Sparkline({ points, colour = '#2f64b4', width = 120, height = 28 }: { points: number[]; colour?: string; width?: number; height?: number }) {
  if (points.length < 2) return null
  const min = Math.min(...points)
  const max = Math.max(...points)
  const span = max - min || 1
  const step = width / (points.length - 1)
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${(height - 3 - ((p - min) / span) * (height - 6)).toFixed(1)}`).join(' ')
  return (
    <svg width={width} height={height} aria-hidden>
      <path d={d} fill="none" stroke={colour} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
