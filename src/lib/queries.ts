import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ServerInput } from '@shared/types/emby'
import type { MediaKind } from '@shared/types/domain'
import type { DanmakuMatchInput, DanmakuProvider, ProviderConfig } from '@shared/types/danmaku'
import { useUI } from './store'
import { getDataSource } from './dataSource'
import { getDanmakuSource, type ManualFetchArgs } from './danmakuSource'

// TanStack Query hooks over the DataSource (docs 01 §1.5: server state lives in
// TanStack Query, not the Zustand client store). Keys are namespaced by server.

const ds = () => getDataSource()
const dds = () => getDanmakuSource()

export const qk = {
  servers: ['servers'] as const,
  continueWatching: (s: string) => ['continueWatching', s] as const,
  recentlyAdded: (s: string) => ['recentlyAdded', s] as const,
  homeSections: (s: string) => ['homeSections', s] as const,
  viewSection: (s: string, id: string) => ['viewSection', s, id] as const,
  library: (s: string, k: MediaKind) => ['library', s, k] as const,
  item: (s: string, id: string) => ['item', s, id] as const,
  episodes: (s: string, id: string) => ['episodes', s, id] as const,
  search: (s: string, term: string) => ['search', s, term] as const,
  danmakuProviders: ['danmakuProviders'] as const,
  danmakuConfigs: ['danmakuConfigs'] as const,
  danmakuTrack: (s: string, id: string) => ['danmakuTrack', s, id] as const,
  danmakuSearch: (term: string) => ['danmakuSearch', term] as const,
  danmakuEpisodes: (p: string, sid: string) => ['danmakuEpisodes', p, sid] as const,
}

export function useServers() {
  return useQuery({ queryKey: qk.servers, queryFn: () => ds().listServers() })
}

/** Resolve the active server: the store's choice if present, else the first. */
export function useCurrentServerId(): string | undefined {
  const stored = useUI((s) => s.currentServerId)
  const { data: servers } = useServers()
  if (servers?.some((s) => s.id === stored)) return stored
  return servers?.[0]?.id ?? stored
}

export function useContinueWatching(serverId?: string) {
  return useQuery({
    queryKey: qk.continueWatching(serverId ?? ''),
    queryFn: () => ds().continueWatching(serverId!),
    enabled: !!serverId,
  })
}

export function useRecentlyAdded(serverId?: string) {
  return useQuery({
    queryKey: qk.recentlyAdded(serverId ?? ''),
    queryFn: () => ds().recentlyAdded(serverId!),
    enabled: !!serverId,
  })
}

export function useHomeSections(serverId?: string) {
  return useQuery({
    queryKey: qk.homeSections(serverId ?? ''),
    queryFn: () => ds().homeSections(serverId!),
    enabled: !!serverId,
  })
}

export function useViewSection(serverId: string | undefined, viewId: string) {
  return useQuery({
    queryKey: qk.viewSection(serverId ?? '', viewId),
    queryFn: () => ds().viewSection(serverId!, viewId),
    enabled: !!serverId && !!viewId,
  })
}

export function useLibrary(serverId: string | undefined, kind: MediaKind) {
  return useQuery({
    queryKey: qk.library(serverId ?? '', kind),
    queryFn: () => ds().library(serverId!, kind),
    enabled: !!serverId,
  })
}

export function useMediaItem(serverId: string | undefined, itemId: string) {
  return useQuery({
    queryKey: qk.item(serverId ?? '', itemId),
    queryFn: () => ds().item(serverId!, itemId),
    enabled: !!serverId && !!itemId,
  })
}

export function useEpisodes(serverId: string | undefined, seriesId?: string) {
  return useQuery({
    queryKey: qk.episodes(serverId ?? '', seriesId ?? ''),
    queryFn: () => ds().episodes(serverId!, seriesId!),
    enabled: !!serverId && !!seriesId,
  })
}

export function useSearch(serverId: string | undefined, term: string) {
  return useQuery({
    queryKey: qk.search(serverId ?? '', term),
    queryFn: () => ds().search(serverId!, term),
    enabled: !!serverId,
  })
}

export function useAddServer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: ServerInput) => ds().addServer(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.servers }),
  })
}

export function useRemoveServer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (serverId: string) => ds().removeServer(serverId),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.servers }),
  })
}

// ---- Danmaku ----

export function useDanmakuProviders() {
  return useQuery({ queryKey: qk.danmakuProviders, queryFn: () => dds().listProviders() })
}

export function useDanmakuConfigs() {
  return useQuery({ queryKey: qk.danmakuConfigs, queryFn: () => dds().listConfigs() })
}

/** Toggling or reordering a source changes its persisted config and the live
 * registry, so refresh configs/providers and drop stale search results. */
function useProviderConfigMutation<TArgs>(fn: (args: TArgs) => Promise<ProviderConfig[]>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: (configs) => {
      qc.setQueryData(qk.danmakuConfigs, configs)
      qc.invalidateQueries({ queryKey: qk.danmakuProviders })
      qc.invalidateQueries({ queryKey: ['danmakuSearch'] })
    },
  })
}

export function useSetProviderEnabled() {
  return useProviderConfigMutation((args: { id: string; enabled: boolean }) =>
    dds().setProviderEnabled(args.id, args.enabled),
  )
}

export function useReorderProviders() {
  return useProviderConfigMutation((orderedIds: string[]) => dds().reorderProviders(orderedIds))
}

/** Auto-match the playing item to a danmaku track (cache-first in Main). */
export function useDanmakuTrack(input?: DanmakuMatchInput) {
  return useQuery({
    queryKey: qk.danmakuTrack(input?.serverId ?? '', input?.embyItemId ?? ''),
    queryFn: () => dds().autoMatch(input!),
    enabled: !!input,
    staleTime: 5 * 60 * 1000,
  })
}

export function useDanmakuSearch(keyword: string) {
  return useQuery({
    queryKey: qk.danmakuSearch(keyword),
    queryFn: () => dds().searchAll(keyword),
    enabled: keyword.trim().length > 0,
  })
}

export function useDanmakuEpisodes(provider?: DanmakuProvider, seasonId?: string) {
  return useQuery({
    queryKey: qk.danmakuEpisodes(provider ?? '', seasonId ?? ''),
    queryFn: () => dds().episodes(provider!, seasonId!),
    enabled: !!provider && !!seasonId,
  })
}

export function useFetchManualDanmaku() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (args: ManualFetchArgs) => dds().fetchManual(args),
    onSuccess: (_data, args) =>
      qc.invalidateQueries({ queryKey: qk.danmakuTrack(args.serverId, args.embyItemId) }),
  })
}
