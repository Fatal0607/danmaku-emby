export type LibmpvRenderBackendId = 'software' | 'opengl' | 'metal'

export interface LibmpvNativeBackendInfo {
  id: LibmpvRenderBackendId
  apiType: 'sw' | 'opengl' | 'metal'
  available: boolean
  zeroCopy: boolean
  reason: string
}

export interface LibmpvNativeBackendReport {
  activeBackend: LibmpvRenderBackendId
  backends: readonly LibmpvNativeBackendInfo[]
}

export interface LibmpvRenderBackendInput {
  DMEMBY_L3_RENDER_BACKEND?: string
  requested?: string
}

export interface ResolvedLibmpvRenderBackend {
  id: LibmpvRenderBackendId
  requested: LibmpvRenderBackendId
  zeroCopy: boolean
  reason: string
  fallbackReason?: string
}

export function resolveLibmpvRenderBackend(
  report: LibmpvNativeBackendReport,
  input: LibmpvRenderBackendInput = process.env,
): ResolvedLibmpvRenderBackend {
  const requested = parseBackendId(input.requested ?? input.DMEMBY_L3_RENDER_BACKEND) ?? report.activeBackend
  const active = findUsableBackend(report, report.activeBackend)
  const wanted = report.backends.find((backend) => backend.id === requested)

  if (wanted?.available) {
    return {
      id: wanted.id,
      requested,
      zeroCopy: wanted.zeroCopy,
      reason: wanted.reason,
      fallbackReason: undefined,
    }
  }

  return {
    id: active.id,
    requested,
    zeroCopy: active.zeroCopy,
    reason: active.reason,
    fallbackReason: wanted
      ? `Requested ${requested} backend is unavailable: ${wanted.reason}`
      : `Requested ${requested} backend is not reported by the native addon.`,
  }
}

function findUsableBackend(
  report: LibmpvNativeBackendReport,
  preferred: LibmpvRenderBackendId,
): LibmpvNativeBackendInfo {
  return (
    report.backends.find((backend) => backend.id === preferred && backend.available) ??
    report.backends.find((backend) => backend.available) ?? {
      id: 'software',
      apiType: 'sw',
      available: true,
      zeroCopy: false,
      reason: 'Fallback software renderer.',
    }
  )
}

function parseBackendId(raw: string | undefined): LibmpvRenderBackendId | undefined {
  switch (raw) {
    case 'software':
    case 'opengl':
    case 'metal':
      return raw
    default:
      return undefined
  }
}
