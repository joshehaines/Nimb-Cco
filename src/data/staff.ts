import { create } from 'zustand'
import { provider } from '@/data'

/** A colleague who can own a deal or receive an alert: local sign-in accounts plus the staff table (identity-provider sync). */
export interface StaffMember { id: string; name: string; email: string; mobile?: string; office: string; team: string; role: 'agent' | 'compliance' | 'admin' }

export const TEAMS = ['Pubs & Restaurants', 'Hotels', 'Care', 'Childcare & Education', 'Medical & Dental', 'Pharmacy', 'Retail', 'Leisure', 'Business Development', 'Compliance'] as const

/** Christie & Co offices, used for office patches and pipeline filters. */
export const OFFICES = ['Birmingham', 'Bristol', 'Cardiff', 'Edinburgh', 'Exeter', 'Glasgow', 'Leeds', 'London', 'Manchester', 'Newcastle', 'Nottingham']

interface StaffState {
  staff: StaffMember[]
  loaded: boolean
  load: () => Promise<void>
}

export const useStaff = create<StaffState>((set, get) => ({
  staff: [],
  loaded: false,
  load: async () => {
    if (get().loaded) return
    try {
      const rows = await provider.getStaff()
      set({ staff: (rows ?? []).map((r) => ({ ...r, office: r.office ?? '', team: r.team ?? '', role: (r.role as StaffMember['role']) ?? 'agent' })), loaded: true })
    } catch {
      set({ loaded: true })
    }
  },
}))

export const staffById = (id: string): StaffMember | undefined => useStaff.getState().staff.find((s) => s.id === id)
