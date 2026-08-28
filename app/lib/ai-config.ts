export type LlmProvider = 'cursor' | 'openai' | 'none'

export interface AiRuntimeConfig {
  provider: LlmProvider
  configured: boolean
  cursorApiKey: string
  openaiApiKey: string
  openaiBaseUrl: string
  visionModel: string
  cursorModel: string
  openaiModel: string
}

/** Bedrock / Vertex ids from AiAgent → Cursor SDK model ids. */
export function toCursorModelId(modelId: string): string {
  const raw = modelId.trim()
  if (!raw) return 'claude-sonnet-4-6'
  return raw
    .replace(/^(global|apac|us|eu|us-east-1|us-west-2)\./, '')
    .replace(/^anthropic\./, '')
}

export function resolveAiConfig(): AiRuntimeConfig {
  const cursorApiKey = process.env.CURSOR_API_KEY?.trim() ?? ''
  const openaiApiKey = (process.env.OPENAI_API_KEY ?? process.env.AI_API_KEY ?? '').trim()
  const openaiBaseUrl = (process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/$/, '')
  const visionModel =
    process.env.VISION_MODEL_ID?.trim() ||
    process.env.GENERATOR_MODEL_ID?.trim() ||
    process.env.BEDROCK_MODEL_ID?.trim() ||
    'gemini-3.1-pro'
  const requested = (process.env.LLM_PROVIDER ?? '').trim().toLowerCase()
  let provider: LlmProvider = 'none'
  if (requested === 'cursor' || (!requested && cursorApiKey)) {
    provider = cursorApiKey ? 'cursor' : 'none'
  } else if (requested === 'openai' || requested === 'openai-compatible') {
    provider = openaiApiKey ? 'openai' : 'none'
  } else if (cursorApiKey) {
    provider = 'cursor'
  } else if (openaiApiKey) {
    provider = 'openai'
  }
  const cursorModel = toCursorModelId(process.env.CURSOR_MODEL?.trim() || visionModel)
  const openaiModel = process.env.OPENAI_MODEL?.trim() || 'gpt-4o'
  return {
    provider,
    configured: provider !== 'none',
    cursorApiKey,
    openaiApiKey,
    openaiBaseUrl,
    visionModel,
    cursorModel,
    openaiModel
  }
}
