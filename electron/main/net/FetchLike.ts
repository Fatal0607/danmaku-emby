// Unified network layer (docs 01 §1.2, 04 §4.4). Emby uses the JSON subset;
// the danmaku stack will extend it with header-rewrite / cookie / xml / protobuf.
// Injectable so services are unit-testable without real network.

export type ResponseType = 'json' | 'text' | 'xml' | 'arraybuffer'

export interface FetchLikeRequest {
  url: string
  method?: string
  headers?: Record<string, string>
  body?: string | Uint8Array
  /** forbidden headers to inject via session rules (Referer/Origin/Cookie). */
  rewriteHeaders?: Record<string, string>
  credentials?: 'include' | 'omit'
  responseType?: ResponseType
  timeoutMs?: number
}

export interface FetchLikeResponse<T = unknown> {
  status: number
  ok: boolean
  headers: Record<string, string>
  data: T
}

export interface FetchLike {
  request<T = unknown>(req: FetchLikeRequest): Promise<FetchLikeResponse<T>>
}

const DEFAULT_TIMEOUT = 15_000

/**
 * Default implementation over the global `fetch` (Electron Main / Node 18+).
 * In production the Main process can swap in `electron.net.fetch` so requests
 * traverse the session network stack (proxy + cookie friendly, docs 04 §4.4).
 */
export class HttpFetchLike implements FetchLike {
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async request<T>(req: FetchLikeRequest): Promise<FetchLikeResponse<T>> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), req.timeoutMs ?? DEFAULT_TIMEOUT)
    try {
      const res = await this.fetchImpl(req.url, {
        method: req.method ?? 'GET',
        headers: { ...req.headers, ...req.rewriteHeaders },
        body: req.body as BodyInit | undefined,
        credentials: req.credentials,
        signal: controller.signal,
      })
      const data = await decode<T>(res, req.responseType ?? 'json')
      return {
        status: res.status,
        ok: res.ok,
        headers: Object.fromEntries(res.headers.entries()),
        data,
      }
    } finally {
      clearTimeout(timeout)
    }
  }
}

async function decode<T>(res: Response, type: ResponseType): Promise<T> {
  switch (type) {
    case 'json':
      return (res.status === 204 ? null : await res.json()) as T
    case 'text':
    case 'xml':
      return (await res.text()) as T
    case 'arraybuffer':
      return (await res.arrayBuffer()) as T
  }
}
