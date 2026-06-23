import type { MediaItem, MediaSection } from '@shared/types/domain'
import type { EmbyItemType, EmbyView, ItemsQuery } from '@shared/types/emby'

const DEFAULT_HOME_ITEM_TYPES: EmbyItemType[] = ['Movie', 'Series', 'Episode', 'Video']
export const VIEW_SECTION_PAGE_SIZE = 100

export function homeItemTypesForView(view: EmbyView): EmbyItemType[] {
  switch (view.collectionType) {
    case 'movies':
      return ['Movie', 'Video']
    case 'tvshows':
      return ['Series']
    case 'homevideos':
      return ['Video', 'Movie']
    default:
      return DEFAULT_HOME_ITEM_TYPES
  }
}

export function buildHomeSectionQuery(
  serverId: string,
  view: EmbyView,
  limit = 20,
): ItemsQuery {
  return {
    serverId,
    parentId: view.id,
    recursive: true,
    includeItemTypes: homeItemTypesForView(view),
    sortBy: 'DateCreated',
    sortOrder: 'Descending',
    limit,
  }
}

export function buildViewSectionQuery(
  serverId: string,
  view: EmbyView,
  startIndex = 0,
  limit = VIEW_SECTION_PAGE_SIZE,
): ItemsQuery {
  return {
    ...buildHomeSectionQuery(serverId, view, limit),
    startIndex,
  }
}

export function toMediaSection(view: EmbyView, items: MediaItem[]): MediaSection {
  return {
    id: view.id,
    title: view.name,
    collectionType: view.collectionType,
    items,
  }
}
