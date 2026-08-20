// Toa do/kich thuoc trong tat ca cac type duoi day deu tinh theo khung
// tham chieu co dinh BASE_CONTENT_WIDTH (760, xem PdfImageViewer.tsx) -
// khong phu thuoc zoom hien tai, de doi zoom van hien dung vi tri.

export type HighlightColor = 'red' | 'yellow' | 'blue' | 'white' | 'none'

export interface Point {
  x: number
  y: number
}

// Highlight la 1 hinh CHU NHAT (keo de chon vung, giong to sang van ban) -
// khac Pencil la net ve tu do. Tay xoa tren highlight "cat" hinh chu nhat
// thanh cac hinh chu nhat nho hon (xem AnnotationLayer.tsx subtractRect),
// khong bien thanh da giac tuy y.
export interface HighlightData {
  color: HighlightColor
  x: number
  y: number
  width: number
  height: number
}

export interface StrokeData {
  color: HighlightColor
  strokeWidth: number
  points: Point[]
}

export interface NoteData {
  x: number
  y: number
  width: number
  height: number
  text: string
  color: HighlightColor
  // Mau CHU rieng, tach khoi mau NEN (color o tren). 'none'/thieu (du lieu
  // cu truoc khi co truong nay) = mau muc mac dinh co dinh, xem
  // AnnotationLayer.tsx noteTextColorHex().
  textColor?: HighlightColor
  // Co chu (px, o zoom=1). Thieu (du lieu cu truoc khi co truong nay) =
  // mac dinh co dinh, xem AnnotationLayer.tsx noteFontSize(). Chi thay doi
  // khi keo 4 tay cam goc (che do "Chon"/nhan dup) - tay cam don o goc
  // duoi-phai (che do binh thuong) chi doi kich thuoc hop, khong doi co chu.
  fontSize?: number
}

export type AnnotationType = 'highlight' | 'pencil' | 'note'
export type AnnotationData = HighlightData | StrokeData | NoteData

export interface Annotation {
  id: string
  attachmentId: string
  pageNumber: number
  type: AnnotationType
  data: AnnotationData
  createdAt: string
}

export type NewAnnotation = Pick<Annotation, 'pageNumber' | 'type' | 'data'> & { id: string }
