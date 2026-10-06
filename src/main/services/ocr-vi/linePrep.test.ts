import { describe, expect, it } from 'vitest'
import { contrastOf, isLightOnDark, luminanceOf, otsuThreshold } from './linePrep'

const mix = (dark: number, light: number, darkValue = 20, lightValue = 235): number[] =>
  [...Array(dark).fill(darkValue), ...Array(light).fill(lightValue)]

describe('otsuThreshold', () => {
  it('separates two gray levels', () => {
    const t = otsuThreshold(mix(300, 700))
    expect(t).toBeGreaterThanOrEqual(20)
    expect(t).toBeLessThan(235)
  })
  it('handles flat images without throwing', () => {
    expect(() => otsuThreshold(Array(100).fill(128))).not.toThrow()
    expect(() => otsuThreshold([])).not.toThrow()
  })
})

describe('isLightOnDark', () => {
  it('dark text on light background is not inverted', () => {
    expect(isLightOnDark(mix(150, 850), 128)).toBe(false)
  })
  it('light text on dark background is inverted', () => {
    expect(isLightOnDark(mix(850, 150), 128)).toBe(true)
  })
  it('uniform image is not inverted', () => {
    expect(isLightOnDark(Array(50).fill(200), 128)).toBe(false)
  })
})

describe('contrastOf / luminanceOf', () => {
  it('is zero for flat images and positive for text-like images', () => {
    expect(contrastOf(Array(50).fill(100))).toBe(0)
    expect(contrastOf(mix(100, 100))).toBeGreaterThan(0.5)
  })
  it('converts RGBA to luminance', () => {
    const gray = luminanceOf([255, 255, 255, 255, 0, 0, 0, 255, 255, 0, 0, 255])
    expect(Array.from(gray)).toEqual([255, 0, 76])
  })
})
