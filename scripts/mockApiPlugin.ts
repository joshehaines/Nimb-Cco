import type { Plugin } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { MockProvider } from '../src/data/mock/MockProvider'
import type { DocumentOrder } from '../src/data/types'

/**
 * Serves the REST contract in docs/API.md from the in-memory MockProvider
 * during `vite dev`, so the HttpProvider can be exercised end to end:
 *
 *   VITE_DATA_PROVIDER=http npm run dev
 *
 * The real backend (api/) replaces this without any UI change.
 */
export function mockApiPlugin(): Plugin {
  const p = new MockProvider()
  const json = (res: ServerResponse, body: unknown, status = 200) => {
    res.statusCode = status
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify(body ?? null))
  }
  const readBody = (req: IncomingMessage) =>
    new Promise<Record<string, unknown>>((resolve) => {
      let s = ''
      req.on('data', (c) => (s += c))
      req.on('end', () => {
        try {
          resolve(s ? JSON.parse(s) : {})
        } catch {
          resolve({})
        }
      })
    })
  const bbox = (q: URLSearchParams) => {
    const [west, south, east, north] = (q.get('bbox') ?? '').split(',').map(Number)
    return { west, south, east, north }
  }

  return {
    name: 'cpi-mock-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next()
        const url = new URL(req.url, 'http://localhost')
        const path = url.pathname.replace(/^\/api/, '')
        const q = url.searchParams
        const seg = path.split('/').filter(Boolean)
        try {
          let m: RegExpMatchArray | null
          if (path === '/search') return json(res, await p.search(q.get('q') ?? '', Number(q.get('limit') ?? 12)))
          if (path === '/map/layers') return json(res, await p.getMapLayers(bbox(q)))
          if ((m = path.match(/^\/titles\/([^/]+)$/))) return json(res, (await p.getTitle(m[1])) ?? null, (await p.getTitle(m[1])) ? 200 : 404)
          if ((m = path.match(/^\/titles\/([^/]+)\/businesses$/))) return json(res, await p.getBusinessesForTitle(m[1]))
          if ((m = path.match(/^\/titles\/([^/]+)\/voa$/))) return json(res, await p.getHereditamentsForTitle(m[1]))
          if ((m = path.match(/^\/titles\/([^/]+)\/epc$/))) return json(res, await p.getEpcsForTitle(m[1]))
          if ((m = path.match(/^\/titles\/([^/]+)\/planning$/))) return json(res, await p.getPlanningForTitle(m[1], q.get('radius') ? Number(q.get('radius')) : undefined))
          if ((m = path.match(/^\/titles\/([^/]+)\/constraints$/))) return json(res, await p.getConstraintsForTitle(m[1]))
          if ((m = path.match(/^\/titles\/([^/]+)\/leases$/))) return json(res, await p.getLeasesForTitle(m[1]))
          if ((m = path.match(/^\/businesses\/([^/]+)$/))) { const b = await p.getBusiness(m[1]); return json(res, b ?? null, b ? 200 : 404) }
          if ((m = path.match(/^\/companies\/([^/]+)$/))) { const c = await p.getCompany(m[1]); return json(res, c ?? null, c ? 200 : 404) }
          if ((m = path.match(/^\/companies\/([^/]+)\/group$/))) return json(res, await p.getCompanyGroup(m[1]))
          if ((m = path.match(/^\/companies\/([^/]+)\/titles$/))) return json(res, await p.getTitlesForCompany(m[1]))
          if ((m = path.match(/^\/companies\/([^/]+)\/businesses$/))) return json(res, await p.getBusinessesForCompany(m[1]))
          if ((m = path.match(/^\/voa\/([^/]+)$/))) return json(res, (await p.getHereditament(m[1])) ?? null)
          if ((m = path.match(/^\/epc\/([^/]+)$/))) return json(res, (await p.getEpc(m[1])) ?? null)
          if ((m = path.match(/^\/planning\/(.+)$/))) return json(res, (await p.getPlanning(decodeURIComponent(m[1]))) ?? null)
          if (path === '/traffic') return json(res, await p.getTrafficNear(Number(q.get('lon')), Number(q.get('lat')), Number(q.get('radius') ?? 500)))
          if (path === '/footfall') return json(res, await p.getFootfallNear(Number(q.get('lon')), Number(q.get('lat')), Number(q.get('radius') ?? 300)))
          if (path === '/alerts' && req.method === 'GET') return json(res, await p.getAlerts())
          if ((m = path.match(/^\/alerts\/([^/]+)\/read$/)) && req.method === 'POST') { await p.markAlertRead(m[1]); return json(res, {}) }
          if (path === '/documents/orders' && req.method === 'GET') return json(res, await p.getDocumentOrders())
          if (path === '/documents/orders' && req.method === 'POST') { const b = await readBody(req); return json(res, await p.orderDocument(String(b.titleNumber), b.kind as DocumentOrder['kind'])) }
          if (path === '/sourcing/businesses' && req.method === 'POST') { const b = await readBody(req); return json(res, await p.sourceBusinesses(b.filters as never, b.bounds as never)) }
          if (path === '/sourcing/titles' && req.method === 'POST') { const b = await readBody(req); return json(res, await p.sourceTitles(b.filters as never, b.bounds as never)) }
          if (path === '/crm/match' && req.method === 'POST') { const b = await readBody(req); return json(res, await p.matchCrmRecords(b.records as never)) }
          if (path === '/crm/duplicates' && req.method === 'POST') { const b = await readBody(req); return json(res, await p.findDuplicates(b.records as never)) }
          if (path === '/crm/sample.csv') { res.setHeader('content-type', 'text/csv'); return res.end(await p.sampleCrmCsv()) }
          if (path === '/admin/sources') return json(res, await p.getDataSources())
          if (seg[0] === 'health') return json(res, { ok: true, provider: 'mock' })
          return json(res, { error: 'not found', path }, 404)
        } catch (e) {
          return json(res, { error: (e as Error).message }, 500)
        }
      })
    },
  }
}
