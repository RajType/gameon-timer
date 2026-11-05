// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import {
  applyBranding,
  applyCachedBranding,
  contrastRatio,
  contrastText,
  DEFAULT_BRAND_COLOR,
  isLegibleOnCanvas,
  normalizeHex,
} from './branding'

const root = () => document.documentElement.style

beforeEach(() => {
  root().removeProperty('--brand-color')
  root().removeProperty('--brand-contrast')
  localStorage.clear()
})

describe('colour helpers (mirror admin::normalize_hex)', () => {
  it('normalises hex colours', () => {
    expect(normalizeHex('#ABC')).toBe('#aabbcc')
    expect(normalizeHex(' #0A84FF ')).toBe('#0a84ff')
    for (const bad of ['red', '#12345', '0a84ff', '#ggg', '']) expect(normalizeHex(bad)).toBeNull()
  })

  it('picks readable text for the brand colour (WCAG)', () => {
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 5)
    expect(contrastText(DEFAULT_BRAND_COLOR)).toBe('#000000')
    expect(contrastText('#001f5b')).toBe('#ffffff') // navy → white text
    expect(isLegibleOnCanvas(DEFAULT_BRAND_COLOR)).toBe(true)
    expect(isLegibleOnCanvas('#1c1c1e')).toBe(false)
  })
})

describe('applyBranding', () => {
  it('injects --brand-color and --brand-contrast into :root', () => {
    expect(applyBranding('#0A84FF')).toBe(true)
    expect(root().getPropertyValue('--brand-color')).toBe('#0a84ff')
    expect(root().getPropertyValue('--brand-contrast')).toBe('#000000')
    applyBranding('#001f5b')
    expect(root().getPropertyValue('--brand-contrast')).toBe('#ffffff')
  })

  it('ignores invalid colours (the current brand stays)', () => {
    applyBranding('#bf5af2')
    expect(applyBranding('#12')).toBe(false)
    expect(root().getPropertyValue('--brand-color')).toBe('#bf5af2')
  })

  it('caches only when asked, and applies the cache at startup', () => {
    applyBranding('#ff375f')
    expect(localStorage.length).toBe(0) // live previews are not cached
    applyBranding('#ff375f', { persist: true })
    root().removeProperty('--brand-color')
    applyCachedBranding()
    expect(root().getPropertyValue('--brand-color')).toBe('#ff375f')
  })
})
