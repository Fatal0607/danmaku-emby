import type {
  AudioStream,
  EmbyItem,
  EmbyItemType,
  EmbyServer,
  EmbyView,
  ImageType,
  ItemsQuery,
  Page,
  PlaybackMode,
  PlaybackSource,
  ProgressReport,
  ServerInput,
  SubtitleStream,
} from '@shared/types/emby'
import { TICKS_PER_SECOND } from '@shared/types/emby'
import type { FetchLike } from '../net/FetchLike'
import { buildDeviceProfile } from './DeviceProfileBuilder'
import { MPV_CAPABILITIES } from '../player/PlayerEngine'
import type {
  RawAuthResult,
  RawItem,
  RawItemsResponse,
  RawMediaSource,
  RawPlaybackInfo,
  RawSystemInfoPublic,
  RawView,
} from './types'

const APP_NAME = 'DanmakuEmby'
const APP_VERSION = '0.1.0'

export interface EmbySession {
  server: EmbyServer
  token: string
}

export interface EmbyServiceDeps {
  fetcher: FetchLike
  deviceId: string
  deviceName?: string
  /** resolve the stored AccessToken for a server (Keychain-backed). */
  getToken: (serverId: string) => string | null
}

export class EmbyError extends Error {
  constructor(
    public code:
      | 'EMBY_AUTH_FAILED'
      | 'EMBY_UNREACHABLE'
      | 'EMBY_INVALID_SERVER'
      | 'EMBY_NO_SOURCE',
    message: string,
  ) {
    super(message)
    this.name = 'EmbyError'
  }
}

export class EmbyService {
  constructor(private readonly deps: EmbyServiceDeps) {}

  /** `X-Emby-Authorization` header value (docs 02 §2.2). */
  buildAuthHeader(token?: string): string {
    const parts = [
      `Client="${APP_NAME}"`,
      `Device="${this.deps.deviceName ?? 'MacBook'}"`,
      `DeviceId="${this.deps.deviceId}"`,
      `Version="${APP_VERSION}"`,
    ]
    if (token) parts.push(`Token="${token}"`)
    return `MediaBrowser ${parts.join(', ')}`
  }

  private headers(token?: string): Record<string, string> {
    const h: Record<string, string> = {
      'X-Emby-Authorization': this.buildAuthHeader(token),
      'Content-Type': 'application/json',
      Accept: 'application/json',
    }
    if (token) h['X-Emby-Token'] = token
    return h
  }

