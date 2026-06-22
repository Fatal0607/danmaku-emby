import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ServerInput } from '@shared/types/emby'
import type { MediaKind } from '@shared/types/domain'
import { useUI } from './store'
import { getDataSource } from './dataSource'

// TanStack Query hooks over the DataSource (docs 01 §1.5: server state lives in
// TanStack Query, not the Zustand client store). Keys are namespaced by server.

const ds = () => getDataSource()

export const qk = {
  servers: ['servers'] as const,
  continueWatching: (s: string) => ['continueWatching', s] as const,
  recentlyAdded: (s: string) => ['recentlyAdded', s] as const,
  library: (s: string, k: MediaKind) => ['library', s, k] as const,
  item: (s: string, id: string) => ['item', s, id] as const,
  episodes: (s: string, id: string) => ['episodes', s, id] as const,
  search: (s: string, term: string) => ['search', s, term] as const,
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
