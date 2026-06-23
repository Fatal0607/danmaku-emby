import { describe, expect, test } from 'vitest'
import { scrollAppContentToTop } from '@/lib/pageScroll'

describe('scrollAppContentToTop', () => {
  test('resets the shell content scroller when it exists', () => {
    const calls: unknown[] = []
    const scroller = {
      scrollTop: 320,
      scrollLeft: 40,
      scrollTo: (options: unknown) => calls.push(options),
    }
    const root = {
      querySelector: (selector: string) => (selector === '.app-content' ? scroller : null),
    }
    const win = { scrollTo: () => calls.push('window') }

    scrollAppContentToTop(root, win)

    expect(calls).toEqual([{ top: 0, left: 0, behavior: 'auto' }])
    expect(scroller.scrollTop).toBe(0)
    expect(scroller.scrollLeft).toBe(0)
  })

  test('falls back to window scrolling outside the shell', () => {
    const calls: unknown[] = []
    const root = { querySelector: () => null }
    const win = { scrollTo: (options: unknown) => calls.push(options) }

    scrollAppContentToTop(root, win)

    expect(calls).toEqual([{ top: 0, left: 0, behavior: 'auto' }])
  })
})
