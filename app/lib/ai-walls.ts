import {
  aiWallsToTrace,
  aiWallsToTracePartial,
  extractFloorplanFindings,
  formatFindingsZh,
  type AiWallsPayload,
  type PartialAiWalls
} from '@blueprint3d/vision/ai-walls-schema'
import { localizeThinkingZh } from '@blueprint3d/vision/localize-thinking'
import {
  constrainTraceToImage,
  dropCabinetLikeWalls,
  mergeMissedInkWalls
} from '@blueprint3d/vision/constrain-ink'
import { traceWallsFromImage } from '@blueprint3d/vision/trace-walls'
import type { WallTrace } from '@blueprint3d/vision/types'
import { encodePlanImage } from '@/lib/plan-image'

export async function fetchAiWallsConfigured(): Promise<{
  configured: boolean
  model: string | null
}> {
  try {
    const res = await fetch('/api/ai/walls', { method: 'GET' })
    if (!res.ok) {
      return { configured: false, model: null }
    }
    const data = (await res.json()) as { configured?: boolean; model?: string | null }
    return { configured: Boolean(data.configured), model: data.model ?? null }
  } catch {
    return { configured: false, model: null }
  }
}

const AI_WALLS_CLIENT_TIMEOUT_MS = 610_000

export interface AiWallsProgress {
  outer: number
  inner: number
  complete: boolean
}

export interface AiWallsStream {
  thinking?: string
  output?: string
  status?: string
  findings?: string
}

export async function detectWallsWithAi(
  image: HTMLImageElement,
  overallWidthMm?: number,
  onPartial?: (trace: WallTrace, progress: AiWallsProgress) => void,
  onStream?: (stream: AiWallsStream) => void
): Promise<WallTrace> {
  const encoded = encodePlanImage(image)
  const destW = image.naturalWidth || image.width
  const destH = image.naturalHeight || image.height
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), AI_WALLS_CLIENT_TIMEOUT_MS)
  try {
    let res: Response
    try {
      res = await fetch('/api/ai/walls', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream'
        },
        signal: controller.signal,
        body: JSON.stringify({
          imageBase64: encoded.dataUrl,
          mimeType: encoded.mimeType,
          width: encoded.width,
          height: encoded.height,
          overallWidthMm
        })
      })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new Error('AI 认墙超时。请再试一次，或改用本地识别。')
      }
      throw error
    }

    const contentType = res.headers.get('content-type') ?? ''
    if (!contentType.includes('text/event-stream')) {
      const data = (await res.json()) as { payload?: AiWallsPayload; error?: string }
      if (!res.ok || !data.payload) {
        throw new Error(data.error || 'AI 认墙失败')
      }
      return refineAiTrace(aiWallsToTrace(data.payload, destW, destH), image, true)
    }

    let finalPayload: AiWallsPayload | null = null
    let lastTrace: WallTrace | null = null
    let lastError: string | null = null
    for await (const event of readSse(res)) {
      if (event.event === 'partial' || event.event === 'done') {
        const payload = (event.data.payload ?? event.data) as PartialAiWalls
        if (!payload?.outerLoop) continue
        let trace: WallTrace | null = null
        try {
          trace = payload.complete
            ? aiWallsToTrace(payload, destW, destH)
            : aiWallsToTracePartial(payload, destW, destH, payload.closeLoop)
        } catch (error) {
          console.warn('AI walls parse skipped:', error)
        }
        if (trace && (payload.complete || payload.outerLoop.length >= 4)) {
          const refined = refineAiTrace(trace, image, false)
          lastTrace = refined
          onPartial?.(refined, {
            outer: payload.outerLoop.length,
            inner: payload.innerWalls?.length ?? 0,
            complete: Boolean(payload.complete)
          })
        }
        if (event.event === 'done' || payload.complete) {
          finalPayload = payload
        }
      } else if (event.event === 'thinking') {
        onStream?.({ thinking: localizeThinkingZh(String(event.data.text ?? '')) })
      } else if (event.event === 'output') {
        const output = String(event.data.text ?? '')
        const findings = extractFloorplanFindings(output)
        onStream?.({
          output,
          findings: findings ? formatFindingsZh(findings) : undefined
        })
      } else if (event.event === 'status') {
        onStream?.({ status: String(event.data.message ?? '') })
      } else if (event.event === 'error') {
        lastError = String(event.data.error || 'AI 认墙失败')
      }
    }
    if (finalPayload) {
      try {
        return refineAiTrace(aiWallsToTrace(finalPayload, destW, destH), image, true)
      } catch (error) {
        console.warn('AI walls refine failed, using raw result:', error)
        return lastTrace ?? aiWallsToTrace(finalPayload, destW, destH)
      }
    }
    if (lastTrace) {
      return lastTrace
    }
    throw new Error(lastError || 'AI 认墙失败')
  } finally {
    window.clearTimeout(timer)
  }
}

function refineAiTrace(trace: WallTrace, image: HTMLImageElement, mergeMissed: boolean): WallTrace {
  let used = dropCabinetLikeWalls(trace)
  try {
    const grounded = constrainTraceToImage(used, image)
    const outerOk = (grounded.outerCount ?? 0) >= Math.min(4, used.outerCount ?? 0)
    const ratio = grounded.segments.length / Math.max(1, used.segments.length)
    if (outerOk && ratio >= 0.35) {
      used = dropCabinetLikeWalls(grounded)
    }
  } catch (error) {
    console.warn('Ink constrain skipped:', error)
  }
  if (!mergeMissed) return used
  try {
    return dropCabinetLikeWalls(mergeMissedInkWalls(used, traceWallsFromImage(image)))
  } catch (error) {
    console.warn('Missed-ink merge skipped:', error)
    return used
  }
}

async function* readSse(res: Response): AsyncGenerator<{ event: string; data: Record<string, unknown> }> {
  if (!res.body) {
    throw new Error('认墙流为空')
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const parts = buf.split('\n\n')
    buf = parts.pop() ?? ''
    for (const part of parts) {
      let event = 'message'
      const dataLines: string[] = []
      for (const line of part.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim()
        if (line.startsWith('data:')) dataLines.push(line.slice(5).trim())
      }
      if (dataLines.length === 0) continue
      yield { event, data: JSON.parse(dataLines.join('\n')) as Record<string, unknown> }
    }
  }
}
