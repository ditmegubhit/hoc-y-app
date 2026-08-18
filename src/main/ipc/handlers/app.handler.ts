import { ipcMain } from 'electron'
import { IpcChannels } from '../../../shared/types/ipcChannels'

export function registerAppHandlers(): void {
  // Workaround cho loi da biet cua Electron (github.com/electron/electron
  // issues #20821, #19977, #22923): sau 1 so thao tac lien tiep tren cac
  // input duoc mount/unmount nhanh, input DOM mat kha nang nhan ky tu go
  // moi (chi Backspace/Delete van hoat dong) - focus() tu JS khong sua duoc
  // vi day la loi lech trang thai o tang Chromium/native, khong phai loi
  // logic React. Cong dong chi ghi nhan BrowserWindow.blur()+focus() la
  // cach sua (nhung gay nhap nhay active/inactive tieu de cua so).
  //
  // Dung webContents.focus() thay vi BrowserWindow.blur()/focus() - day la
  // API rieng, chi tac dong "view nao ben trong cua so dang nhan input",
  // KHONG dung den trang thai active/inactive cua ca cua so o tang OS nen
  // khong gay hieu ung nhin thay duoc. Chua chac chan hieu qua tuong duong
  // BrowserWindow.blur()+focus() - can user xac nhan.
  ipcMain.handle(IpcChannels.app.refreshFocus, (event) => {
    event.sender.focus()
  })
}
