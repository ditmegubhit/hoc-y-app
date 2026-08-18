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
  // Ban dau dung minimize()/restore() (giong het thao tac thu cong user xac
  // nhan hieu qua) nhung gay nhap nhay kho chiu (hieu ung thu nho/phong to
  // cua Windows). Doi sang blur()/focus() - chi doi trang thai active/
  // inactive cua cua so (khong doi trang thai show/hide), khong co hieu ung
  // hoat hoa nao, nhe hon nhieu nhung van la 1 chu ky "mat roi lay lai
  // focus" o tang native ma minimize/restore cung tao ra - hy vong du de
  // Chromium dong bo lai focus ban phim.
  ipcMain.handle(IpcChannels.app.refreshFocus, (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    win.blur()
    setTimeout(() => {
      win.focus()
    }, 40)
  })
}
