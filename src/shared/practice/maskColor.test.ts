import { describe, expect, it } from 'vitest'
import {
  contrastingMarkerColor,
  DEFAULT_MASK_COLOR,
  normalizeHexColor,
  resolveRegionMaskColor,
  resolveRegionMaskOpacity
} from './maskColor'

describe('maskColor', () => {
  it('chuan hoa hex hop le va tu choi hex sai', () => {
    expect(normalizeHexColor('#FFAA00')).toBe('#ffaa00')
    expect(normalizeHexColor('#f80')).toBe('#ff8800')
    expect(normalizeHexColor('red')).toBeNull()
    expect(normalizeHexColor('#12345')).toBeNull()
    expect(normalizeHexColor(null)).toBeNull()
  })

  it('mau rieng cua vung uu tien hon mau cua file', () => {
    expect(resolveRegionMaskColor('#ff0000', '#0a0a0a')).toBe('#ff0000')
    expect(resolveRegionMaskColor(null, '#00ff00')).toBe('#00ff00')
  })

  it('mau rieng hong thi lui ve mau file, file hong thi ve mac dinh', () => {
    expect(resolveRegionMaskColor('xxx', '#00ff00')).toBe('#00ff00')
    expect(resolveRegionMaskColor(undefined, 'bad')).toBe(DEFAULT_MASK_COLOR)
  })

  it('do mo: rieng uu tien, ep vao 0..1', () => {
    expect(resolveRegionMaskOpacity(0.2, 0.8)).toBe(0.2)
    expect(resolveRegionMaskOpacity(null, 0.8)).toBe(0.8)
    expect(resolveRegionMaskOpacity(null, null)).toBe(0.5)
    expect(resolveRegionMaskOpacity(3, 0.5)).toBe(1)
    expect(resolveRegionMaskOpacity(-1, 0.5)).toBe(0)
  })

  it('mau danh dau doi nghich voi mau che', () => {
    expect(contrastingMarkerColor('#0a0a0a')).toBe('#ffd60a')
    expect(contrastingMarkerColor('#ffffff')).toBe('#6a1b9a')
  })
})
