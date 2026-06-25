import { describe, expect, test } from 'vitest'
import { continueWatchingLiveQueryOptions } from '@/lib/queries'

describe('continue watching query behavior', () => {
  test('always refetches the latest Emby history when home is revisited or focused', () => {
    expect(continueWatchingLiveQueryOptions).toMatchObject({
      staleTime: 0,
      gcTime: 0,
      refetchOnMount: 'always',
      refetchOnWindowFocus: 'always',
      refetchOnReconnect: 'always',
    })
  })
})
