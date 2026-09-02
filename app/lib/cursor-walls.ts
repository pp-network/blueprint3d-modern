import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Agent, type Run } from '@cursor/sdk'
import { AI_WALLS_SYSTEM_PROMPT, AI_WALLS_USER_PROMPT } from '@blueprint3d/vision/ai-walls-prompt'
import { localizeThinkingZh } from '@blueprint3d/vision/localize-thinking'
import {
  extractJsonObject,
  extractPartialAiWalls,
  parseAiWallsPayload,
  type PartialAiWalls
} from '@blueprint3d/vision/ai-walls-schema'

const CURSOR_WALLS_TIMEOUT_MS = 600_000
const SILENCE_FALLBACK_MS = 75_000
const SEND_TIMEOUT_MS = 90_000
const FALLBACK_MODEL = 'gemini-3-flash'

export async function detectWallsJsonWithCursor(opts: {
  apiKey: string
  model: string
  imageBase64: string
  mimeType: string
  overallWidthMm?: number
  imageWidth?: number
  imageHeight?: number
  onPartial?: (partial: PartialAiWalls) => void
  onThinking?: (text: string) => void
  onOutput?: (text: string) => void
  onStatus?: (message: string) => void
}): Promise<string> {
  try {
    return await runCursorWalls(opts, opts.model, SILENCE_FALLBACK_MS)
  } catch (error) {
    const silent =
      error instanceof Error &&
      (error.message.includes('长时间没有输出') || error.message.includes('没有开始读图'))
    if (!silent || opts.model === FALLBACK_MODEL) {
      throw error
    }
    opts.onStatus?.(`${opts.model} 长时间没有吐字，改用 ${FALLBACK_MODEL}`)
    return await runCursorWalls({ ...opts, model: FALLBACK_MODEL }, FALLBACK_MODEL, 180_000)
  }
}

async function runCursorWalls(
  opts: {
    apiKey: string
    imageBase64: string
    mimeType: string
    overallWidthMm?: number
    imageWidth?: number
    imageHeight?: number
    onPartial?: (partial: PartialAiWalls) => void
    onThinking?: (text: string) => void
    onOutput?: (text: string) => void
    onStatus?: (message: string) => void
  },
  model: string,
  silenceMs: number
): Promise<string> {
  const cwd = await mkdtemp(join(tmpdir(), 'b3d-ai-walls-'))
  const prompt = [
    AI_WALLS_SYSTEM_PROMPT,
    AI_WALLS_USER_PROMPT(opts.overallWidthMm, { width: opts.imageWidth, height: opts.imageHeight }),
    '思考只用简体中文谈这张图纸。不要提工具。在消息里直接给出 JSON，然后停止。'
  ].join('\n\n')

  let submitted: string | null = null
  const started = Date.now()
  const log = (step: string) => {
    console.info(`[ai/walls] ${step} +${Date.now() - started}ms model=${model}`)
  }

  opts.onStatus?.(`正在创建 ${model} 会话…`)
  log('create')
  const agent = await Agent.create({
    apiKey: opts.apiKey,
    model: { id: model },
    tools: [],
    local: {
      cwd,
      settingSources: [],
      enableAgentRetries: false,
      customTools: {
        submit_walls: {
          description:
            '提交结构墙骨架：outerLoop 含阳台与凹凸；innerWalls 先描粗承重墙（含拐弯），再把每个有名字的房间四壁接到墙或门垛，门洞只空约一扇门宽；findings 写房间/门窗/家具。只调用一次后停止。',
          inputSchema: {
            type: 'object',
            additionalProperties: false,
            required: ['imageWidth', 'imageHeight', 'outerLoop'],
            properties: {
              imageWidth: { type: 'number' },
              imageHeight: { type: 'number' },
              outerLoop: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['x', 'y'],
                  properties: { x: { type: 'number' }, y: { type: 'number' } }
                }
              },
              innerWalls: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['x1', 'y1', 'x2', 'y2'],
                  properties: {
                    x1: { type: 'number' },
                    y1: { type: 'number' },
                    x2: { type: 'number' },
                    y2: { type: 'number' }
                  }
                }
              },
              findings: {
                type: 'object',
                additionalProperties: true,
                properties: {
                  overallWidthMm: { type: 'number' },
                  rooms: { type: 'array' },
                  furniture: { type: 'array' },
                  openings: { type: 'array' }
                }
              }
            }
          },
          execute: (args) => {
            submitted = tryParseWallsJson(JSON.stringify(args)) ?? JSON.stringify(args)
            log('submit_walls')
            return 'accepted'
          }
        }
      }
    }
  })

  let run: Run | undefined
  try {
    log('send')
    opts.onStatus?.(`已发送户型图，等待 ${model} 开始读图…`)
    run = await Promise.race([
      agent.send({
        text: prompt,
        images: [{ data: opts.imageBase64, mimeType: opts.mimeType }]
      }),
      timeoutError(SEND_TIMEOUT_MS, `${model} 发送后没有开始读图`)
    ])
    const json = await Promise.race([
      collectWallsJson(run, () => submitted, log, {
        onPartial: opts.onPartial,
        onThinking: (text) => opts.onThinking?.(localizeThinkingZh(text)),
        onOutput: opts.onOutput,
        onStatus: (message) => {
          if (/^状态：?(RUNNING|CREATING)$/i.test(message.trim())) {
            opts.onStatus?.(`${model} 已启动，正在读图…`)
            return
          }
          opts.onStatus?.(message)
        },
        silenceMs
      }),
      timeoutError(CURSOR_WALLS_TIMEOUT_MS)
    ])
    log('done')
    return json
  } finally {
    if (run?.supports('cancel') && run.status === 'running') {
      await run.cancel().catch(() => undefined)
    }
    await agent[Symbol.asyncDispose]().catch(() => undefined)
    await rm(cwd, { recursive: true, force: true })
  }
}

