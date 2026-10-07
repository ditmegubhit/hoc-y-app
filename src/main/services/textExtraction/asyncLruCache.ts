// Bo nho dem LRU cho ket qua bat dong bo: cung khoa thi chi chay loader 1 lan (ke ca khi nhieu noi hoi
// cung luc), loi khong bi giu lai, vuot suc chua thi day muc it dung nhat va goi onEvict.

export interface AsyncLruOptions<V> {
  onEvict?: (value: V) => void
}

export interface AsyncLruCache<V> {
  get(key: string, loader: () => Promise<V>): Promise<V>
}

export function createAsyncLruCache<V>(maxEntries: number, options: AsyncLruOptions<V> = {}): AsyncLruCache<V> {
  // Map giu thu tu chen: muc dau tien = it dung nhat.
  const entries = new Map<string, Promise<V>>()

  const evictOverflow = (): void => {
    while (entries.size > maxEntries) {
      const oldestKey = entries.keys().next().value as string
      const oldest = entries.get(oldestKey) as Promise<V>
      entries.delete(oldestKey)
      oldest.then((value) => options.onEvict?.(value), () => undefined)
    }
  }

  return {
    get(key, loader) {
      const hit = entries.get(key)
      if (hit) {
        entries.delete(key)
        entries.set(key, hit) // dung lai -> chuyen xuong cuoi (moi dung nhat)
        return hit
      }
      const pending = loader()
      entries.set(key, pending)
      pending.catch(() => {
        if (entries.get(key) === pending) entries.delete(key)
      })
      evictOverflow()
      return pending
    }
  }
}
