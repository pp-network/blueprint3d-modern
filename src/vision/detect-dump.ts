import { critiqueFromOutput, type AiWallsPayload } from './ai-walls-schema'
import { collectFloorplanFindings, collectFloorplanPlacements } from './extract-thinking-findings'
import { judgeAiWallsPayload } from './judge-walls'

export interface DetectDumpInput {
  savedAt?: string
  provider?: string
  model?: string
  overallWidthMm?: number
  imageWidth?: number
  imageHeight?: number
  mimeType?: string
  thinking?: string
  rawOutput?: string
  payload?: AiWallsPayload | null
  error?: string
}

export function detectDumpRoot(cwd: string): string {
  const base = cwd.replace(/[/\\]app$/, '')
  return `${base}/tmp/ai-detect`
}

export function detectDumpFilename(at = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}${pad(at.getMinutes())}${pad(at.getSeconds())}-walls.json`
}

export function buildDetectDump(input: DetectDumpInput): Record<string, unknown> {
  const rawOutput = input.rawOutput ?? ''
  const thinking = input.thinking ?? ''
  const payloadJson = input.payload ? JSON.stringify(input.payload) : rawOutput
  const placements = collectFloorplanPlacements({ payloadJson, output: rawOutput, thinking })
  const findings = collectFloorplanFindings({ payloadJson, output: rawOutput, thinking })
  const critique = critiqueFromOutput(payloadJson || rawOutput, placements)
  const judge = input.payload
    ? judgeAiWallsPayload(input.payload, {
        imageWidth: input.imageWidth,
        imageHeight: input.imageHeight,
        overallWidthMm: input.overallWidthMm,
        placements,
        rawOutput
      })
    : null
  return {
    savedAt: input.savedAt ?? new Date().toISOString(),
    provider: input.provider ?? null,
    model: input.model ?? null,
    overallWidthMm: input.overallWidthMm ?? findings?.overallWidthMm ?? null,
    image: {
      width: input.imageWidth ?? input.payload?.imageWidth ?? null,
      height: input.imageHeight ?? input.payload?.imageHeight ?? null,
      mimeType: input.mimeType ?? null
    },
    error: input.error ?? null,
    critique,
    judge,
    findings,
    placements,
    payload: input.payload ?? null,
    thinking,
    rawOutput
  }
}
