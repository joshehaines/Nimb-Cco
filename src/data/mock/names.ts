/** Name pools for the synthetic Leamington Spa / Warwick demo dataset. All companies and people are fictional. */

export const STREETS: { name: string; lon: number; lat: number; bearing: number; lengthM: number; commercial: number; major?: boolean; postcodes: string[] }[] = [
  { name: 'The Parade', lon: -1.5365, lat: 52.2895, bearing: 5, lengthM: 520, commercial: 0.95, major: true, postcodes: ['CV32 4AB', 'CV32 4DG', 'CV32 4BQ'] },
  { name: 'Regent Street', lon: -1.5385, lat: 52.2885, bearing: 95, lengthM: 380, commercial: 0.9, postcodes: ['CV32 5EG', 'CV32 5HW'] },
  { name: 'Warwick Street', lon: -1.5390, lat: 52.2905, bearing: 95, lengthM: 420, commercial: 0.9, major: true, postcodes: ['CV32 5LB', 'CV32 5JP', 'CV32 4QY'] },
  { name: 'Bath Street', lon: -1.5355, lat: 52.2860, bearing: 10, lengthM: 300, commercial: 0.85, major: true, postcodes: ['CV31 3AF', 'CV31 3AE'] },
  { name: 'Clemens Street', lon: -1.5350, lat: 52.2838, bearing: 8, lengthM: 260, commercial: 0.85, postcodes: ['CV31 2DN', 'CV31 2DP'] },
  { name: 'High Street', lon: -1.5340, lat: 52.2822, bearing: 100, lengthM: 320, commercial: 0.8, postcodes: ['CV31 1LN', 'CV31 1LW'] },
  { name: 'Clarendon Avenue', lon: -1.5375, lat: 52.2925, bearing: 95, lengthM: 360, commercial: 0.6, postcodes: ['CV32 5PP', 'CV32 5PR'] },
  { name: 'Kenilworth Road', lon: -1.5370, lat: 52.2955, bearing: 2, lengthM: 600, commercial: 0.35, major: true, postcodes: ['CV32 6JA', 'CV32 6JE', 'CV32 6JG'] },
  { name: 'Tachbrook Road', lon: -1.5330, lat: 52.2790, bearing: 170, lengthM: 650, commercial: 0.4, major: true, postcodes: ['CV31 3DB', 'CV31 3DF', 'CV31 3DQ'] },
  { name: 'Emscote Road', lon: -1.5560, lat: 52.2865, bearing: 275, lengthM: 700, commercial: 0.45, major: true, postcodes: ['CV34 5QJ', 'CV34 5QN', 'CV34 5QS'] },
  { name: 'Smith Street', lon: -1.5800, lat: 52.2822, bearing: 275, lengthM: 300, commercial: 0.9, postcodes: ['CV34 4HS', 'CV34 4JA'] },
  { name: 'Jury Street', lon: -1.5845, lat: 52.2815, bearing: 275, lengthM: 240, commercial: 0.9, major: true, postcodes: ['CV34 4EW', 'CV34 4EH'] },
  { name: 'Market Place', lon: -1.5880, lat: 52.2812, bearing: 10, lengthM: 180, commercial: 0.95, postcodes: ['CV34 4SA', 'CV34 4SB'] },
  { name: 'Swan Street', lon: -1.5865, lat: 52.2830, bearing: 5, lengthM: 160, commercial: 0.9, postcodes: ['CV34 4BJ'] },
  { name: 'Coten End', lon: -1.5740, lat: 52.2850, bearing: 275, lengthM: 420, commercial: 0.5, major: true, postcodes: ['CV34 4NP', 'CV34 4NR'] },
  { name: 'Myton Road', lon: -1.5660, lat: 52.2780, bearing: 275, lengthM: 650, commercial: 0.25, major: true, postcodes: ['CV34 6PP', 'CV34 6PT'] },
  { name: 'Leam Terrace', lon: -1.5290, lat: 52.2850, bearing: 95, lengthM: 450, commercial: 0.3, postcodes: ['CV31 1BA', 'CV31 1BD'] },
  { name: 'Radford Road', lon: -1.5250, lat: 52.2830, bearing: 110, lengthM: 500, commercial: 0.4, major: true, postcodes: ['CV31 1JQ', 'CV31 1NF'] },
  { name: 'Rugby Road', lon: -1.5420, lat: 52.2975, bearing: 300, lengthM: 550, commercial: 0.4, major: true, postcodes: ['CV32 6DJ', 'CV32 6DL'] },
  { name: 'Lillington Road', lon: -1.5300, lat: 52.2950, bearing: 40, lengthM: 500, commercial: 0.3, postcodes: ['CV32 6LN', 'CV32 6LW'] },
]

