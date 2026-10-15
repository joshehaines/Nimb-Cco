import type { DataProvider } from './provider'
import { HttpProvider } from './http/HttpProvider'

/** The one data provider: the FastAPI + PostGIS backend at /api. */
export const provider: DataProvider = new HttpProvider()

export * from './types'
export type { DataProvider } from './provider'
