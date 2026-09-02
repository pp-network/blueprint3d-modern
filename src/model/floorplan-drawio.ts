import type { SavedFloorplan } from './floorplan'

const DRAWIO_HOST = 'blueprint3d-modern'

export function isDrawioXml(text: string): boolean {
  return /<mxfile[\s>]|<mxGraphModel[\s>]|<mxCell[\s>]/.test(text)
}

export function savedFloorplanToDrawio(floorplan: SavedFloorplan, name = 'floorplan'): string {
  const corners = Object.entries(floorplan.corners)
  const cells: string[] = ['        <mxCell id="0"/>', '        <mxCell id="1" parent="0"/>']
  for (const [id, corner] of corners) {
    cells.push(
      `        <mxCell id="${esc(id)}" vertex="1" parent="1" value="">`,
      `          <mxGeometry x="${fmt(corner.x)}" y="${fmt(corner.y)}" width="8" height="8" as="geometry"/>`,
      '        </mxCell>'
    )
  }
  floorplan.walls.forEach((wall, i) => {
    const a = floorplan.corners[wall.corner1]
    const b = floorplan.corners[wall.corner2]
    if (!a || !b) return
    const opening = wall.opening ? ' opening="1"' : ''
    const thickness = typeof wall.thickness === 'number' ? ` thickness="${fmt(wall.thickness)}"` : ''
    cells.push(
      `        <mxCell id="wall-${i + 1}" edge="1" parent="1" source="${esc(wall.corner1)}" target="${esc(wall.corner2)}" value="wall"${opening}${thickness}>`,
      '          <mxGeometry relative="1" as="geometry">',
      `            <mxPoint x="${fmt(a.x)}" y="${fmt(a.y)}" as="sourcePoint"/>`,
      `            <mxPoint x="${fmt(b.x)}" y="${fmt(b.y)}" as="targetPoint"/>`,
      '          </mxGeometry>',
      '        </mxCell>'
    )
  })
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<mxfile host="${DRAWIO_HOST}" type="device">`,
    `  <diagram id="floorplan" name="${esc(name)}">`,
    '    <mxGraphModel dx="1200" dy="800" grid="1" gridSize="10" guides="1">',
    '      <root>',
    ...cells,
    '      </root>',
    '    </mxGraphModel>',
    '  </diagram>',
    '</mxfile>',
    ''
  ].join('\n')
}

export function drawioToSavedFloorplan(xml: string): SavedFloorplan {
  const corners: Record<string, { x: number; y: number }> = {}
  const walls: SavedFloorplan['walls'] = []
  const vertexRe =
    /<mxCell\b([^>]*\bvertex="1"[^>]*)>([\s\S]*?)<\/mxCell>/g
  const edgeRe = /<mxCell\b([^>]*\bedge="1"[^>]*)>([\s\S]*?)<\/mxCell>/g

  for (const match of xml.matchAll(vertexRe)) {
    const attrs = match[1]
    const body = match[2]
    const id = attr(attrs, 'id')
    const geom = geometry(body) ?? geometry(attrs)
    if (!id || !geom) continue
    corners[id] = { x: geom.x, y: geom.y }
  }

  let fallback = 0
  for (const match of xml.matchAll(edgeRe)) {
    const attrs = match[1]
    const body = match[2]
    const sourceId = attr(attrs, 'source')
    const targetId = attr(attrs, 'target')
    const source = (sourceId && corners[sourceId]) || point(body, 'sourcePoint')
    const target = (targetId && corners[targetId]) || point(body, 'targetPoint')
    if (!source || !target) continue
    const c1 = sourceId && corners[sourceId] ? sourceId : `p${++fallback}`
    const c2 = targetId && corners[targetId] ? targetId : `p${++fallback}`
    corners[c1] = source
    corners[c2] = target
    if (c1 === c2) continue
    walls.push({
      corner1: c1,
      corner2: c2,
      ...(attr(attrs, 'opening') === '1' ? { opening: true } : {}),
      ...(num(attr(attrs, 'thickness')) ? { thickness: num(attr(attrs, 'thickness')) } : {})
    })
  }

  if (walls.length === 0) {
    throw new Error('drawio has no walls')
  }
  return {
    corners,
    walls,
    wallTextures: [],
    floorTextures: {},
    newFloorTextures: {}
  }
}

function attr(text: string, name: string): string | undefined {
  return text.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1]
}

function num(value?: string): number | undefined {
  if (!value) return undefined
  const n = Number(value)
  return Number.isFinite(n) ? n : undefined
}

function geometry(text: string): { x: number; y: number } | null {
  const match = text.match(/<mxGeometry\b[^>]*\bx="(-?\d+(?:\.\d+)?)"[^>]*\by="(-?\d+(?:\.\d+)?)"/)
  if (!match) return null
  return { x: Number(match[1]), y: Number(match[2]) }
}

function point(text: string, as: string): { x: number; y: number } | null {
  const match = text.match(
    new RegExp(`<mxPoint\\b[^>]*\\bx="(-?\\d+(?:\\.\\d+)?)"[^>]*\\by="(-?\\d+(?:\\.\\d+)?)"[^>]*\\bas="${as}"`)
  )
  if (!match) return null
  return { x: Number(match[1]), y: Number(match[2]) }
}

function esc(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

function fmt(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2)
}