// Demo business names are fictional. They must not name a real trader, because the demo
// attaches synthetic ownership, regulator and distress attributes to them.
export const PUB_NAMES = ['The Copper Kettle', 'The Weavers Arms', 'The Nine Elms', 'The Brindled Hare', 'The Tanners Rest', 'The Saltway Inn', 'The Old Maltings', 'The Fenny Fox', 'The Wheelwright', 'The Leam Ferry', 'The Three Spires', 'The Dovecote', 'The Lantern', 'The Printers Devil', 'The Ironmonger', 'The Beacon Tavern', 'The Pump Rooms Arms', 'The Harriers', 'The Coopers Yard', 'The Woolcomber', 'The Sedge and Rush', 'The Gatehouse', 'The Mercers Arms', 'The Spinney', 'The Old Toll House', 'The Chandlers', 'The Foundry Tap', 'The Ridgeway', 'The Pear Tree', 'The Boatmans Rest', 'The Longbow', 'The Millstream', 'The Tallow Chandler', 'The Kiln House']
export const RESTAURANT_NAMES = ['Marlowe\'s Kitchen', 'Osteria Rialto', 'The Saffron Room', 'Brasserie Vaux', 'Bombay Lantern', 'Ember & Ash', 'Taverna Kyma', 'Noodle Yard', 'The Oyster Loft', 'Casa Montero', 'Pepperpot Bistro', 'Hanoi Street Kitchen', 'The Pantry on Mill Lane', 'Trattoria Fiorelli', 'Szechuan Garden House', 'Smokehouse No. 9', 'The Greenhouse Cafe', 'Mezze Corner', 'Bramble & Thyme', 'Koji Izakaya', 'The Cutlers Table', 'Riverbank Grill', 'Cantina Luz', 'Pavilion Tea Rooms']
export const HOTEL_NAMES = ['Harcourt Manor Hotel', 'The Crescent Hotel', 'Spa Gardens Hotel', 'Pelham House Hotel', 'The Coach House Inn', 'Beaumont Lodge', 'Riverside Court Hotel', 'Fernhill Hall', 'The Old Rectory Guest House', 'Linden Park Hotel', 'Castle View Boutique Hotel', 'Larkspur Bed & Breakfast', 'Avonbank Guest House']
export const CARE_NAMES = ['Hawthorn Lodge Care Home', 'Meadowcroft Nursing Home', 'Elmhurst Care Home', 'Beechwood Court Care Home', 'Larchfield House', 'Orchard Rise Care Village', 'Rowan Gardens Nursing Home', 'Willowbrook House', 'Chestnut Grange Care Home', 'Linden Court Residential Home', 'Fairfield Manor Nursing Home', 'Ashgrove House Care Home', 'Sycamore Lodge', 'Cedar Hill Care Home', 'Primrose Court Care Home', 'Heather Bank', 'Mulberry House', 'Oakdene Care Home', 'Brookfield Hall', 'Lavender Lawns']
export const NURSERY_NAMES = ['Little Otters Day Nursery', 'Honeybee Nursery', 'Puddleducks Day Nursery', 'Acorn Hollow Nursery', 'Bluebell Wood Nursery', 'Cheeky Monkeys Day Nursery', 'Oak Tree Tots', 'Daisy Chain Pre-School', 'Sunbeams Day Nursery', 'Woodpeckers Nursery', 'Hedgehog Hollow Nursery', 'Tiny Explorers Nursery', 'Pebbles Day Nursery', 'Buttercup Nursery', 'Owl Barn Day Nursery', 'Starfish Nursery']
export const DENTAL_NAMES = ['Crescent Dental Practice', 'Spa Town Dental Care', 'Bridgewater Dental Studio', 'Willow Smile Dental', 'Priors Dental', 'Mill Lane Dental Practice', 'Avon Orthodontics', 'Castle Street Dental', 'Gatehouse Dental Surgery', 'Linden Dental Care', 'Riverside Dental Warwick']
export const MEDICAL_NAMES = ['Spa Gardens Medical Practice', 'Millbrook Medical Centre', 'Fernhill Medical Centre', 'Priors Field Medical Centre', 'Linden Road Surgery', 'Castle Meadow Family Health Centre', 'Avonbank Private Hospital', 'Crescent Physiotherapy Clinic']
export const PHARMACY_NAMES = ['Crescent Pharmacy', 'Spa Chemists', 'Millbrook Pharmacy', 'Harcourt Pharmacy', 'Gatehouse Pharmacy', 'Linden Pharmacy', 'Castle Meadow Pharmacy', 'Fernhill Pharmacy', 'Avonbank Pharmacy', 'Priors Pharmacy', 'Orchard Pharmacy', 'Riverside Chemist']
export const CONVENIENCE_NAMES = ['Parkside Stores', 'Corner Larder', 'Crescent Convenience', 'Millbrook Mini Market', 'Daybreak Stores', 'Linden Local', 'The Village Pantry', 'Fernhill Food Store', 'Gatehouse Express', 'Priors Newsagent', 'Avonbank Service Station', 'Castle Meadow Filling Station', 'Orchard Stores', 'Harcourt Food & Wine', 'Riverside Stores', 'Meadow Lane Supermarket']
export const LEISURE_NAMES = ['Spa Gardens Leisure Centre', 'Millbrook Gym', 'The Picture Palace Cinema', 'Crescent Snooker Hall', 'Castle Meadow Fitness', 'The Lantern Theatre']
export const GARDEN_NAMES = ['Fernhill Garden Centre', 'Orchard Rise Garden Centre', 'Millbrook Nurseries']

