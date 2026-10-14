import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sparkles, Send, X, Trash2, ArrowUpRight, Bot } from 'lucide-react'
import { useAssistant } from '@/assistant/store'
import { SUGGESTIONS } from '@/assistant/engine'
import { Badge, cx } from '@/components/ui'

/** Chat drawer, bottom right. Finds things, drives the map and pages, drafts alerts, explains terms. */
export function AssistantPanel() {
  const { open, setOpen, messages, busy, send, clear, engine } = useAssistant()
  const [text, setText] = useState('')
  const nav = useNavigate()
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }) }, [messages, busy, open])
  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 50) }, [open])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '?' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement) && !e.metaKey && !e.ctrlKey) { e.preventDefault(); setOpen(!useAssistant.getState().open) }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [setOpen])
  if (!open) return null
  const submit = (t = text) => { if (!t.trim()) return; setText(''); void send(t, { nav }) }
  return (
    <div className="no-print fixed bottom-4 right-4 z-[65] flex h-[min(620px,calc(100vh-32px))] w-[min(400px,calc(100vw-32px))] flex-col overflow-hidden rounded-xl border border-ink-200 bg-surface shadow-2xl" role="dialog" aria-label="Assistant">
      <div className="flex items-center justify-between border-b border-ink-200 px-3 py-2">
        <div className="flex items-center gap-2 text-sm font-semibold"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-700 text-white"><Sparkles size={14} /></span> Assistant <Badge tone={engine === 'claude' ? 'brand' : 'neutral'}>{engine === 'claude' ? 'Claude' : 'built-in'}</Badge></div>
        <div className="flex gap-0.5"><button className="btn-ghost btn-sm" onClick={clear} title="Clear conversation" disabled={!messages.length}><Trash2 size={14} /></button><button className="btn-ghost btn-sm" onClick={() => setOpen(false)} aria-label="Close assistant"><X size={14} /></button></div>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto px-3 py-3 text-sm">
        {!messages.length && (
          <div className="space-y-3">
            <div className="flex gap-2"><span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink-100 text-ink-600"><Bot size={13} /></span><div className="text-ink-700">Ask me to find a site, change the map, source a sector, set up an alert, run competition, or explain a term. {engine === 'local' ? 'This build answers without a model: plain requests work best.' : ''}</div></div>
            <div className="flex flex-wrap gap-1.5">{SUGGESTIONS.map((s) => <button key={s} className="rounded-full border border-ink-200 px-2.5 py-1 text-xs text-ink-700 hover:border-brand-400 hover:bg-brand-50" onClick={() => submit(s)}>{s}</button>)}</div>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={cx('flex gap-2', m.role === 'user' && 'justify-end')}>
            {m.role === 'assistant' && <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink-100 text-ink-600"><Bot size={13} /></span>}
            <div className={cx('max-w-[85%] rounded-xl px-3 py-2', m.role === 'user' ? 'bg-brand-700 text-white' : m.error ? 'bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:text-rose-200' : 'bg-ink-100 text-ink-800')}>
              <div className="whitespace-pre-wrap leading-snug">{m.text}</div>
              {m.links && m.links.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{m.links.slice(0, 6).map((l, i) => <button key={i} className="inline-flex items-center gap-0.5 rounded-full border border-ink-300 bg-surface px-2 py-0.5 text-[11px] text-brand-700 hover:bg-brand-50" onClick={() => nav(l.to)}>{l.label} <ArrowUpRight size={10} /></button>)}</div>}
              {m.tool && <div className="mt-1 text-[10px] opacity-60">via {m.tool.replace(/_/g, ' ')}</div>}
            </div>
          </div>
        ))}
        {busy && <div className="flex gap-2"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-ink-100 text-ink-600"><Bot size={13} /></span><div className="rounded-xl bg-ink-100 px-3 py-2 text-ink-500">Working…</div></div>}
        <div ref={endRef} />
      </div>
      <form className="flex items-center gap-2 border-t border-ink-200 px-3 py-2" onSubmit={(e) => { e.preventDefault(); submit() }}>
        <input ref={inputRef} className="input flex-1 py-1.5 text-sm" value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask or tell me what to do…" aria-label="Message the assistant" disabled={busy} />
        <button type="submit" className="btn-primary btn-sm" disabled={busy || !text.trim()} aria-label="Send"><Send size={14} /></button>
      </form>
    </div>
  )
}
