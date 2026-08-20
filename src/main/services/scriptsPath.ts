import { app } from 'electron'
import { join } from 'node:path'

// electron-vite bundle toan bo src/main/**/*.ts vao 1 file out/main/index.js,
// nen __dirname trong moi module main deu tro ve out/main/ (giong pattern
// ocr/resourcePaths.ts).
export function scriptsDir(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'scripts')
    : join(__dirname, '../../resources/scripts')
}
