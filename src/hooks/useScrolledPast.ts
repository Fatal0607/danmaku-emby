import { useEffect, useState } from 'react'

const SCROLLER_SELECTOR = '.app-content'

/**
 * Tracks whether the in-shell scroll container (`.app-content`) has been
 * scrolled past `threshold` pixels. Returns `false` outside the app shell.
 */
export function useScrolledPast(threshold: number): boolean {
  const [isPast, setIsPast] = useState(false)

  useEffect(() => {
    const scroller = document.querySelector(SCROLLER_SELECTOR)
    if (!scroller) return

    let frame = 0
    const sync = () => {
      frame = 0
      setIsPast(scroller.scrollTop > threshold)
    }
    const onScroll = () => {
      if (frame) return
      frame = requestAnimationFrame(sync)
    }

    sync()
    scroller.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      scroller.removeEventListener('scroll', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [threshold])

  return isPast
}
