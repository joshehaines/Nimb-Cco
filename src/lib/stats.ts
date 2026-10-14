export function median(xs: number[]): number | undefined {
  const a = xs.filter((x) => Number.isFinite(x)).sort((x, y) => x - y)
  if (!a.length) return undefined
  const mid = Math.floor(a.length / 2)
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2
}

export function quantile(xs: number[], q: number): number | undefined {
  const a = xs.filter((x) => Number.isFinite(x)).sort((x, y) => x - y)
  if (!a.length) return undefined
  const pos = (a.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return a[lo] + (a[hi] - a[lo]) * (pos - lo)
}

export function mean(xs: number[]): number | undefined {
  const a = xs.filter((x) => Number.isFinite(x))
  return a.length ? a.reduce((s, x) => s + x, 0) / a.length : undefined
}
