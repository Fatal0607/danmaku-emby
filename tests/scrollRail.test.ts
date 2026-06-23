import { describe, expect, test, vi } from 'vitest'
import { scrollRailByPage } from '@/lib/scrollRail'

describe('scrollRailByPage', () => {
  test('scrolls most of the visible rail width in the requested direction', () => {
    const scrollBy = vi.fn()
    const rail = { clientWidth: 1000, scrollBy } as unknown as HTMLElement

    scrollRailByPage(rail, 'right')
    scrollRailByPage(rail, 'left')

    expect(scrollBy).toHaveBeenNthCalledWith(1, { left: 820, behavior: 'smooth' })
    expect(scrollBy).toHaveBeenNthCalledWith(2, { left: -820, behavior: 'smooth' })
  })

  test('keeps a useful minimum distance for narrow rails', () => {
    const scrollBy = vi.fn()
    const rail = { clientWidth: 200, scrollBy } as unknown as HTMLElement

    scrollRailByPage(rail, 'right')

    expect(scrollBy).toHaveBeenCalledWith({ left: 240, behavior: 'smooth' })
  })
})