  /** Normalize user input into a base URL, defaulting to https. */
  static normalizeAddress(address: string): string {
    let a = address.trim().replace(/\/+$/, '')
    if (!/^https?:\/\//i.test(a)) a = `https://${a}`
    return a
  }

  /** Probe `/System/Info/Public` to confirm an Emby server (docs 02 §2.2). */
  async discover(address: string): Promise<RawSystemInfoPublic> {
    const baseUrl = EmbyService.normalizeAddress(address)
    try {
      const res = await this.deps.fetcher.request<RawSystemInfoPublic>({
        url: `${baseUrl}/System/Info/Public`,
        responseType: 'json',
      })
      if (!res.ok || !res.data?.Id) {
        throw new EmbyError('EMBY_INVALID_SERVER', '该地址不是有效的 Emby 服务器')
      }
      return res.data
    } catch (e) {
      if (e instanceof EmbyError) throw e
      throw new EmbyError('EMBY_UNREACHABLE', '无法连接服务器,检查地址/网络')
    }
  }

  /**
   * Authenticate and return the server record + token. Caller persists the
   * server to SQLite and the token to Keychain (docs 05 §5.6).
   */
  async authenticate(input: ServerInput): Promise<EmbySession> {
    const info = await this.discover(input.address)
    const baseUrl = EmbyService.normalizeAddress(input.address)
    const res = await this.deps.fetcher.request<RawAuthResult>({
      url: `${baseUrl}/Users/AuthenticateByName`,
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ Username: input.username, Pw: input.password }),
      responseType: 'json',
    })
    if (res.status === 401 || !res.data?.AccessToken) {
      throw new EmbyError('EMBY_AUTH_FAILED', '认证失败,请检查凭据')
    }
    return {
      server: {
        id: res.data.ServerId || info.Id,
        name: info.ServerName,
        baseUrl,
        userId: res.data.User.Id,
        username: res.data.User.Name,
        createdAt: Date.now(),
        lastUsed: Date.now(),
      },
      token: res.data.AccessToken,
    }
  }

  async getViews(server: EmbyServer): Promise<EmbyView[]> {
    const data = await this.get<{ Items: RawView[] }>(
      server,
      `/Users/${server.userId}/Views`,
    )
    return data.Items.map((v) => ({
      id: v.Id,
      name: v.Name,
      collectionType: v.CollectionType,
    }))
  }

  async getItems(server: EmbyServer, query: ItemsQuery): Promise<Page<EmbyItem>> {
    const params = new URLSearchParams()
    if (query.parentId) params.set('ParentId', query.parentId)
    if (query.includeItemTypes?.length)
      params.set('IncludeItemTypes', query.includeItemTypes.join(','))
    if (query.recursive) params.set('Recursive', 'true')
    if (query.sortBy) params.set('SortBy', query.sortBy)
    if (query.sortOrder) params.set('SortOrder', query.sortOrder)
    if (query.startIndex != null) params.set('StartIndex', String(query.startIndex))
    if (query.limit != null) params.set('Limit', String(query.limit))
    if (query.searchTerm) params.set('SearchTerm', query.searchTerm)
    if (query.filters?.length) params.set('Filters', query.filters.join(','))
    params.set('Fields', 'Overview,Genres,MediaSources,UserData,ProductionYear')

    const data = await this.get<RawItemsResponse>(
      server,
      `/Users/${server.userId}/Items?${params.toString()}`,
    )
    return {
      items: data.Items.map((it) => mapItem(it, server.id)),
      total: data.TotalRecordCount,
      startIndex: query.startIndex ?? 0,
    }
  }

  async getItem(server: EmbyServer, itemId: string): Promise<EmbyItem> {
    const data = await this.get<RawItem>(server, `/Users/${server.userId}/Items/${itemId}`)
    return mapItem(data, server.id)
  }

  async getEpisodes(server: EmbyServer, seriesId: string): Promise<EmbyItem[]> {
    const data = await this.get<RawItemsResponse>(
      server,
      `/Shows/${seriesId}/Episodes?UserId=${server.userId}&Fields=Overview,UserData`,
    )
    return data.Items.map((it) => mapItem(it, server.id))
  }

  async search(server: EmbyServer, term: string, limit = 40): Promise<Page<EmbyItem>> {
    return this.getItems(server, {
      serverId: server.id,
      searchTerm: term,
      recursive: true,
      includeItemTypes: ['Movie', 'Series', 'Episode'],
      limit,
    })
  }

  /**
   * Resolve a playable source via PlaybackInfo + DeviceProfile (docs 02 §2.4).
   * The mpv profile is permissive → Emby returns the original file for
   * DirectPlay, so AC3/DTS/HEVC decode locally with sound.
   */
  async resolvePlaybackSource(
    server: EmbyServer,
    itemId: string,
    startTicks = 0,
  ): Promise<PlaybackSource> {
    const profile = buildDeviceProfile(MPV_CAPABILITIES)
    const info = await this.post<RawPlaybackInfo>(
      server,
      `/Items/${itemId}/PlaybackInfo?UserId=${server.userId}`,
      {
        DeviceProfile: profile,
        MaxStreamingBitrate: profile.MaxStreamingBitrate,
        StartTimeTicks: startTicks,
      },
    )
    const source = info.MediaSources?.[0]
    if (!source) throw new EmbyError('EMBY_NO_SOURCE', '该内容暂时无法播放')

    const token = this.requireToken(server.id)
    const { url, mode } = this.resolveUrl(server, itemId, source, token)
    return {
      itemId,
      mediaSourceId: source.Id,
      url,
      mode,
      startTicks,
      container: source.Container ?? '',
      fileName: source.Path ? basename(source.Path) : source.Name,
      fileSize: source.Size,
      runTimeTicks: source.RunTimeTicks,
      audioStreams: mapAudio(source),
      subtitleStreams: mapSubtitles(source, server.baseUrl),
    }
  }

  private resolveUrl(
    server: EmbyServer,
    itemId: string,
    source: RawMediaSource,
    token: string,
  ): { url: string; mode: PlaybackMode } {
    if (source.SupportsDirectPlay !== false) {
      const params = new URLSearchParams({
        Static: 'true',
        MediaSourceId: source.Id,
        api_key: token,
        DeviceId: this.deps.deviceId,
      })
      return {
        url: `${server.baseUrl}/Videos/${itemId}/stream?${params.toString()}`,
        mode: 'directPlay',
      }
    }
    if (source.TranscodingUrl) {
      return { url: joinUrl(server.baseUrl, source.TranscodingUrl), mode: 'transcode' }
    }
    if (source.DirectStreamUrl) {
      return { url: joinUrl(server.baseUrl, source.DirectStreamUrl), mode: 'directStream' }
    }
    throw new EmbyError('EMBY_NO_SOURCE', '该内容暂时无法播放')
  }

  /** Report playback progress / start / stop (docs 02 §2.5). */
  async reportProgress(server: EmbyServer, report: ProgressReport): Promise<void> {
    const path =
      report.event === 'start'
        ? '/Sessions/Playing'
        : report.event === 'stop'
          ? '/Sessions/Playing/Stopped'
          : '/Sessions/Playing/Progress'
    await this.post(server, path, {
      ItemId: report.itemId,
      MediaSourceId: report.mediaSourceId,
      PositionTicks: report.positionTicks,
      IsPaused: report.isPaused,
      PlayMethod: report.playMethod,
    })
  }

  imageUrl(server: EmbyServer, itemId: string, type: ImageType, tag?: string, height = 400): string {
    const params = new URLSearchParams({ fillHeight: String(height), quality: '90' })
    if (tag) params.set('tag', tag)
    return `${server.baseUrl}/Items/${itemId}/Images/${type}?${params.toString()}`
  }

  // ---- low-level helpers ----

  private requireToken(serverId: string): string {
    const token = this.deps.getToken(serverId)
    if (!token) throw new EmbyError('EMBY_AUTH_FAILED', '登录已过期,请重新登录')
    return token
  }

  private async get<T>(server: EmbyServer, path: string): Promise<T> {
    const token = this.requireToken(server.id)
    const res = await this.deps.fetcher.request<T>({
      url: joinUrl(server.baseUrl, path),
      headers: this.headers(token),
      responseType: 'json',
    })
    if (res.status === 401) throw new EmbyError('EMBY_AUTH_FAILED', '登录已过期,请重新登录')
    if (!res.ok) throw new EmbyError('EMBY_UNREACHABLE', '无法连接服务器,检查地址/网络')
    return res.data
  }

  private async post<T>(server: EmbyServer, path: string, body: unknown): Promise<T> {
    const token = this.requireToken(server.id)
    const res = await this.deps.fetcher.request<T>({
      url: joinUrl(server.baseUrl, path),
      method: 'POST',
      headers: this.headers(token),
      body: JSON.stringify(body),
      responseType: 'json',
    })
    if (res.status === 401) throw new EmbyError('EMBY_AUTH_FAILED', '登录已过期,请重新登录')
    if (!res.ok) throw new EmbyError('EMBY_UNREACHABLE', '无法连接服务器,检查地址/网络')
    return res.data
  }
}

