/**
 * Staff directory for alert recipients. Fictional people for the demo; in production this comes
 * from the identity provider (Entra ID group members) through GET /api/staff.
 */
export interface StaffMember { id: string; name: string; email: string; mobile?: string; office: string; team: string; role: 'agent' | 'compliance' | 'admin' }

export const TEAMS = ['Pubs & Restaurants', 'Hotels', 'Care', 'Childcare & Education', 'Medical & Dental', 'Pharmacy', 'Retail', 'Leisure', 'Business Development', 'Compliance'] as const

export const STAFF: StaffMember[] = [
  { id: 'demo-agent', name: 'Demo agent', email: 'agent@example.internal', mobile: '+44 7700 900001', office: 'Birmingham', team: 'Pubs & Restaurants', role: 'agent' },
  { id: 'demo-compliance', name: 'Demo compliance officer', email: 'compliance@example.internal', mobile: '+44 7700 900002', office: 'London', team: 'Compliance', role: 'compliance' },
  { id: 'demo-admin', name: 'Demo administrator', email: 'admin@example.internal', mobile: '+44 7700 900003', office: 'London', team: 'Business Development', role: 'admin' },
  { id: 's-ahuja', name: 'Priya Ahuja', email: 'p.ahuja@example.internal', mobile: '+44 7700 900104', office: 'Birmingham', team: 'Care', role: 'agent' },
  { id: 's-barratt', name: 'Tom Barratt', email: 't.barratt@example.internal', mobile: '+44 7700 900105', office: 'Birmingham', team: 'Pubs & Restaurants', role: 'agent' },
  { id: 's-cole', name: 'Hannah Cole', email: 'h.cole@example.internal', mobile: '+44 7700 900106', office: 'Bristol', team: 'Hotels', role: 'agent' },
  { id: 's-dunne', name: 'Marcus Dunne', email: 'm.dunne@example.internal', office: 'Bristol', team: 'Pubs & Restaurants', role: 'agent' },
  { id: 's-ellis', name: 'Sophie Ellis', email: 's.ellis@example.internal', mobile: '+44 7700 900108', office: 'London', team: 'Childcare & Education', role: 'agent' },
  { id: 's-farrell', name: 'Declan Farrell', email: 'd.farrell@example.internal', mobile: '+44 7700 900109', office: 'Manchester', team: 'Leisure', role: 'agent' },
  { id: 's-gill', name: 'Amrit Gill', email: 'a.gill@example.internal', office: 'Manchester', team: 'Pharmacy', role: 'agent' },
  { id: 's-hughes', name: 'Bethan Hughes', email: 'b.hughes@example.internal', mobile: '+44 7700 900111', office: 'Cardiff', team: 'Care', role: 'agent' },
  { id: 's-ibrahim', name: 'Yusuf Ibrahim', email: 'y.ibrahim@example.internal', mobile: '+44 7700 900112', office: 'Leeds', team: 'Medical & Dental', role: 'agent' },
  { id: 's-jensen', name: 'Freya Jensen', email: 'f.jensen@example.internal', office: 'Edinburgh', team: 'Hotels', role: 'agent' },
  { id: 's-khan', name: 'Imran Khan', email: 'i.khan@example.internal', mobile: '+44 7700 900114', office: 'London', team: 'Retail', role: 'agent' },
  { id: 's-lowe', name: 'Georgia Lowe', email: 'g.lowe@example.internal', mobile: '+44 7700 900115', office: 'Exeter', team: 'Pubs & Restaurants', role: 'agent' },
  { id: 's-mcrae', name: 'Callum McRae', email: 'c.mcrae@example.internal', office: 'Glasgow', team: 'Care', role: 'agent' },
  { id: 's-nash', name: 'Olivia Nash', email: 'o.nash@example.internal', mobile: '+44 7700 900117', office: 'Nottingham', team: 'Childcare & Education', role: 'agent' },
  { id: 's-osei', name: 'Kwame Osei', email: 'k.osei@example.internal', mobile: '+44 7700 900118', office: 'London', team: 'Business Development', role: 'agent' },
  { id: 's-patel', name: 'Nisha Patel', email: 'n.patel@example.internal', office: 'Birmingham', team: 'Pharmacy', role: 'agent' },
  { id: 's-quinn', name: 'Rory Quinn', email: 'r.quinn@example.internal', mobile: '+44 7700 900120', office: 'Newcastle', team: 'Leisure', role: 'agent' },
  { id: 's-reid', name: 'Eleanor Reid', email: 'e.reid@example.internal', mobile: '+44 7700 900121', office: 'London', team: 'Compliance', role: 'compliance' },
  { id: 's-singh', name: 'Harpreet Singh', email: 'h.singh@example.internal', office: 'Leeds', team: 'Medical & Dental', role: 'agent' },
  { id: 's-turner', name: 'Jack Turner', email: 'j.turner@example.internal', mobile: '+44 7700 900123', office: 'Bristol', team: 'Retail', role: 'agent' },
  { id: 's-walsh', name: 'Niamh Walsh', email: 'n.walsh@example.internal', mobile: '+44 7700 900124', office: 'Manchester', team: 'Hotels', role: 'agent' },
]

export const staffById = (id: string) => STAFF.find((s) => s.id === id)
export const OFFICES = Array.from(new Set(STAFF.map((s) => s.office))).sort()
