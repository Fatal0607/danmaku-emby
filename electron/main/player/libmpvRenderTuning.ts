export interface LibmpvRenderTuning {
  targetFps: number
  frameIntervalMs: number
  maxPixels: number
  maxWidth: number
  maxHeight: number
}

export interface LibmpvRenderTuningInput {
  DMEMBY_L3_TARGET_FPS?: string
  DMEMBY_L3_MAX_PIXELS?: string
  targetFps?: number
  maxPixels?: number
}

const DEFAULT_TARGET_FPS = 60
const MIN_TARGET_FPS = 15
const MAX_TARGET_FPS = 60
const DEFAULT_MAX_PIXELS = 1280 * 720
const MIN_MAX_PIXELS = 320 * 180
const MAX_MAX_PIXELS = 1920 * 1080
const MAX_RENDER_WIDTH = 1920
const MAX_RENDER_HEIGHT = 1080

export function resolveLibmpvRenderTuning(
  input: LibmpvRenderTuningInput = process.env,
): LibmpvRenderTuning {
  const targetFps = readBoundedNumber(
    input.targetFps ?? input.DMEMBY_L3_TARGET_FPS,
    DEFAULT_TARGET_FPS,
    MIN_TARGET_FPS,
    MAX_TARGET_FPS,
  )
  const maxPixels = readBoundedNumber(
    input.maxPixels ?? input.DMEMBY_L3_MAX_PIXELS,
    DEFAULT_MAX_PIXELS,
    MIN_MAX_PIXELS,
    MAX_MAX_PIXELS,
  )

  return {
    targetFps,
    frameIntervalMs: Math.max(1, Math.round(1000 / targetFps)),
    maxPixels,
    maxWidth: MAX_RENDER_WIDTH,
    maxHeight: MAX_RENDER_HEIGHT,
  }
}

export function normalizeSoftwareFrameSize(
  width: number,
  height: number,
  tuning: LibmpvRenderTuning = resolveLibmpvRenderTuning(),
): { width: number; height: number } {
  const sourceWidth = Number.isFinite(width) && width > 0 ? width : 1280
  const sourceHeight = Number.isFinite(height) && height > 0 ? height : 720
  const pixelScale = Math.sqrt(tuning.maxPixels / (sourceWidth * sourceHeight))
  const scale = Math.min(1, tuning.maxWidth / sourceWidth, tuning.maxHeight / sourceHeight, pixelScale)

  return {
    width: Math.max(2, Math.round(sourceWidth * scale)),
    height: Math.max(2, Math.round(sourceHeight * scale)),
  }
}

function readBoundedNumber(
  raw: string | number | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = typeof raw === 'number' ? raw : raw == null ? NaN : Number(raw)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, Math.round(parsed)))
}
