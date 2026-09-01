import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

// Test cho phan logic thuan (khong dung Electron/DOM): loc cau, so trung, parse
// JSON streaming, cham diem. Cac module co `import { app } from 'electron'` khong
// nam trong dien test - giu test nhanh, chay bang `npm test`.
export default defineConfig({
  resolve: {
    alias: {
      '@renderer': resolve('src/renderer/src'),
      '@shared': resolve('src/shared')
    }
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Cac file keo theo Electron -> loai khoi graph khi go test.
    exclude: ['node_modules', 'out', 'dist']
  }
})
