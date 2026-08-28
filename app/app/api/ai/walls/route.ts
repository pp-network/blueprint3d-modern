import { AI_WALLS_SYSTEM_PROMPT, AI_WALLS_USER_PROMPT } from '@blueprint3d/vision/ai-walls-prompt'
import {
  AiWallsValidationError,
  extractJsonObject,
  extractPartialAiWalls,
  parseAiWallsPayload,
  type PartialAiWalls
} from '@blueprint3d/vision/ai-walls-schema'
import { resolveAiConfig } from '@/lib/ai-config'
import { detectWallsJsonWithCursor } from '@/lib/cursor-walls'

export const maxDuration = 630

export async function GET() {
  const cfg = resolveAiConfig()
  return Response.json({
    configured: cfg.configured,
    provider: cfg.provider,
    model: cfg.configured ? (cfg.provider === 'cursor' ? cfg.cursorModel : cfg.openaiModel) : null
  })
}

export async function POST(request: Request) {
  const cfg = resolveAiConfig()
  if (!cfg.configured) {
    return Response.json(
      { error: '未配置 CURSOR_API_KEY。在 app/.env.local 写入后重启 pnpm dev。' },
      { status: 503 }
    )
  }

  let body: {
    imageBase64?: string
    mimeType?: string
    width?: number
    height?: number
    overallWidthMm?: number
  }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return Response.json({ error: '请求不是 JSON' }, { status: 400 })
  }

  const imageBase64 = (body.imageBase64 ?? '').replace(/^data:[^;]+;base64,/, '')
  if (!imageBase64 || imageBase64.length < 32) {
    return Response.json({ error: '缺少户型图' }, { status: 400 })
  }
  if (imageBase64.length > 6_000_000) {
    return Response.json({ error: '图片太大' }, { status: 400 })
  }
  const mimeType = body.mimeType === 'image/png' ? 'image/png' : 'image/jpeg'
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      }
      const throttle = (event: string, ms: number) => {
        let last = 0
        let timer: ReturnType<typeof setTimeout> | null = null
        let pending: unknown = null
        const flush = () => {
          if (timer) {
            clearTimeout(timer)
            timer = null
          }
          if (pending === null) return
          last = Date.now()
          send(event, pending)
          pending = null
        }
        const push = ((data: unknown) => {
          pending = data
          if (Date.now() - last >= ms) {
            flush()
            return
          }
          if (!timer) timer = setTimeout(flush, ms)
        }) as ((data: unknown) => void) & { flush: () => void }
        push.flush = flush
        return push
      }
      const sendThinking = throttle('thinking', 160)
      const sendOutput = throttle('output', 120)
      const align = (partial: PartialAiWalls): PartialAiWalls => {
        if (body.width && body.height) {
          const widthRatio = Math.abs(partial.imageWidth - body.width) / body.width
          const heightRatio = Math.abs(partial.imageHeight - body.height) / body.height
          if (widthRatio > 0.25 || heightRatio > 0.25) {
            return { ...partial, imageWidth: body.width, imageHeight: body.height }
          }
        }
        return partial
      }
      const startedAt = Date.now()
      let awaitingFirstToken = true
      const keepAlive = setInterval(() => {
        const seconds = Math.round((Date.now() - startedAt) / 1000)
        try {
          controller.enqueue(encoder.encode(`: keepalive ${seconds}\n\n`))
          if (awaitingFirstToken) {
            send('status', { message: `已等待 ${seconds} 秒，模型还在读图…` })
          }
        } catch {
          // Stream already closed.
        }
      }, 3000)
      try {
        send('status', { message: `模型 ${cfg.provider === 'cursor' ? cfg.cursorModel : cfg.openaiModel} 开始认墙` })
        const content =
          cfg.provider === 'cursor'
            ? await detectWallsJsonWithCursor({
                apiKey: cfg.cursorApiKey,
                model: cfg.cursorModel,
                imageBase64,
                mimeType,
                overallWidthMm: body.overallWidthMm,
                onPartial: (partial) => send('partial', { payload: align(partial) }),
                onThinking: (text) => {
                  awaitingFirstToken = false
                  sendThinking({ text })
                },
                onOutput: (text) => {
                  awaitingFirstToken = false
                  sendOutput({ text })
                },
                onStatus: (message) => send('status', { message })
              })
            : await detectWallsJsonWithOpenAi({
                apiKey: cfg.openaiApiKey,
                baseUrl: cfg.openaiBaseUrl,
                model: cfg.openaiModel,
                imageBase64,
                mimeType,
                overallWidthMm: body.overallWidthMm,
                onDelta: (text) => {
                  sendOutput({ text })
                  const partial = extractPartialAiWalls(text)
                  if (partial) send('partial', { payload: align(partial) })
                }
              })
        const payload = align({
          ...parseAiWallsPayload(extractJsonObject(content)),
          closeLoop: true,
          complete: true
        })
        sendThinking.flush()
        sendOutput.flush()
        send('done', { payload })
      } catch (error) {
        const message =
          error instanceof AiWallsValidationError
            ? error.message
            : error instanceof Error
              ? error.message
              : '认墙失败'
        console.error('AI walls failed:', error)
        send('error', { error: message })
      } finally {
        clearInterval(keepAlive)
        controller.close()
      }
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    }
  })
}

async function detectWallsJsonWithOpenAi(opts: {
  apiKey: string
  baseUrl: string
  model: string
  imageBase64: string
  mimeType: string
  overallWidthMm?: number
  onDelta?: (text: string) => void
}): Promise<string> {
  const response = await fetch(`${opts.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: opts.model,
      temperature: 0,
      stream: true,
      messages: [
        { role: 'system', content: AI_WALLS_SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: AI_WALLS_USER_PROMPT(opts.overallWidthMm) },
            {
              type: 'image_url',
              image_url: {
                url: `data:${opts.mimeType};base64,${opts.imageBase64}`,
                detail: 'high'
              }
            }
          ]
        }
      ]
    })
  })
  if (!response.ok) {
    const json = (await response.json()) as { error?: { message?: string } }
    throw new Error(json.error?.message || `模型请求失败 (${response.status})`)
  }
  if (!response.body) {
    throw new Error('模型没有返回内容')
  }
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let content = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const data = trimmed.slice(5).trim()
      if (data === '[DONE]') continue
      try {
        const json = JSON.parse(data) as {
          choices?: Array<{ delta?: { content?: string } }>
        }
        const delta = json.choices?.[0]?.delta?.content
        if (delta) {
          content += delta
          opts.onDelta?.(content)
        }
      } catch {
        // Keep reading a broken chunk.
      }
    }
  }
  if (!content) {
    throw new Error('模型没有返回内容')
  }
  return content
}
