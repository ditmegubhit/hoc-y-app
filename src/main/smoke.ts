/**
 * Chay thu ("smoke test") kha nang sinh cau hoi - KHONG mo cua so app.
 *
 *   npm run smoke -- --provider=claude --n=10
 *   npm run smoke -- --provider=ollama --n=10 --no-save
 *
 * Sinh N cau tu bai "Nơi test app", do thoi gian tung giai doan, kiem tra chat
 * luong so bo, roi luu vao chinh bai do voi co is_test=1 (hien MAU DO trong
 * ngan hang cau hoi). Dung de biet moi lan cai tien engine thi chat luong / toc
 * do / do on dinh thay doi ra sao.
 */
import { app } from 'electron'
import { join } from 'node:path'
import { getDb } from './db'

// Chay `electron out/main/smoke.js` truc tiep -> app.name = "hoc-y-app" -> userData
// tro sang thu muc RONG khac. Ep ve dung thu muc cua app that (theo productName).
app.setName('Thach may hoc Y gioi hon tao')
app.setPath('userData', join(app.getPath('appData'), 'Thach may hoc Y gioi hon tao'))
import { getLesson } from './db/repositories/lessons.repo'
import { saveDraftQuestionsFromLesson } from './db/repositories/questionBank.repo'
import { generateQuizFromLesson } from './services/claudeCli/generateQuizFromLesson'
import type { AiProvider } from '../shared/types/ai'
import type { DraftQuestion } from '../shared/types/question'
import type { QuizGenProgress } from '../shared/types/claudeCli'

const TEST_LESSON_TITLE = 'Nơi test app'

