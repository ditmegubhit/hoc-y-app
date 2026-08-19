' Mo file DOCX/PPTX bang COM automation va nhay toi dung vi tri (slide/doan text).
' Dung VBScript (cscript) thay vi PowerShell: model COM cua WSH khong bi .NET
' tu dong Release() RCW luc process thoat, giu app mo doc lap sau khi script ket
' thuc - day la ky thuat truyen thong on dinh hon cho automation kieu nay.
'
' QUAN TRONG (da thu nhieu cach khac, cuoi cung chon lai cach nay): may nay
' cai WPS Office, WPS tu dang ky de lam handler cho chinh CLSID goc cua
' Word.Application/PowerPoint.Application - nghia la CreateObject se mo WPS
' thay vi Word/PowerPoint that. Da thu cach vong qua (sua registry tra lai
' CLSID cho Word that, hoac launch thang exe that roi GetObject qua ROT do
' lai) - ca 2 deu lam duoc, nhung mo Word/PowerPoint that lai CHAM (10-20s+
' khoi dong that su), con WPS thi luon mo NHANH va DUNG ngay tu lan bam dau.
' User chon danh doi: chap nhan dung WPS (nhe, nhanh, on dinh qua CreateObject
' dong bo/co bao dam) thay vi co ep bang duoc Word/PowerPoint that.
'
' Args (positional): FilePath, AppType (pptx|docx), UnitIndex, MatchedText (optional)

Dim filePath, appType, unitIndex, matchedText

If WScript.Arguments.Count < 3 Then
  WScript.Echo "{""success"":false,""error"":""Thieu tham so""}"
  WScript.Quit 0
End If

filePath = WScript.Arguments(0)
appType = WScript.Arguments(1)
unitIndex = CInt(WScript.Arguments(2))
If WScript.Arguments.Count > 3 Then
  matchedText = WScript.Arguments(3)
Else
  matchedText = ""
End If

On Error Resume Next

If appType = "pptx" Then
  Dim pptApp, pres, slideCount, idx

  Err.Clear
  Set pptApp = CreateObject("PowerPoint.Application")
  If Err.Number <> 0 Then
    WScript.Echo "{""success"":false,""error"":""" & EscapeJson(Err.Description) & """}"
    WScript.Quit 0
  End If
  pptApp.Visible = -1

  ' File co the da mo san (vd user bam nhieu ket qua lien tiep) - tranh mo
  ' trung/nham presentation.
  Dim pptNeedOpen, ppi
  pptNeedOpen = True
  For ppi = 1 To pptApp.Presentations.Count
    If LCase(pptApp.Presentations(ppi).FullName) = LCase(filePath) Then
      Set pres = pptApp.Presentations(ppi)
      pres.Windows(1).Activate
      pptNeedOpen = False
      Exit For
    End If
  Next
  If pptNeedOpen Then
    Err.Clear
    Set pres = pptApp.Presentations.Open(filePath, False, True, True)
    If Err.Number <> 0 Then
      WScript.Echo "{""success"":false,""error"":""" & EscapeJson(Err.Description) & """}"
      WScript.Quit 0
    End If
  End If

  slideCount = pres.Slides.Count
  idx = unitIndex
  If idx < 1 Then idx = 1
  If idx > slideCount Then idx = slideCount
  pres.Windows(1).View.GotoSlide idx

  ' PowerPoint khong co "Find toan slide" nhu Word - phai tu lap shape, tim
  ' chuoi con trong text cua tung shape, roi Select dung range ky tu tim thay
  ' de to sang (giong hieu ung Selection.Find.Execute cua Word).
  If matchedText <> "" Then
    Dim shp, tr, foundPos
    For Each shp In pres.Slides(idx).Shapes
      If shp.HasTextFrame Then
        If shp.TextFrame.HasText Then
          Set tr = shp.TextFrame.TextRange
          foundPos = InStr(1, tr.Text, matchedText, vbTextCompare)
          If foundPos > 0 Then
            tr.Characters(foundPos, Len(matchedText)).Select
            Exit For
          End If
        End If
      End If
    Next
  End If

  pptApp.Activate

ElseIf appType = "docx" Then
  Dim wordApp, doc

  Err.Clear
  Set wordApp = CreateObject("Word.Application")
  If Err.Number <> 0 Then
    WScript.Echo "{""success"":false,""error"":""" & EscapeJson(Err.Description) & """}"
    WScript.Quit 0
  End If
  wordApp.Visible = True

  ' File co the da mo san (vd user bam nhieu ket qua lien tiep) - tranh mo
  ' trung/nham document.
  Dim wordNeedOpen, wdi
  wordNeedOpen = True
  For wdi = 1 To wordApp.Documents.Count
    If LCase(wordApp.Documents(wdi).FullName) = LCase(filePath) Then
      wordApp.Documents(wdi).Activate
      wordNeedOpen = False
      Exit For
    End If
  Next
  If wordNeedOpen Then
    Err.Clear
    Set doc = wordApp.Documents.Open(filePath)
    If Err.Number <> 0 Then
      WScript.Echo "{""success"":false,""error"":""" & EscapeJson(Err.Description) & """}"
      WScript.Quit 0
    End If
  End If

  wordApp.Activate

  ' Nhay toi dung trang truoc (wdGoToPage=1, wdGoToAbsolute=1 - hang so co
  ' dinh cua Word object model, VBScript late-bound khong biet ten hang so
  ' nen phai dung so). File co the co nhieu vi tri cung khop tu khoa (nhieu
  ' trang) - GoTo truoc giup Find (chay xuoi tu vi tri hien tai) tim dung
  ' lan xuat hien o TRANG duoc yeu cau thay vi luon nhay ve lan dau tien
  ' trong ca file.
  If unitIndex > 0 Then
    Err.Clear
    wordApp.Selection.GoTo 1, 1, unitIndex
  End If

  If matchedText <> "" Then
    With wordApp.Selection.Find
      .ClearFormatting
      .Text = matchedText
      .Execute
    End With
  End If

Else
  WScript.Echo "{""success"":false,""error"":""Loai file khong ho tro: " & appType & """}"
  WScript.Quit 0
End If

WScript.Echo "{""success"":true}"

Function EscapeJson(s)
  EscapeJson = Replace(Replace(s, "\", "\\"), """", "\""")
End Function