// ---- pure mappers ----

const TYPE_MAP: Record<string, EmbyItemType> = {
  Movie: 'Movie',
  Series: 'Series',
  Season: 'Season',
  Episode: 'Episode',
  Video: 'Video',
}

export function mapItem(raw: RawItem, serverId: string): EmbyItem {
  const positionTicks = raw.UserData?.PlaybackPositionTicks ?? 0
  const playedPercentage =
    raw.UserData?.PlayedPercentage != null
      ? raw.UserData.PlayedPercentage / 100
      : raw.RunTimeTicks && positionTicks
        ? positionTicks / raw.RunTimeTicks
        : undefined
  return {
    id: raw.Id,
    serverId,
    name: raw.Name,
    type: TYPE_MAP[raw.Type] ?? 'Movie',
    productionYear: raw.ProductionYear,
    overview: raw.Overview,
    genres: raw.Genres,
    communityRating: raw.CommunityRating,
    runTimeTicks: raw.RunTimeTicks,
    playbackPositionTicks: positionTicks || undefined,
    playedPercentage,
    indexNumber: raw.IndexNumber,
    parentIndexNumber: raw.ParentIndexNumber,
    seriesId: raw.SeriesId,
    seriesName: raw.SeriesName,
    imageTags: {
      primary: raw.ImageTags?.Primary,
      thumb: raw.ImageTags?.Thumb,
      backdrop: raw.BackdropImageTags?.[0],
    },
  }
}

function mapAudio(source: RawMediaSource): AudioStream[] {
  return (source.MediaStreams ?? [])
    .filter((s) => s.Type === 'Audio')
    .map((s) => ({
      index: s.Index,
      codec: s.Codec,
      language: s.Language,
      displayTitle: s.DisplayTitle,
      channels: s.Channels,
      isDefault: s.IsDefault,
    }))
}

function mapSubtitles(source: RawMediaSource, baseUrl: string): SubtitleStream[] {
  return (source.MediaStreams ?? [])
    .filter((s) => s.Type === 'Subtitle')
    .map((s) => ({
      index: s.Index,
      codec: s.Codec,
      language: s.Language,
      displayTitle: s.DisplayTitle,
      isExternal: s.IsExternal,
      deliveryUrl: s.DeliveryUrl ? joinUrl(baseUrl, s.DeliveryUrl) : undefined,
    }))
}

// ---- url utils ----

export function joinUrl(base: string, path: string): string {
  if (/^https?:\/\//i.test(path)) return path
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`
}

function basename(p: string): string {
  return p.split(/[\\/]/).pop() ?? p
}

export const secondsToTicks = (sec: number): number => Math.round(sec * TICKS_PER_SECOND)
export const ticksToSeconds = (ticks: number): number => ticks / TICKS_PER_SECOND