function arg(name: string, fallback?: string): string | undefined {
  const hit = process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`))
  if (!hit) return fallback
  const eq = hit.indexOf('=')
  return eq === -1 ? 'true' : hit.slice(eq + 1)
}

function findTestLesson(): { id: string; topicId: string } | null {
  const row = getDb()
    .prepare('SELECT id, topic_id FROM lessons WHERE title = ? LIMIT 1')
    .get(TEST_LESSON_TITLE) as { id: string; topic_id: string | null } | undefined
  if (!row || !row.topic_id) return null
  return { id: row.id, topicId: row.topic_id }
}

function existingQuestionTexts(lessonId: string): string[] {
  return (
    getDb()
      .prepare('SELECT question_text FROM question_bank WHERE lesson_id = ?')
      .all(lessonId) as { question_text: string }[]
  ).map((r) => r.question_text)
}

function ms(n: number): string {
  return n < 1000 ? `${n} ms` : `${(n / 1000).toFixed(1)} s`
}

// Kiem tra chat luong so bo tren tap cau tra ve.
function qualityReport(questions: DraftQuestion[], existing: string[]): string[] {
  const issues: string[] = []
  const norm = (s: string): string => s.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim()
  const existingKeys = new Set(existing.map(norm))
  const seen = new Set<string>()

  questions.forEach((q, i) => {
    const tag = `  [${i + 1}]`
    const nOpts = q.options.length
    const nCorrect = q.options.filter((o) => o.isCorrect).length
    if (nOpts !== 4) issues.push(`${tag} có ${nOpts} lựa chọn (cần 4)`)
    if (nCorrect !== 1) issues.push(`${tag} có ${nCorrect} đáp án đúng (cần 1)`)
    if ((q.questionText ?? '').trim().length < 12) issues.push(`${tag} câu hỏi quá ngắn`)
    if (!q.explanation || !q.explanation.trim()) issues.push(`${tag} thiếu giải thích`)
    const optKeys = q.options.map((o) => norm(o.text))
    if (new Set(optKeys).size !== optKeys.length) issues.push(`${tag} có lựa chọn trùng nhau`)
    const key = norm(q.questionText)
    if (existingKeys.has(key)) issues.push(`${tag} TRÙNG (chính xác) với câu đã có`)
    if (seen.has(key)) issues.push(`${tag} TRÙNG (chính xác) với câu khác trong lô`)
    seen.add(key)
  })
  return issues
}

async function main(): Promise<void> {
  const provider = (arg('provider', 'claude') as AiProvider) ?? 'claude'
  const n = Number(arg('n', '10')) || 10
  const save = arg('no-save') !== 'true'
  const refineWithClaude = arg('refine') === 'claude' ? true : undefined

  console.log('\n=== SMOKE: sinh câu hỏi ===')
  console.log(`bài       : "${TEST_LESSON_TITLE}"`)
  console.log(`engine    : ${provider}${refineWithClaude ? ' (+ Claude rà soát)' : ''}`)
  console.log(`số câu    : ${n}`)
  console.log(`lưu vào DB: ${save ? 'có (đánh dấu CÂU TEST, màu đỏ)' : 'không'}\n`)

  getDb()
  const lesson = findTestLesson()
  if (!lesson) {
    console.error(`✗ Không tìm thấy bài "${TEST_LESSON_TITLE}" (hoặc bài không thuộc topic nào).`)
    app.exit(2)
    return
  }
  if (!getLesson(lesson.id)) {
    console.error('✗ Bài không đọc được.')
    app.exit(2)
    return
  }

  const existing = existingQuestionTexts(lesson.id)
  console.log(`bài đang có ${existing.length} câu.\n`)

  if (arg('dry') === 'true') {
    console.log('(--dry: chỉ kiểm tra kết nối DB + bài học, không gọi AI.)')
    app.exit(0)
    return
  }

  const t0 = Date.now()
  const phaseAt: Record<string, number> = {}
  let lastRefine = ''

  const res = await generateQuizFromLesson({
    lessonId: lesson.id,
    numQuestions: n,
    provider,
    refineProvider: refineWithClaude ? 'claude' : undefined,
    onProgress: (p: QuizGenProgress) => {
      if (phaseAt[p.phase] === undefined) phaseAt[p.phase] = Date.now() - t0
      if (p.phase === 'refining' && p.refineTotal) {
        const line = `  rà soát: lô ${p.refineDone}/${p.refineTotal}`
        if (line !== lastRefine) {
          lastRefine = line
          console.log(`${line}  (+${ms(Date.now() - t0)})`)
        }
      } else {
        console.log(
          `  ${p.phase}: vòng ${p.round}, đã gom ${p.kept}/${p.target}${
            p.streaming ? `, đang viết ${p.streaming}` : ''
          }  (+${ms(Date.now() - t0)})`
        )
      }
    }
  })

  const elapsed = Date.now() - t0

  console.log(`\n--- KẾT QUẢ (${ms(elapsed)}) ---`)
  for (const [phase, at] of Object.entries(phaseAt)) {
    console.log(`  bắt đầu "${phase}" ở +${ms(at)}`)
  }

  if (!res.ok || !res.questions || res.questions.length === 0) {
    console.error(`\n✗ THẤT BẠI: ${res.errorMessage ?? 'không rõ'}`)
    console.error(`  (đã loại ${res.duplicatesRemoved ?? 0} câu hỏng/trùng)`)
    app.exit(1)
    return
  }

  const qs = res.questions
  console.log(`\n✓ sinh được ${qs.length}/${n} câu`)
  if (res.shortfall) console.log(`  THIẾU ${res.shortfall} câu so với yêu cầu`)
  if (res.truncated) console.log('  (tài liệu dài -> đã cắt cửa sổ theo vòng)')
  console.log(`  đã loại ${res.duplicatesRemoved ?? 0} câu hỏng/trùng trong lúc sinh`)
  console.log(`  tốc độ: ${(elapsed / 1000 / qs.length).toFixed(1)} s/câu`)

  const issues = qualityReport(qs, existing)
  if (issues.length === 0) {
    console.log('\n  chất lượng sơ bộ: KHÔNG thấy vấn đề (4 lựa chọn / 1 đáp án / có giải thích / không trùng)')
  } else {
    console.log(`\n  chất lượng sơ bộ: ${issues.length} cảnh báo`)
    issues.forEach((i) => console.log(`   ! ${i}`))
  }

  console.log('\n--- CÁC CÂU ---')
  qs.forEach((q, i) => {
    console.log(`\n[${i + 1}] ${q.questionText}`)
    q.options.forEach((o, j) =>
      console.log(`    ${String.fromCharCode(65 + j)}. ${o.text}${o.isCorrect ? '  ✓' : ''}`)
    )
    if (q.explanation) console.log(`    → ${q.explanation}`)
  })

  if (save) {
    const saved = saveDraftQuestionsFromLesson({
      lessonId: lesson.id,
      topicId: lesson.topicId,
      questions: qs,
      generator: provider,
      isTest: true
    })
    console.log(`\n✓ đã lưu ${saved.length} câu vào "${TEST_LESSON_TITLE}" (đánh dấu CÂU TEST).`)
  }

  app.exit(0)
}

app.whenReady().then(main).catch((err) => {
  console.error('smoke crash:', err)
  app.exit(3)
})