export const PUBCOS = ['Arden Inns Group Ltd', 'Midland Taverns Ltd', 'Heart of England Pub Company Ltd', 'Leam Valley Hospitality Ltd', 'Castle Taverns (Warwick) Ltd', 'Spa Town Inns Ltd', 'Greenfield Brewing Estates Ltd', 'Trent Hospitality Holdings plc']
export const CARE_GROUPS = ['Arden Care Group Ltd', 'Heartlands Healthcare Ltd', 'Priory Court Care Ltd', 'Avon Care Homes Ltd', 'Shires Senior Living Ltd', 'Milverton Care Ltd', 'Warwickshire Nursing Homes Ltd']
export const NURSERY_GROUPS = ['Little Acorns Childcare Ltd', 'Bright Beginnings Nurseries Ltd', 'Kiddicare Group Ltd', 'Happy Days Early Years Ltd', 'Tiny Toes Childcare Ltd']
export const PHARMACY_GROUPS = ['Boots UK Ltd', 'Jhoots Pharmacy Ltd', 'Bestway Healthcare Ltd', 'Day Lewis plc', 'Regent Health Ltd', 'Spa Pharmacies Ltd']
export const DENTAL_GROUPS = ['Parade Dental Ltd', 'Smile Spa Group Ltd', 'Portman Dental Care Ltd', 'Rodericks Dental Ltd', 'Warwick Dental Studio Ltd']
export const HOTEL_GROUPS = ['Mallory Court Hotels Ltd', 'Episode Hotels Ltd', 'Regent Leamington Ltd', 'Arden Hospitality Ltd', 'Spa Town Hotels Ltd']
export const RETAIL_GROUPS = ['Nisa Retail Ltd', 'Spa Convenience Ltd', 'Midlands Forecourts Ltd', 'Co-operative Group Ltd', 'Tesco Stores Ltd', 'One Stop Stores Ltd']
export const PROPCOS = ['Leam Property Investments Ltd', 'Warwick Estates Holdings Ltd', 'Avon Freeholds Ltd', 'Regent Street Properties Ltd', 'Spa Commercial Ltd', 'Clarendon Property Co Ltd', 'Heritage Freeholds (Midlands) Ltd', 'Tachbrook Developments Ltd', 'Kenilworth Road Investments Ltd', 'Arden Pension Trustees Ltd', 'Northgate Property Partners LLP', 'Emscote Holdings Ltd']
export const OVERSEAS = ['Spa Town Holdings SARL', 'Warwick Capital BV', 'Leam Investments (Jersey) Ltd', 'Midlands Property Holdings (IOM) Ltd']
export const LOCAL_AUTHORITIES = ['Warwick District Council', 'Warwickshire County Council']
export const CHARITIES = ['The Lord Leycester Hospital Trust', 'Royal Leamington Spa Almshouses', 'Warwick Charity Estates']
export const LENDERS = ['Barclays Bank plc', 'National Westminster Bank plc', 'HSBC UK Bank plc', 'Lloyds Bank plc', 'Santander UK plc', 'Allied Irish Banks plc', 'Shawbrook Bank Ltd', 'OakNorth Bank plc', 'Hampshire Trust Bank plc', 'Virgin Money UK plc', 'Together Commercial Finance Ltd']

