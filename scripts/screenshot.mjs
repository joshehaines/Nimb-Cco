import { chromium } from 'playwright-core'
const out = process.argv[2]
const base = 'http://localhost:4173'
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
await ctx.addInitScript(() => localStorage.setItem('cpi-demo-persona', 'demo-agent'))
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 200)}`) })
const shots = [
  ['dashboard', '/'],
  ['map', '/map'],
  ['map-business', '/map/business/B0001'],
  ['sourcing', '/sourcing'],
  ['watchlist', '/watchlist'],
  ['alerts', '/alerts'],
  ['leases', '/leases'],
  ['documents', '/documents'],
  ['admin', '/admin'],
]
for (const [name, path] of shots) {
  await page.goto(base + path, { waitUntil: 'networkidle', timeout: 30000 }).catch((e) => errors.push(`nav ${path}: ${e.message}`))
  await page.waitForTimeout(name.startsWith('map') ? 2500 : 800)
  await page.screenshot({ path: `${out}/${name}.png` })
  console.log('shot', name)
}
// Company page via first business
await page.goto(base + '/map/business/B0001', { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)
const tabs = ['Ownership', 'Leases & docs', 'Operator', 'Planning', 'Rates & EPC', 'Mobility', 'Constraints']
for (const t of tabs) {
  await page.getByRole('tab', { name: t }).click()
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${out}/tab-${t.replace(/[^a-z]/gi, '').toLowerCase()}.png` })
}
// Find a leasehold business, order its lease and wait for the parse
for (let i = 1; i <= 20; i++) {
  await page.goto(base + `/map/business/B${String(i).padStart(4, '0')}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)
  await page.getByRole('tab', { name: 'Leases & docs' }).click()
  await page.waitForTimeout(300)
  const leaseBtn = page.getByRole('button', { name: /Order lease/ })
  if (await leaseBtn.count()) { await leaseBtn.first().click(); await page.waitForTimeout(4500); await page.screenshot({ path: `${out}/lease-parsed.png` }); break }
}
await page.getByRole('tab', { name: 'Operator' }).click()
await page.waitForTimeout(300)
const companyLink = page.locator('a[href^="/companies/"]').first()
if (await companyLink.count()) { await companyLink.click(); await page.waitForTimeout(1200); await page.screenshot({ path: `${out}/company.png` }) }
// CRM flow
await page.goto(base + '/crm', { waitUntil: 'networkidle' })
await page.getByRole('button', { name: 'Load sample export' }).first().click()
await page.waitForTimeout(500)
await page.getByRole('button', { name: 'Run matching' }).click()
await page.waitForTimeout(2500)
await page.screenshot({ path: `${out}/crm-queue.png`, fullPage: false })
await page.getByRole('tab', { name: /Duplicates/ }).click()
await page.waitForTimeout(400)
await page.screenshot({ path: `${out}/crm-dups.png` })
await page.getByRole('button', { name: 'Plot matched on map' }).click()
await page.waitForTimeout(2500)
await page.screenshot({ path: `${out}/crm-plotted.png` })
// Report
await page.goto(base + '/report/' + (await page.evaluate(() => null) ?? ''), { waitUntil: 'networkidle' }).catch(() => {})
await page.goto(base + '/map/business/B0002', { waitUntil: 'networkidle' })
await page.waitForTimeout(1200)
const reportHref = await page.locator('a:has-text("Report")').first().getAttribute('href')
if (reportHref) { await page.goto(base + reportHref, { waitUntil: 'networkidle' }); await page.waitForTimeout(800); await page.screenshot({ path: `${out}/report.png`, fullPage: true }) }
// Sourcing drawer + filter run
await page.goto(base + '/sourcing', { waitUntil: 'networkidle' })
await page.getByRole('button', { name: 'Filters' }).click()
await page.waitForTimeout(300)
await page.getByText('Distressed care homes').click()
await page.getByRole('button', { name: 'Show results' }).click()
await page.waitForTimeout(1200)
await page.screenshot({ path: `${out}/sourcing-filtered.png` })
// Search
await page.goto(base + '/', { waitUntil: 'networkidle' })
await page.getByPlaceholder(/Search address/).fill('pug')
await page.waitForTimeout(600)
await page.screenshot({ path: `${out}/search.png` })
console.log('ERRORS', JSON.stringify(errors, null, 1))
await browser.close()
