import { describe, expect, it, vi } from 'vitest'
import { createAsyncLruCache } from './asyncLruCache'

describe('createAsyncLruCache', () => {
  it('goi loader 1 lan cho cung khoa, ke ca khi nhieu noi hoi cung luc', async () => {
    const cache = createAsyncLruCache<number>(3)
    const loader = vi.fn(async () => 42)
    const [a, b] = await Promise.all([cache.get('k', loader), cache.get('k', loader)])
    expect(a).toBe(42)
    expect(b).toBe(42)
    expect(await cache.get('k', loader)).toBe(42)
    expect(loader).toHaveBeenCalledTimes(1)
  })

  it('loi khong bi luu: lan sau thu lai', async () => {
    const cache = createAsyncLruCache<string>(3)
    const loader = vi.fn<() => Promise<string>>()
    loader.mockRejectedValueOnce(new Error('hong')).mockResolvedValueOnce('ok')
    await expect(cache.get('k', loader)).rejects.toThrow('hong')
    expect(await cache.get('k', loader)).toBe('ok')
    expect(loader).toHaveBeenCalledTimes(2)
  })

  it('day khoi it dung nhat khi vuot suc chua va goi onEvict', async () => {
    const evicted: string[] = []
    const cache = createAsyncLruCache<string>(2, { onEvict: (value) => evicted.push(value) })
    await cache.get('a', async () => 'A')
    await cache.get('b', async () => 'B')
    await cache.get('a', async () => 'A2') // dung lai a -> b thanh it dung nhat
    await cache.get('c', async () => 'C')
    expect(evicted).toEqual(['B'])
    const reloadB = vi.fn(async () => 'B2')
    expect(await cache.get('b', reloadB)).toBe('B2')
    expect(reloadB).toHaveBeenCalledTimes(1)
    expect(evicted).toEqual(['B', 'A']) // nap lai b lam day tiep a (it dung nhat luc do)
  })
})
