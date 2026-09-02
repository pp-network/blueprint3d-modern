'use client'

import { useMemo, useState } from 'react'
import { Map, ChevronRight } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Room } from '@blueprint3d/model/room'

export interface MinimapWall {
  x1: number
  y1: number
  x2: number
  y2: number
  opening?: boolean
}

export interface MinimapItem {
  x: number
  z: number
}

interface FloorplanMinimapProps {
  rooms: Room[]
  walls: MinimapWall[]
  items: MinimapItem[]
  activeRoomName?: string
  onRoomSelect: (room: Room) => void
}

export function FloorplanMinimap({
  rooms,
  walls,
  items,
  activeRoomName,
  onRoomSelect
}: FloorplanMinimapProps) {
  const t = useTranslations('BluePrint.minimap')
  const [open, setOpen] = useState(true)

  const bounds = useMemo(() => {
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const wall of walls) {
      minX = Math.min(minX, wall.x1, wall.x2)
      minY = Math.min(minY, wall.y1, wall.y2)
      maxX = Math.max(maxX, wall.x1, wall.x2)
      maxY = Math.max(maxY, wall.y1, wall.y2)
    }
    if (!Number.isFinite(minX)) {
      return { minX: 0, minY: 0, width: 1, height: 1 }
    }
    const pad = 40
    return {
      minX: minX - pad,
      minY: minY - pad,
      width: Math.max(1, maxX - minX + pad * 2),
      height: Math.max(1, maxY - minY + pad * 2)
    }
  }, [walls])

  if (rooms.length === 0) {
    return null
  }

  return (
    <div className="pointer-events-auto flex items-start gap-1">
      {open ? (
        <div className="w-[220px] rounded-lg border border-border bg-zinc-950/90 p-2 text-zinc-100 shadow-lg backdrop-blur-sm">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-medium">{t('title')}</span>
            <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-zinc-300" onClick={() => setOpen(false)}>
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
          <svg
            viewBox={`${bounds.minX} ${bounds.minY} ${bounds.width} ${bounds.height}`}
            className="h-[220px] w-full rounded bg-zinc-900"
          >
            {rooms.map((room) => {
              const points = room.interiorCorners.map((c) => `${c.x},${c.y}`).join(' ')
              const active = room.name === activeRoomName
              const center = room.getCenter2D()
              return (
                <g key={room.getUuid()}>
                  <polygon
                    points={points}
                    className={cn(
                      'cursor-pointer stroke-zinc-500 stroke-[4] hover:fill-amber-400/25',
                      active ? 'fill-amber-400/30' : 'fill-zinc-800/80'
                    )}
                    onClick={() => onRoomSelect(room)}
                  />
                  <text
                    x={center.x}
                    y={center.y}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className="pointer-events-none fill-zinc-100"
                    fontSize={Math.min(42, Math.max(16, Math.sqrt(room.getArea()) * 0.06))}
                  >
                    {room.name}
                  </text>
                </g>
              )
            })}
            {walls.map((wall, i) => (
              <line
                key={i}
                x1={wall.x1}
                y1={wall.y1}
                x2={wall.x2}
                y2={wall.y2}
                className={wall.opening ? 'stroke-zinc-600' : 'stroke-zinc-100'}
                strokeWidth={wall.opening ? 3 : 8}
                strokeDasharray={wall.opening ? '10 8' : undefined}
              />
            ))}
            {items.map((item, i) => (
              <rect
                key={`item-${i}`}
                x={item.x - 8}
                y={item.z - 8}
                width={16}
                height={16}
                className="fill-sky-300/80"
              />
            ))}
          </svg>
          <p className="mt-1 text-[10px] text-zinc-400">{t('hint')}</p>
        </div>
      ) : (
        <Button
          type="button"
          variant="secondary"
          size="icon"
          className="h-9 w-9 shadow-md"
          onClick={() => setOpen(true)}
          title={t('title')}
        >
          <Map className="h-4 w-4" />
        </Button>
      )}
    </div>
  )
}
