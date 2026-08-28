export interface PixelSegment {
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface WorldSegment {
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface TraceBBox {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export interface WallTrace {
  /** Segment endpoints in original image pixel space. */
  segments: PixelSegment[]
  bbox: TraceBBox
  imageWidth: number
  imageHeight: number
  /** How many leading segments belong to the outer envelope. */
  outerCount?: number
}