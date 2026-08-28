/** Cursor/Gemini often thinks in English about tools. Show Chinese drawing notes instead. */

const CJK_RE = /[\u3400-\u9fff]/g

export function hasMostlyChinese(text: string): boolean {
  const cjk = text.match(CJK_RE)?.length ?? 0
  return cjk >= 8 || (cjk > 0 && cjk / Math.max(text.length, 1) >= 0.18)
}

export function localizeThinkingZh(text: string): string {
  const trimmed = text.trim()
  if (!trimmed) return ''
  if (hasMostlyChinese(trimmed)) return trimmed

  const lower = trimmed.toLowerCase()
  const lines: string[] = []
  if (/submit_walls|tool|function call|json|markdown/.test(lower)) {
    lines.push('正在按图纸整理结果：先写外墙闭合圈，再写隔墙。')
  }
  if (/outer|facade|envelope|perimeter/.test(lower)) {
    lines.push('外墙要沿建筑立面走一圈，阳台和凹凸拐角都要带上。')
  }
  if (/cabinet|wardrobe|closet|furniture|cabinet/.test(lower) || /衣帽间|橱柜/.test(trimmed)) {
    lines.push('衣帽间、橱柜、家具边缘不是墙。')
  }
  if (/inner|partition|door/.test(lower)) {
    lines.push('隔墙只描连续的深色墙线，门洞处断开，不要把门连死。')
  }
  if (lines.length === 0) {
    lines.push('正在读图：先认外墙和拐角，不要把柜体边缘当成墙。')
  }
  return lines.join('\n')
}
