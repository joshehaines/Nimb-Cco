import { create } from 'zustand'
import { runLocal } from './engine'
import { runRemote, remoteConfigured } from './remote'
import type { ToolContext, ToolLink } from './tools'

/** Chat state for the assistant panel. Session only; nothing is persisted. */
export interface ChatMessage { id: string; role: 'user' | 'assistant'; text: string; links?: ToolLink[]; tool?: string; at: string; error?: boolean }

interface AssistantStore {
  open: boolean
  busy: boolean
  messages: ChatMessage[]
  engine: 'local' | 'claude'
  setOpen: (v: boolean) => void
  send: (text: string, ctx: ToolContext) => Promise<void>
  clear: () => void
}

const id = () => `M${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

export const useAssistant = create<AssistantStore>()((set, get) => ({
  open: false,
  busy: false,
  messages: [],
  engine: remoteConfigured() ? 'claude' : 'local',
  setOpen: (open) => set({ open }),
  clear: () => set({ messages: [] }),
  send: async (text, ctx) => {
    const t = text.trim()
    if (!t || get().busy) return
    set((s) => ({ busy: true, messages: [...s.messages, { id: id(), role: 'user', text: t, at: new Date().toISOString() }] }))
    try {
      const r = get().engine === 'claude' ? await runRemote(get().messages, t, ctx).catch(async (e: Error) => ({ ...(await runLocal(t, ctx)), text: `${(await runLocal(t, ctx)).text}\n\n(Assistant service unavailable: ${e.message}; answered locally.)` })) : await runLocal(t, ctx)
      set((s) => ({ messages: [...s.messages, { id: id(), role: 'assistant', text: r.text, links: r.links, tool: r.tool, at: new Date().toISOString() }] }))
    } catch (e) {
      set((s) => ({ messages: [...s.messages, { id: id(), role: 'assistant', text: `Something went wrong: ${(e as Error).message}`, at: new Date().toISOString(), error: true }] }))
    } finally {
      set({ busy: false })
    }
  },
}))
