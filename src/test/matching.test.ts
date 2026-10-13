import { describe, expect, it } from 'vitest'
import { extractPostcode, jaroWinkler, normaliseAddress, normaliseCompanyName, normalisePostcode, similarity, validCompanyNumber } from '@/lib/matching'

describe('postcodes', () => {
  it('normalises spacing and case', () => {
    expect(normalisePostcode('cv324ab')).toBe('CV32 4AB')
    expect(normalisePostcode('CV32  4AB')).toBe('CV32 4AB')
    expect(normalisePostcode('W1A 1AA')).toBe('W1A 1AA')
  })
  it('rejects junk', () => {
    expect(normalisePostcode('12345')).toBeUndefined()
    expect(normalisePostcode('')).toBeUndefined()
  })
  it('extracts from an address string', () => {
    expect(extractPostcode('12 The Parade, Leamington Spa CV32 4DG')).toBe('CV32 4DG')
    expect(extractPostcode('no postcode here')).toBeUndefined()
  })
})

describe('address and company normalisation', () => {
  it('expands abbreviations and strips the postcode', () => {
    expect(normaliseAddress('14a Regent St., Leamington Spa, CV32 5EG')).toBe('14a regent street leamington spa')
    expect(normaliseAddress('14A REGENT STREET LEAMINGTON SPA')).toBe('14a regent street leamington spa')
  })
  it('drops legal suffixes', () => {
    expect(normaliseCompanyName('Arden Inns Group Ltd')).toBe('arden inns')
    expect(normaliseCompanyName('ARDEN INNS GROUP LIMITED')).toBe('arden inns')
  })
  it('validates company numbers', () => {
    expect(validCompanyNumber('8133761')).toBe('08133761')
    expect(validCompanyNumber('SC123456')).toBe('SC123456')
    expect(validCompanyNumber('abc')).toBeUndefined()
  })
})

describe('similarity', () => {
  it('scores identical strings 1 and unrelated low', () => {
    expect(jaroWinkler('fat pug', 'fat pug')).toBe(1)
    expect(similarity('royal pug', 'royal pug leamington')).toBeGreaterThan(0.6)
    expect(similarity('royal pug', 'benjamin satchwell')).toBeLessThan(0.5)
  })
})
