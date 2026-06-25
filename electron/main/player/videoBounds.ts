export interface VideoBounds {
  x: number
  y: number
  width: number
  height: number
}

const MIN_VIDEO_WIDTH = 320
const MIN_VIDEO_HEIGHT = 180

export function offsetViewportBounds(windowBounds: VideoBounds, viewportBounds: VideoBounds): VideoBounds {
  return {
    x: windowBounds.x + viewportBounds.x,
    y: windowBounds.y + viewportBounds.y,
    width: viewportBounds.width,
    height: viewportBounds.height,
  }
}

export function normalizeVideoBounds(bounds: VideoBounds): VideoBounds {
  return {
    x: Math.round(bounds.x),
    y: Math.round(bounds.y),
    width: Math.max(MIN_VIDEO_WIDTH, Math.round(bounds.width)),
    height: Math.max(MIN_VIDEO_HEIGHT, Math.round(bounds.height)),
  }
}

export function formatMpvGeometry(bounds: VideoBounds): string {
  const normalized = normalizeVideoBounds(bounds)
  return `${normalized.width}x${normalized.height}${formatOffset(normalized.x)}${formatOffset(normalized.y)}`
}

function formatOffset(value: number): string {
  return value < 0 ? String(value) : `+${value}`
}
