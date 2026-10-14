/** Minimal spatial hash in local metres for fast neighbourhood queries during data generation. */
export class Grid<T> {
  private cells = new Map<string, T[]>()
  constructor(private cellM = 50) {}
  private key(x: number, y: number) {
    return `${Math.floor(x / this.cellM)}:${Math.floor(y / this.cellM)}`
  }
  add(x: number, y: number, item: T) {
    const k = this.key(x, y)
    const arr = this.cells.get(k)
    if (arr) arr.push(item)
    else this.cells.set(k, [item])
  }
  /** Items in cells overlapping the square of half-size r around (x, y). */
  near(x: number, y: number, r: number): T[] {
    const out: T[] = []
    const x0 = Math.floor((x - r) / this.cellM)
    const x1 = Math.floor((x + r) / this.cellM)
    const y0 = Math.floor((y - r) / this.cellM)
    const y1 = Math.floor((y + r) / this.cellM)
    for (let i = x0; i <= x1; i++) for (let j = y0; j <= y1; j++) {
      const arr = this.cells.get(`${i}:${j}`)
      if (arr) out.push(...arr)
    }
    return out
  }
}
