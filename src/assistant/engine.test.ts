import { describe, expect, it } from 'vitest'
import { interpret } from './engine'

describe('assistant local interpreter', () => {
  it('routes finds, layers, colouring and basemaps', () => {
    expect(interpret('find The Copper Kettle')).toMatchObject({ tool: 'search', input: { query: 'the copper kettle' } })
    expect(interpret('WK595975')).toMatchObject({ tool: 'search' })
    expect(interpret('show price paid and traffic')).toMatchObject({ tool: 'set_layers', input: { on: ['pricePaid', 'traffic'] } })
    expect(interpret('hide the planning layer')).toMatchObject({ tool: 'set_layers', input: { off: ['planning'] } })
    expect(interpret('clear all pins')).toMatchObject({ tool: 'set_layers', input: { all_off: true } })
    expect(interpret('colour titles by owner')).toMatchObject({ tool: 'colour_titles', input: { mode: 'owner' } })
    expect(interpret('switch to satellite view')).toMatchObject({ tool: 'set_basemap', input: { basemap: 'satellite' } })
  })
  it('routes sourcing, alerts, competition and watchlist', () => {
    expect(interpret('distressed care homes in Bristol')).toMatchObject({ tool: 'find_businesses', input: { sector: 'care homes', distressed_only: true, place: 'bristol' } })
    expect(interpret('show me freehold pubs')).toMatchObject({ tool: 'find_businesses', input: { sector: 'pubs', tenure: 'Freehold' } })
    expect(interpret('alert me when a pub goes into administration')).toMatchObject({ tool: 'create_alert', input: { preset: 'dirty-deals', sectors: ['pub'] } })
    expect(interpret('text me about CQC downgrades instantly')).toMatchObject({ tool: 'create_alert', input: { preset: 'regulator', channels: ['inapp', 'email', 'sms'], frequency: 'instant' } })
    expect(interpret('who competes with The Leam Ferry?')).toMatchObject({ tool: 'show_competition', input: { query: 'the leam ferry' } })
    expect(interpret('add The Leam Ferry to my sites')).toMatchObject({ tool: 'add_to_my_sites', input: { query: 'the leam ferry' } })
  })
  it('routes navigation, tools and help', () => {
    expect(interpret('go to Bristol')).toMatchObject({ tool: 'go_to_place', input: { place: 'bristol' } })
    expect(interpret('open the pipeline')).toMatchObject({ tool: 'open_page', input: { page: 'pipeline' } })
    expect(interpret('street view')).toMatchObject({ tool: 'map_tool', input: { tool: 'streetview' } })
    expect(interpret('draw a site area')).toMatchObject({ tool: 'map_tool', input: { tool: 'polygon' } })
    expect(interpret('what is CCOD?')).toMatchObject({ tool: 'help', input: { topic: 'CCOD' } })
    expect(interpret('how do I export to the CRM')).toMatchObject({ tool: 'help' })
  })
})
