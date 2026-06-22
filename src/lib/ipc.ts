import type { IpcResult, IpcError } from '@shared/types/ipc'
import type { RendererApi } from '../../electron/preload'

// Renderer access to the preload bridge. In the browser preview `window.api`
// is undefined, so callers fall back to mock data via `isElectron()`.

declare global {
  interface Window {
    api?: RendererApi
  }
}

export function isElectron(): boolean {
  return typeof window !== 'undefined' && !!window.api
}

export function getApi(): RendererApi {
  if (!window.api) {
    throw new Error('Renderer API unavailable — running outside Electron')
  }
  return window.api
}

/** Unwrap an IpcResult, throwing a typed error on failure. */
export async function unwrap<T>(p: Promise<IpcResult<T>>): Promise<T> {
  const res = await p
  if (res.ok) return res.data
  throw new IpcCallError(res.error)
}

export class IpcCallError extends Error {
  code: IpcError['code']
  constructor(error: IpcError) {
    super(error.message)
    this.name = 'IpcCallError'
    this.code = error.code
  }
}
