/** Deterministic PRNG so the demo dataset is stable across reloads and tests. */
export class Rng {
  private state: number
  constructor(seed: number) {
    this.state = seed >>> 0
  }
  next(): number {
    // mulberry32
    let t = (this.state += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  int(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min
  }
  float(min: number, max: number): number {
    return this.next() * (max - min) + min
  }
  bool(p = 0.5): boolean {
    return this.next() < p
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)]
  }
  weighted<T>(items: readonly { v: T; w: number }[]): T {
    const total = items.reduce((s, i) => s + i.w, 0)
    let r = this.next() * total
    for (const i of items) {
      r -= i.w
      if (r <= 0) return i.v
    }
    return items[items.length - 1].v
  }
  shuffle<T>(arr: T[]): T[] {
    const a = [...arr]
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1))
      ;[a[i], a[j]] = [a[j], a[i]]
    }
    return a
  }
  date(fromYear: number, toYear: number): string {
    const y = this.int(fromYear, toYear)
    const m = this.int(1, 12)
    const d = this.int(1, 28)
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }
  id(prefix: string, len = 6): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    let s = ''
    for (let i = 0; i < len; i++) s += chars[this.int(0, chars.length - 1)]
    return `${prefix}${s}`
  }
}