function tryParseWallsJson(text: string | null | undefined): string | null {
  if (!text || !text.includes('{')) return null
  try {
    return JSON.stringify(parseAiWallsPayload(extractJsonObject(text)))
  } catch {
    return null
  }
}

async function collectWallsJson(
  run: Run,
  getSubmitted: () => string | null,
  log: (step: string) => void,
  hooks: {
    onPartial?: (partial: PartialAiWalls) => void
    onThinking?: (text: string) => void
    onOutput?: (text: string) => void
    onStatus?: (message: string) => void
    silenceMs?: number
  } = {}
): Promise<string> {
  return new Promise((resolve, reject) => {
    let settled = false
    let buffer = ''
    let thinkingBuf = ''
    let lastKey = ''
    const started = Date.now()
    const appendThought = (text: string) => {
      if (!text) return
      if (thinkingBuf && text.startsWith(thinkingBuf)) thinkingBuf = text
      else if (thinkingBuf && thinkingBuf.startsWith(text)) return
      else thinkingBuf += text
      hooks.onThinking?.(thinkingBuf)
    }
    const heartbeat = setInterval(() => {
      if (settled) return
      const seconds = Math.round((Date.now() - started) / 1000)
      const idle = !thinkingBuf && !buffer
      hooks.onStatus?.(
        idle ? `已等待 ${seconds} 秒，模型还在读图…` : `已运行 ${seconds} 秒，模型仍在输出…`
      )
      if (idle) {
        hooks.onThinking?.(`正在读图，模型还没有吐字（已等 ${seconds} 秒）。`)
      }
      if (hooks.silenceMs && idle && Date.now() - started >= hooks.silenceMs) {
        fail(new Error(`模型长时间没有输出（${Math.round(hooks.silenceMs / 1000)} 秒）`))
      }
    }, 3_000)
    const emitPartial = (text: string | null | undefined) => {
      if (!text) return
      const partial = extractPartialAiWalls(text)
      if (!partial) return
      const key = `${partial.outerLoop.length}:${partial.innerWalls?.length ?? 0}:${partial.closeLoop}:${partial.complete}`
      if (key === lastKey) return
      lastKey = key
      log(`partial outer=${partial.outerLoop.length} inner=${partial.innerWalls?.length ?? 0}`)
      hooks.onPartial?.(partial)
    }

    const finish = (json: string, via: string) => {
      if (settled) return
      settled = true
      clearInterval(heartbeat)
      emitPartial(json)
      log(`parsed:${via}`)
      resolve(json)
    }

    const fail = (error: unknown) => {
      if (settled) return
      settled = true
      clearInterval(heartbeat)
      reject(error)
    }

    const consider = (text: string | null | undefined, via: string) => {
      emitPartial(buffer)
      emitPartial(text)
      const submitted = tryParseWallsJson(getSubmitted())
      if (submitted) {
        finish(submitted, 'submit_walls')
        return
      }
      const parsed = tryParseWallsJson(text)
      if (parsed) finish(parsed, via)
    }

    void (async () => {
      if (!run.supports('stream')) return
      for await (const event of run.stream()) {
        if (settled) return
        if (event.type === 'assistant') {
          const chunk = event.message.content
            .map((block) => {
              if (block.type === 'text') return block.text
              if (block.type === 'tool_use') return JSON.stringify(block.input ?? {})
              return ''
            })
            .join('')
          buffer += chunk
          if (chunk) hooks.onOutput?.(buffer)
          if (buffer.length > 0 && buffer.length % 400 < (chunk.length || 1)) {
            log(`assistant chars=${buffer.length}`)
          }
          consider(chunk, 'assistant-chunk')
          consider(buffer, 'assistant')
        } else if (event.type === 'thinking') {
          appendThought(event.text)
          if (event.thinking_duration_ms) {
            hooks.onStatus?.(`思考已进行 ${Math.round(event.thinking_duration_ms / 1000)} 秒`)
          }
        } else if (event.type === 'tool_call') {
          log(`tool:${event.name}:${event.status}`)
          hooks.onStatus?.(`工具 ${event.name} ${event.status}`)
          if (event.args) consider(JSON.stringify(event.args), `tool:${event.name}`)
          consider(getSubmitted(), 'submit_walls')
        } else if (event.type === 'status') {
          log(`status:${event.status}`)
          hooks.onStatus?.(event.message || `状态：${event.status}`)
        }
      }
    })().catch(fail)

    void run.wait().then((result) => {
      consider(getSubmitted(), 'submit_walls')
      consider(buffer, 'assistant')
      consider(result.result, 'wait')
      if (!settled) {
        fail(new Error(result.error?.message || 'Cursor 认墙没有返回可用的外墙 JSON'))
      }
    }, fail)
  })
}

function timeoutError(ms: number, message?: string): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error(message || `AI 认墙超时（${Math.round(ms / 1000)} 秒）。模型还在输出，请再试一次。`))
    }, ms)
  })
}
