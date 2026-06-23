export type RailScrollDirection = 'left' | 'right'

const MIN_SCROLL_DISTANCE = 240
const VISIBLE_PAGE_RATIO = 0.82

export function scrollRailByPage(rail: HTMLElement | null, direction: RailScrollDirection): void {
  if (!rail) return
  const distance = Math.max(MIN_SCROLL_DISTANCE, Math.round(rail.clientWidth * VISIBLE_PAGE_RATIO))
  rail.scrollBy({
    left: direction === 'left' ? -distance : distance,
    behavior: 'smooth',
  })
}
