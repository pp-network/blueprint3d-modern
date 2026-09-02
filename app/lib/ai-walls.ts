import {
  aiWallsToTrace,
  aiWallsToTracePartial,
  critiqueFromOutput,
  formatFindingsZh,
  type AiWallsPayload,
  type FloorplanPlacements,
  type PartialAiWalls
} from '@blueprint3d/vision/ai-walls-schema'
import { collectFloorplanFindings, collectFloorplanPlacements } from '@blueprint3d/vision/extract-thinking-findings'
import { localizeThinkingZh } from '@blueprint3d/vision/localize-thinking'
import {
  complementThickInkFromImage,
  constrainTraceToImage,
  dropCabinetLikeWalls,
  dropThinDimensionWallsFromImage,
  shouldKeepInkConstrained,
  snapTraceToImage
} from '@blueprint3d/vision/constrain-ink'
import { finishWallTrace } from '@blueprint3d/vision/finish-trace'
import type { WallTrace } from '@blueprint3d/vision/types'
import { encodePlanImage } from '@/lib/plan-image'

export async function fetchAiWallsConfigured(): Promise<{
  configured: boolean
  model: string | null
}> {
  try {
    const res = await fetch('/api/ai/config', { method: 'GET' })
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
  placements?: FloorplanPlacements | null
}

export async function detectWallsWithAi(
  image: HTMLImageElement,
  overallWidthMm?: number,
  onPartial?: (trace: WallTrace, progress: AiWallsProgress) => void,
  onStream?: (stream: AiWallsStream) => void,
  signal?: AbortSignal
): Promise<{ trace: WallTrace; placements: FloorplanPlacements | null; dumpPath?: string }> {
  const encoded = encodePlanImage(image)
  const destW = image.naturalWidth || image.width
  const destH = image.naturalHeight || image.height
  const controller = new AbortController()
  const onAbort = () => controller.abort()
  if (signal?.aborted) {
    controller.abort()
  } else {
    signal?.addEventListener('abort', onAbort, { once: true })
  }
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
      return {
        trace: refineAiTrace(aiWallsToTrace(data.payload, destW, destH), image),
        placements: collectFloorplanPlacements({ payloadJson: JSON.stringify(data.payload) })
      }
    }

    let finalPayload: AiWallsPayload | null = null
    let lastPreview: WallTrace | null = null
    let lastTrace: WallTrace | null = null
    let lastError: string | null = null
    let lastPlacements: FloorplanPlacements | null = null
    let lastThinking = ''
    let lastOutput = ''
    let dumpPath: string | undefined
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
          const refined = payload.complete
            ? lastPreview
              ? finishWallTrace(lastPreview, refineAiTrace(trace, image, { complement: false }))
              : refineAiTrace(trace, image)
            : refineAiTrace(trace, image)
          if (!payload.complete) lastPreview = refined
          lastTrace = refined
          onPartial?.(refined, {
            outer: payload.outerLoop.length,
            inner: payload.innerWalls?.length ?? 0,
            complete: Boolean(payload.complete)
          })
        }
        if (event.event === 'done' || payload.complete) {
          finalPayload = payload
          lastPlacements =
            collectFloorplanPlacements({
              payloadJson: JSON.stringify(payload),
              output: lastOutput,
              thinking: lastThinking
            }) ?? lastPlacements
          if (typeof event.data.dumpPath === 'string') {
            dumpPath = event.data.dumpPath
          }
        }
      } else if (event.event === 'thinking') {
        lastThinking = String(event.data.text ?? '')
        const placements = collectFloorplanPlacements({
          output: lastOutput,
          thinking: lastThinking
        })
        if (placements) lastPlacements = placements
        const findings = collectFloorplanFindings({ output: lastOutput, thinking: lastThinking })
        const notes = critiqueFromOutput(lastOutput, placements)
        onStream?.({
          thinking: localizeThinkingZh(lastThinking),
          findings: findings ? formatFindingsZh(findings, notes) : undefined,
          placements
        })
      } else if (event.event === 'output') {
        lastOutput = String(event.data.text ?? '')
        const placements = collectFloorplanPlacements({
          output: lastOutput,
          thinking: lastThinking
        })
        if (placements) lastPlacements = placements
        const findings = collectFloorplanFindings({ output: lastOutput, thinking: lastThinking })
        const notes = critiqueFromOutput(lastOutput, placements)
        onStream?.({
          output: lastOutput,
          findings: findings ? formatFindingsZh(findings, notes) : undefined,
          placements
        })
      } else if (event.event === 'status') {
        onStream?.({ status: String(event.data.message ?? '') })
      } else if (event.event === 'error') {
        lastError = String(event.data.error || 'AI 认墙失败')
      }
    }
    const placements =
      lastPlacements ??
      collectFloorplanPlacements({
        payloadJson: JSON.stringify(finalPayload ?? {}),
        output: lastOutput,
        thinking: lastThinking
      })
    if (lastTrace) {
      return { trace: lastTrace, placements, dumpPath }
    }
    if (finalPayload) {
      try {
        const finished = refineAiTrace(aiWallsToTrace(finalPayload, destW, destH), image)
        return {
          trace: finishWallTrace(lastPreview, finished),
          placements,
          dumpPath
        }
      } catch (error) {
        console.warn('AI walls refine failed, using raw result:', error)
        return {
          trace: lastPreview ?? aiWallsToTrace(finalPayload, destW, destH),
          placements,
          dumpPath
        }
      }
    }
    throw new Error(lastError || 'AI 认墙失败')
  } finally {
    window.clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}

function refineAiTrace(
  trace: WallTrace,
  image: HTMLImageElement,
  options?: { complement?: boolean }
): WallTrace {
  let used = dropCabinetLikeWalls(trace)
  try {
    used = snapTraceToImage(used, image)
  } catch (error) {
    console.warn('Ink snap skipped:', error)
  }
  try {
    const grounded = constrainTraceToImage(used, image)
    if (shouldKeepInkConstrained(used, grounded)) {
      used = dropCabinetLikeWalls(grounded)
    }
  } catch (error) {
    console.warn('Ink constrain skipped:', error)
  }
  if (options?.complement !== false) {
    try {
      used = complementThickInkFromImage(used, image)
    } catch (error) {
      console.warn('Local ink complement skipped:', error)
    }
  }
  try {
    used = dropThinDimensionWallsFromImage(used, image)
  } catch (error) {
    console.warn('Thin-dimension drop skipped:', error)
  }
  return used
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
