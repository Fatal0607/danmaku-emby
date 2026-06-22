import { Icon } from './Icon'
import { IpcCallError } from '@/lib/ipc'
import './states.css'

export function PageSpinner({ label }: { label?: string }) {
  return (
    <div className="state-center">
      <span className="state-spinner" />
      {label && <div className="state-label">{label}</div>}
    </div>
  )
}

const ERROR_COPY: Record<string, string> = {
  EMBY_AUTH_FAILED: '登录已过期,请重新登录',
  EMBY_UNREACHABLE: '无法连接服务器,检查地址/网络',
  EMBY_INVALID_SERVER: '该地址不是有效的 Emby 服务器',
  EMBY_NO_SOURCE: '该内容暂时无法播放',
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const code = error instanceof IpcCallError ? error.code : undefined
  const message =
    (code && ERROR_COPY[code]) || (error instanceof Error ? error.message : '出了点问题')
  return (
    <div className="state-center">
      <div className="state-error-icon">
        <Icon name="danmaku" size={26} color="var(--error)" />
      </div>
      <div className="state-label">{message}</div>
      {onRetry && (
        <button className="state-retry" onClick={onRetry}>
          重试
        </button>
      )}
    </div>
  )
}

/** Poster-shaped shimmer placeholder used while a row/grid loads. */
export function PosterSkeleton({ width = 200 }: { width?: number }) {
  return (
    <div className="poster-skeleton" style={{ width }}>
      <div className="poster-skeleton-art" style={{ height: width * 1.5 }} />
      <div className="poster-skeleton-line" />
      <div className="poster-skeleton-line short" />
    </div>
  )
}

export function SkeletonRow({ count = 6, width = 200 }: { count?: number; width?: number }) {
  return (
    <div className="skeleton-row">
      {Array.from({ length: count }, (_, i) => (
        <PosterSkeleton key={i} width={width} />
      ))}
    </div>
  )
}
