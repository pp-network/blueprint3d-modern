import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { judgeAiWallsPayload, formatJudgeZh } from './judge-walls'
import type { AiWallsPayload } from './ai-walls-schema'
import type { FloorplanPlacements } from './ai-walls-schema'
import { collectFloorplanPlacements } from './extract-thinking-findings'

async function main(): Promise<number> {
  const file = process.argv[2] ?? path.join(process.cwd(), 'tmp/ai-detect/latest.json')
  const dump = JSON.parse(await readFile(file, 'utf8')) as {
    image?: { width?: number; height?: number }
    overallWidthMm?: number
    payload?: AiWallsPayload | null
    rawOutput?: string
    placements?: FloorplanPlacements | null
    thinking?: string
    error?: string | null
    model?: string
    savedAt?: string
  }

  if (dump.error) {
    console.error(`dump error: ${dump.error}`)
    return 1
  }
  if (!dump.payload) {
    console.error('dump has no payload')
    return 1
  }

  const result = judgeAiWallsPayload(dump.payload, {
    imageWidth: dump.image?.width,
    imageHeight: dump.image?.height,
    overallWidthMm: dump.overallWidthMm,
    placements:
      dump.placements ??
      collectFloorplanPlacements({ output: dump.rawOutput, thinking: dump.thinking }),
    rawOutput: dump.rawOutput
  })

  console.log(`file ${file}`)
  console.log(`model ${dump.model ?? '?'}  saved ${dump.savedAt ?? '?'}`)
  console.log(formatJudgeZh(result))
  return result.ok ? 0 : 2
}

main().then((code) => process.exit(code))
