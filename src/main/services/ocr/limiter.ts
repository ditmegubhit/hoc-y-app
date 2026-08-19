import pLimit from 'p-limit'

// Worker Tesseract la singleton, ban than da xu ly tuan tu ben trong.
// Gioi han o day chu yeu de tranh nhieu trang/anh cung luc don buffer PNG
// cho xu ly gay tran RAM khi user them nhieu file scan lien tiep.
const OCR_CONCURRENCY = 1

export const ocrLimiter = pLimit(OCR_CONCURRENCY)
