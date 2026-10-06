import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          // App chinh + entry "chay thu" sinh cau hoi (npm run smoke).
          index: resolve('src/main/index.ts'),
          smoke: resolve('src/main/smoke.ts'),
          anatomySmoke: resolve('src/main/anatomySmoke.ts'),
          // Bo do chinh xac OCR giai phau (npm run ocr:bench).
          ocrBench: resolve('src/main/ocrBench.ts'),
          // Bo do bo nhan dang chu tieng Viet (npm run ocr:bench:rec).
          recognizerBench: resolve('src/main/recognizerBench.ts'),
          // Cong cu ve anh go loi nhan/duong dan/loc rac khu Thuc hanh (npm run practice:debug).
          practiceVisualDebug: resolve('src/main/practiceVisualDebug.ts'),
          // Kiem tra end-to-end khu Thuc hanh GP trong Electron that, cua so an (npm run practice:smoke).
          practiceUiSmoke: resolve('src/main/practiceUiSmoke.ts'),
          practiceRescan: resolve('src/main/practiceRescan.ts')
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@shared': resolve('src/shared')
      }
    },
    plugins: [react()]
  }
})
