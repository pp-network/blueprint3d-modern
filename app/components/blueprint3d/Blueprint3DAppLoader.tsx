'use client'

import dynamic from 'next/dynamic'
import type { Blueprint3DAppConfig } from './Blueprint3DAppBase'

const Blueprint3DApp = dynamic(
  () => import('./Blueprint3DApp').then((m) => m.Blueprint3DApp),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    )
  }
)

export function Blueprint3DAppLoader({ config }: { config?: Blueprint3DAppConfig }) {
  return <Blueprint3DApp config={config} />
}
