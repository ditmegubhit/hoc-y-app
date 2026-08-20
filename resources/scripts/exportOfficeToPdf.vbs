' Chuyen doi DOCX/PPTX sang PDF bang chinh Word/PowerPoint (COM automation),
' de panel xem file dung lai duoc toan bo ha tang render PDF da co san
' (pdfjs-dist + @napi-rs/canvas, xem attachmentView.service.ts) thay vi
' nhung ca cua so ung dung that vao panel - da bo huong nhung vi qua bat on
' dinh (Not Responding, mat input, "anh dinh" khi dong...), xem ghi chu du
' an. Cach nay CHI XUAT RA FILE, khong hien giao dien de user tuong tac -
' don gian va tin cay hon nhieu.
'
' Word: ho tro Visible=False that su (chay hoan toan an). PowerPoint KHONG
' ho tro dat Visible=False qua automation (loi tu COM neu thu) - phai dung
' tham so WithWindow:=False khi mo tung presentation de tranh hien cua so,
' con Application van phai de Visible=True.
'
' Args (positional): FilePath, AppType (docx|pptx), OutputPdfPath

Dim filePath, appType, outputPath

If WScript.Arguments.Count < 3 Then
  WScript.Echo "{""success"":false,""error"":""Thieu tham so""}"
  WScript.Quit 0
End If

filePath = WScript.Arguments(0)
appType = WScript.Arguments(1)
outputPath = WScript.Arguments(2)

On Error Resume Next

If appType = "docx" Then
  Dim wordApp, doc

  Set wordApp = CreateObject("Word.Application")
  If Err.Number <> 0 Then
    WScript.Echo "{""success"":false,""error"":""" & EscapeJson(Err.Description) & """}"
    WScript.Quit 0
  End If
  wordApp.Visible = False
  wordApp.DisplayAlerts = 0 ' wdAlertsNone - tranh hop thoai chan tu dong hoa

  Err.Clear
  Set doc = wordApp.Documents.Open(filePath, False, True) ' ConfirmConversions=False, ReadOnly=True
  If Err.Number <> 0 Then
    WScript.Echo "{""success"":false,""error"":""" & EscapeJson(Err.Description) & """}"
    wordApp.Quit
    WScript.Quit 0
  End If

  ' File Protected View (vd tai tu Internet) can thoat truoc khi export.
  If wordApp.ProtectedViewWindows.Count > 0 Then
    Err.Clear
    wordApp.ProtectedViewWindows(1).Edit
    Set doc = wordApp.ActiveDocument
  End If

  Err.Clear
  doc.ExportAsFixedFormat outputPath, 17 ' wdExportFormatPDF
  Dim wordExportErrNum, wordExportErrDesc
  wordExportErrNum = Err.Number
  wordExportErrDesc = Err.Description

  doc.Close False
  wordApp.Quit

  If wordExportErrNum <> 0 Then
    WScript.Echo "{""success"":false,""error"":""" & EscapeJson(wordExportErrDesc) & """}"
  Else
    WScript.Echo "{""success"":true}"
  End If

ElseIf appType = "pptx" Then
  Dim pptApp, pres

  Set pptApp = CreateObject("PowerPoint.Application")
  If Err.Number <> 0 Then
    WScript.Echo "{""success"":false,""error"":""" & EscapeJson(Err.Description) & """}"
    WScript.Quit 0
  End If
  pptApp.Visible = -1 ' msoTrue - PowerPoint khong cho dat False qua automation

  Err.Clear
  Set pres = pptApp.Presentations.Open(filePath, True, False, False) ' ReadOnly=True, Untitled=False, WithWindow=False
  If Err.Number <> 0 Then
    WScript.Echo "{""success"":false,""error"":""" & EscapeJson(Err.Description) & """}"
    pptApp.Quit
    WScript.Quit 0
  End If

  If pptApp.ProtectedViewWindows.Count > 0 Then
    Err.Clear
    pptApp.ProtectedViewWindows(1).Edit
  End If

  ' Luu y: pres.ExportAsFixedFormat gay loi 13 "Type mismatch" qua VBScript
  ' late-binding tren may test (chua ro nguyen nhan chinh xac, co the do
  ' phien ban PowerPoint) - da xac nhan pres.SaveAs voi dinh dang
  ' ppSaveAsPDF (32) hoat dong on dinh, dung cach nay thay the.
  Err.Clear
  pres.SaveAs outputPath, 32 ' ppSaveAsPDF
  Dim pptExportErrNum, pptExportErrDesc
  pptExportErrNum = Err.Number
  pptExportErrDesc = Err.Description

  pres.Close
  pptApp.Quit

  If pptExportErrNum <> 0 Then
    WScript.Echo "{""success"":false,""error"":""" & EscapeJson(pptExportErrDesc) & """}"
  Else
    WScript.Echo "{""success"":true}"
  End If

Else
  WScript.Echo "{""success"":false,""error"":""Loai file khong ho tro: " & appType & """}"
End If

Function EscapeJson(s)
  EscapeJson = Replace(Replace(s, "\", "\\"), """", "\""")
End Function
