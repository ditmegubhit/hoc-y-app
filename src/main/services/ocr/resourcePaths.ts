import { app } from 'electron'
import { join } from 'node:path'

// electron-vite bundle toan bo src/main/**/*.ts vao 1 file out/main/index.js,
// nen __dirname trong moi module main deu tro ve out/main/ (giong cach
// mainWindow.ts dung join(__dirname, '../renderer/index.html')).
export function tessdataDir(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'tessdata')
    : join(__dirname, '../../resources/tessdata')
}
