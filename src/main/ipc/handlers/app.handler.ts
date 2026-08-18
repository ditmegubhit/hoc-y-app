import { ipcMain, BrowserWindow } from 'electron'
import { IpcChannels } from '../../../shared/types/ipcChannels'

export function registerAppHandlers(): void {
  // Workaround thuc nghiem: sau khi tao chu de/bai hoc moi va dieu huong sang
  // trang lam viec cua no, o nhap doi ten (dieu khien boi React state binh
  // thuong, khong lien quan react-arborist) thinh thoang chi nhan duoc phim
  // Backspace/Delete, khong nhan ky tu go moi - user xac nhan minimize roi
  // mo lai app la het loi ngay lap tuc. Dieu do cho thay Chromium/Electron
  // bi lech dong bo focus ban phim o tang native sau 1 chuoi thay doi DOM
  // nhanh (tao qua IPC -> dieu huong), khong phai loi logic React.
  // Minimize/restore bang code mo phong dung hanh dong thu cong da xac nhan
  // co hieu qua.
  ipcMain.handle(IpcChannels.app.refreshFocus, (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    win.minimize()
    setTimeout(() => {
      win.restore()
      win.focus()
    }, 60)
  })
}
