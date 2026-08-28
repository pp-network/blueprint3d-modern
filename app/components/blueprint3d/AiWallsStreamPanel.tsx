'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'

export interface AiWallsStreamState {
  thinking: string
  output: string
  status: string
  findings: string
}

interface AiWallsStreamPanelProps {
  model: string | null
  detecting: boolean
  stream: AiWallsStreamState
}

function useElapsedSeconds(active: boolean): number {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (!active) {
      setElapsed(0)
      return
    }
    const started = Date.now()
    const timer = window.setInterval(() => {
      setElapsed(Math.round((Date.now() - started) / 1000))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [active])
  return elapsed
}

function StreamPane({
  title,
  text,
  empty,
  mono
}: {
  title: string
  text: string
  empty: string
  mono?: boolean
}) {
  const ref = useRef<HTMLPreElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [text])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="text-[10px] font-medium text-muted-foreground">{title}</div>
      <pre
        ref={ref}
        className={`mt-1 min-h-[96px] flex-1 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border/70 bg-muted/40 p-2 text-[10px] leading-4 ${
          mono ? 'font-mono' : ''
        }`}
      >
        {text || empty}
      </pre>
    </div>
  )
}

export function AiWallsStreamPanel({ model, detecting, stream }: AiWallsStreamPanelProps) {
  const t = useTranslations('BluePrint.overlay')
  const elapsed = useElapsedSeconds(detecting)
  const hasContent = Boolean(stream.thinking || stream.output || stream.status || stream.findings)
  if (!detecting && !hasContent) return null

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 rounded-lg border border-border bg-background p-3">
      <div className="text-xs font-medium">{t('streamTitle', { model: model || 'Gemini' })}</div>
      <p className="text-[11px] leading-4 text-muted-foreground">
        {stream.status || t('streamWaiting')}
        {detecting ? ` · ${t('streamElapsed', { seconds: elapsed })}` : ''}
      </p>
      <StreamPane
        title={t('streamThinking')}
        text={stream.thinking}
        empty={detecting ? t('streamWaiting') : ''}
      />
      {stream.findings ? <StreamPane title={t('streamFindings')} text={stream.findings} empty="" /> : null}
      <StreamPane title={t('streamOutput')} text={stream.output} empty="" mono />
    </div>
  )
}
