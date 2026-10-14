/// <reference lib="webworker" />
import { generateDataset } from './generate'
import type { RealLayers } from '../real'

// Dataset generation on the real street network takes about 0.7 s; running it here keeps
// the UI responsive on first load. The real layers are not echoed back (the caller has them).
self.onmessage = (e: MessageEvent<{ seed?: number; real?: RealLayers }>) => {
  const ds = generateDataset(e.data.seed, e.data.real)
  const { real: _real, ...rest } = ds
  void _real
  ;(self as unknown as Worker).postMessage(rest)
}
