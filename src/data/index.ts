import type { DataProvider } from './provider'
import { MockProvider } from './mock/MockProvider'
import { HttpProvider } from './http/HttpProvider'

const mode = (import.meta.env.VITE_DATA_PROVIDER as string | undefined) ?? 'mock'

/** Singleton provider. Swap to HTTP by setting VITE_DATA_PROVIDER=http. */
export const provider: DataProvider = mode === 'http' ? new HttpProvider() : new MockProvider()

/** Only available in mock mode; pages that need whole collections for demo tables use this. */
export const mock = provider instanceof MockProvider ? provider : undefined

export * from './types'
export type { DataProvider } from './provider'
