import { ipcMain, BrowserWindow } from 'electron'
import { IpcChannels } from '../../../shared/types/ipcChannels'

export function registerAppHandlers(): void {
  // Workaround cho loi da biet cua Electron (github.com/electron/electron
  // issues #20821, #19977, #22923): sau 1 so thao tac lien tiep tren cac
  // input duoc mount/unmount nhanh, input DOM mat kha nang nhan ky tu go
  // moi (chi Backspace/Delete van hoat dong) - focus() tu JS khong sua duoc
  // vi day la loi lech trang thai o tang Chromium/native, khong phai loi
  // logic React.
  //
  // Da thu qua 2 buoc, ca 2 deu KHONG du:
  //  1. webContents.focus() (event.sender.focus()) don le - khong sua duoc.
  //  2. DOM element.blur()/focus() thuan JS trong renderer - khong sua duoc.
  // Da xac nhan CHI CO BrowserWindow.blur()+focus() (that su doi trang
  // thai active/inactive cua ca cua so o tang OS) moi sua duoc loi, nhung
  // ban truoc dung setTimeout 40-60ms giua 2 lenh gay nhap nhay tieu de
  // nhin thay duoc.
  //
  // Thu o day: goi blur() roi focus() NGAY LAP TUC, khong co do tre nao
  // giua 2 lenh (khong setTimeout) - hy vong OS chua kip ve lai frame
  // "inactive" truoc khi focus() duoc goi lai, nen khong nhap nhay, nhung
  // van du de Chromium chay lai chu trinh xu ly blur/focus can thiet de
  // dong bo lai trang thai nhap lieu.
  ipcMain.handle(IpcChannels.app.refreshFocus, (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    win.blur()
    win.focus()
  })
}
