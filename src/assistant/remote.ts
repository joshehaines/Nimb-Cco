import { authHeaders } from '@/auth'
import { toolByName, toolSpecs, type ToolContext, type ToolLink, type ToolResult } from './tools'
import type { ChatMessage } from './store'

/**
 * Claude-backed assistant through the API (POST /api/assistant). The browser sends the
 * conversation and the tool specs; the API calls the Claude Messages API with the platform's
 * system prompt and returns either text or tool calls. Tools run here in the browser (they
 * change the user's own map and pages), results go back, and the loop continues until Claude
 * answers in text. On when VITE_ASSISTANT=claude, or when the HTTP data provider is in use.
 */
const env = (import.meta as unknown as { env: Record<string, string | undefined> }).env
export const remoteConfigured = () => env.VITE_ASSISTANT === 'claude' || env.VITE_DATA_PROVIDER === 'http'
const base = env.VITE_API_BASE ?? '/api'

type Block = { type: 'text'; text: string } | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> } | { type: 'tool_result'; tool_use_id: string; content: string }
interface ApiMessage { role: 'user' | 'assistant'; content: string | Block[] }
interface ApiResponse { content: Block[]; stop_reason: string }

export async function runRemote(history: ChatMessage[], text: string, ctx: ToolContext): Promise<ToolResult & { tool?: string }> {
  const messages: ApiMessage[] = history.slice(-12).map((m) => ({ role: m.role, content: m.text }))
  messages.push({ role: 'user', content: text })
  const links: ToolLink[] = []
  let lastTool: string | undefined
  for (let turn = 0; turn < 6; turn++) {
    const res = await fetch(`${base}/assistant`, { method: 'POST', headers: { 'content-type': 'application/json', ...authHeaders() }, body: JSON.stringify({ messages, tools: toolSpecs(), context: screenContext() }) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = (await res.json()) as ApiResponse
    const uses = data.content.filter((b): b is Extract<Block, { type: 'tool_use' }> => b.type === 'tool_use')
    const texts = data.content.filter((b): b is Extract<Block, { type: 'text' }> => b.type === 'text').map((b) => b.text)
    if (!uses.length) return { text: texts.join('\n').trim() || 'Done.', links: links.length ? links : undefined, tool: lastTool }
    messages.push({ role: 'assistant', content: data.content })
    const results: Block[] = []
    for (const u of uses) {
      const tool = toolByName(u.name)
      const r: ToolResult = tool ? await tool.run(u.input, ctx).catch((e: Error): ToolResult => ({ text: `Tool failed: ${e.message}` })) : { text: `Unknown tool ${u.name}` }
      lastTool = u.name
      if (r.links) links.push(...r.links)
      results.push({ type: 'tool_result', tool_use_id: u.id, content: r.text })
    }
    messages.push({ role: 'user', content: results })
  }
  return { text: 'I ran out of steps; here is where things stand.', links: links.length ? links : undefined, tool: lastTool }
}

function screenContext() {
  try {
    return { path: window.location.hash || window.location.pathname }
  } catch {
    return {}
  }
}