export const FIRST_NAMES = ['James', 'Sarah', 'David', 'Priya', 'Michael', 'Emma', 'Rajesh', 'Helen', 'Thomas', 'Amanda', 'Peter', 'Claire', 'Mohammed', 'Louise', 'Andrew', 'Karen', 'Simon', 'Nicola', 'Richard', 'Joanne', 'Paul', 'Susan', 'Mark', 'Rebecca', 'Daniel', 'Hannah', 'Gurpreet', 'Fiona', 'Christopher', 'Elizabeth']
export const LAST_NAMES = ['Smith', 'Patel', 'Jones', 'Williams', 'Brown', 'Taylor', 'Davies', 'Singh', 'Evans', 'Wilson', 'Thomas', 'Roberts', 'Johnson', 'Walker', 'Wright', 'Robinson', 'Thompson', 'White', 'Hughes', 'Edwards', 'Green', 'Hall', 'Wood', 'Harris', 'Lewis', 'Martin', 'Jackson', 'Clarke', 'Kaur', 'Khan']

export const PLANNING_DESCRIPTIONS: Record<string, string[]> = {
  Pub: ['Change of use from public house (Sui Generis) to 4 residential flats (Class C3)', 'Erection of single storey rear extension to form covered outdoor seating area', 'Installation of new signage and external lighting', 'Variation of condition 3 (opening hours) of planning permission', 'Conversion of first floor to 2 self-contained flats'],
  Restaurant: ['Change of use from retail (Class E(a)) to restaurant (Class E(b)) with extraction flue', 'Installation of kitchen extraction duct to rear elevation', 'Replacement shopfront and new fascia signage', 'Erection of retractable awning and pavement seating'],
  Hotel: ['Erection of two storey extension to provide 12 additional bedrooms', 'Conversion of outbuilding to 4 letting rooms', 'Installation of air source heat pumps', 'Change of use from hotel (C1) to residential care home (C2)'],
  'Care Home': ['Erection of two storey extension to provide 18 additional bedrooms with en-suite facilities', 'Change of use from dwelling (C3) to residential care home (C2)', 'Installation of passenger lift and alterations to fenestration', 'Erection of single storey day room extension'],
  Childcare: ['Change of use from dwelling (C3) to day nursery (Class E(f))', 'Erection of single storey extension to increase capacity from 42 to 64 places', 'Installation of outdoor canopy and play surfacing', 'Variation of condition 2 to extend opening hours to 07:00-19:00'],
  Dental: ['Change of use from office (Class E(g)) to dental practice (Class E(e))', 'Installation of air conditioning units to rear', 'Alterations to provide level access and additional surgery'],
  Medical: ['Erection of single storey extension to provide 3 consulting rooms', 'Change of use from retail to medical centre (Class E(e))'],
  Pharmacy: ['New shopfront and automatic entrance doors', 'Installation of consultation room and ATM'],
  'Convenience Retail': ['Installation of ATM and associated signage', 'Change of use from bank (Class E) to convenience store with ancillary post office', 'Replacement shopfront', 'Erection of canopy over forecourt and new fuel tanks'],
  Leisure: ['Change of use from retail to gym (Class E(d))', 'Installation of plant and extraction'],
  'Garden Centre': ['Erection of restaurant extension and covered plant sales area', 'Change of use of agricultural land to garden centre car park'],
  Other: ['Erection of 9 dwellings with associated access and landscaping', 'Demolition of existing building and erection of 24 apartments', 'Change of use from office to 6 flats under Class MA prior approval', 'Erection of detached dwelling', 'Two storey side extension', 'Prior approval for upward extension of 1 storey'],
}
