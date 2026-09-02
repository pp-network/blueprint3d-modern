import { resolveAiConfig } from '@/lib/ai-config'

/** Lightweight status. Do not import cursor-walls here — that module can stall GET /api/ai/walls. */
export async function GET() {
  const cfg = resolveAiConfig()
  return Response.json({
    configured: cfg.configured,
    provider: cfg.provider,
    model: cfg.configured ? (cfg.provider === 'cursor' ? cfg.cursorModel : cfg.openaiModel) : null
  })
}
