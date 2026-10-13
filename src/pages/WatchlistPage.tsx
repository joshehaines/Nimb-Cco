import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Trash2, Plus } from 'lucide-react'
import { useUi } from '@/store/ui'
import { provider, type Alert } from '@/data'
import { Badge, Button, Card, Empty, Input, Select } from '@/components/ui'
import { ago, dateShort } from '@/lib/format'

export function WatchlistPage() {
  const { watchlist, removeWatch, updateWatch, projects, addProject } = useUi()
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [newProject, setNewProject] = useState('')
  const [filterProject, setFilterProject] = useState('')
  useEffect(() => {
    provider.getAlerts().then(setAlerts)
  }, [])
  const items = watchlist.filter((w) => !filterProject || w.project === filterProject)
  const grouped = new Map<string, typeof items>()
  for (const w of items) {
    const k = w.project ?? 'Unassigned'
    grouped.set(k, [...(grouped.get(k) ?? []), w])
  }
  return (
    <div className="mx-auto max-w-6xl space-y-5 p-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">My Sites</h1>
          <p className="text-sm text-ink-500">Watched titles, businesses and companies. Ownership changes, planning, regulator and company events on these raise alerts.</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={filterProject} onChange={(e) => setFilterProject(e.target.value)}><option value="">All projects</option>{projects.map((p) => <option key={p}>{p}</option>)}</Select>
          <Input placeholder="New project" value={newProject} onChange={(e) => setNewProject(e.target.value)} className="w-44" />
          <Button onClick={() => { if (newProject.trim()) { addProject(newProject.trim()); setNewProject('') } }}><Plus size={14} /> Project</Button>
        </div>
      </div>
      {!watchlist.length ? (
        <Empty title="No sites watched yet" hint="Open any site from the map or the sourcing table and click 'Add to My Sites'. Use 'Watch all' on a sourcing result to bulk-add a strategy." action={<Link to="/sourcing" className="btn-primary">Go to sourcing</Link>} />
      ) : (
        Array.from(grouped.entries()).map(([project, ws]) => (
          <Card key={project} title={`${project} · ${ws.length}`} padded={false}>
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-ink-500"><tr><th className="px-4 py-2 font-medium">Site</th><th className="font-medium">Type</th><th className="font-medium">Project</th><th className="font-medium">Notes</th><th className="font-medium">Added</th><th className="font-medium">Recent alerts</th><th></th></tr></thead>
              <tbody>
                {ws.map((w) => {
                  const related = alerts.filter((a) => a.entityId === w.entityId).slice(0, 2)
                  return (
                    <tr key={w.id} className="border-t border-ink-100">
                      <td className="px-4 py-2"><Link to={w.entityType === 'company' ? `/companies/${w.entityId}` : `/map/${w.entityType}/${w.entityId}`} className="font-medium text-brand-700 hover:underline">{w.label}</Link><div className="text-xs text-ink-500">{w.entityId}</div></td>
                      <td><Badge>{w.entityType}</Badge></td>
                      <td><Select value={w.project ?? ''} onChange={(e) => updateWatch(w.id, { project: e.target.value || undefined })} className="py-1 text-xs"><option value="">Unassigned</option>{projects.map((p) => <option key={p}>{p}</option>)}</Select></td>
                      <td><Input value={w.notes ?? ''} placeholder="Add a note…" onChange={(e) => updateWatch(w.id, { notes: e.target.value })} className="py-1 text-xs" /></td>
                      <td className="text-xs text-ink-500">{dateShort(w.addedAt)}</td>
                      <td className="text-xs">{related.length ? related.map((a) => <div key={a.alertId} className="truncate">{a.title} <span className="text-ink-400">{ago(a.occurredAt)}</span></div>) : <span className="text-ink-400">None</span>}</td>
                      <td className="pr-3"><button className="btn-ghost btn-sm" onClick={() => removeWatch(w.id)} aria-label="Remove"><Trash2 size={14} /></button></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </Card>
        ))
      )}
    </div>
  )
}
