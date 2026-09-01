// Trich cac object DA HOAN CHINH tu mot chuoi JSON con dang duoc stream ve
// (Ollama /api/chat stream=true tra noi dung JSON dan tung it mot). Dung de bao
// tien do "da soan X cau" trong luc model con dang viet.
//
// Thuan tuy -> test bang vitest.

/**
 * Doc mang `"<arrayKey>": [ {...}, {...}, ...` trong `partial` va tra ve cac
 * phan tu object da dong ngoac day du (JSON.parse thanh cong). Object cuoi cung
 * con dang viet do -> bo qua, lan sau co them chunk se bat duoc.
 */
export function extractArrayObjects(partial: string, arrayKey = 'questions'): unknown[] {
  const keyIdx = partial.indexOf(`"${arrayKey}"`)
  if (keyIdx === -1) return []
  const bracketIdx = partial.indexOf('[', keyIdx)
  if (bracketIdx === -1) return []

  const results: unknown[] = []
  let depth = 0
  let inString = false
  let escape = false
  let objStart = -1

  for (let i = bracketIdx + 1; i < partial.length; i++) {
    const ch = partial[i]

    if (inString) {
      if (escape) escape = false
      else if (ch === '\\') escape = true
      else if (ch === '"') inString = false
      continue
    }

    if (ch === '"') {
      inString = true
    } else if (ch === '{') {
      if (depth === 0) objStart = i
      depth += 1
    } else if (ch === '}') {
      depth -= 1
      if (depth === 0 && objStart !== -1) {
        try {
          results.push(JSON.parse(partial.slice(objStart, i + 1)))
        } catch {
          // object hong (hiem) - bo qua
        }
        objStart = -1
      }
    } else if (ch === ']' && depth === 0) {
      break
    }
  }

  return results
}

/** So cau da soan xong trong chuoi JSON con. */
export function countCompleteQuestions(partial: string, arrayKey = 'questions'): number {
  return extractArrayObjects(partial, arrayKey).length
}
