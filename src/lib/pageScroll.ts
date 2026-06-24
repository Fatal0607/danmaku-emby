interface ScrollTarget {
  scrollTop: number
  scrollLeft: number
  scrollTo: (options: ScrollToOptions) => void
}

interface ScrollRoot {
  querySelector: (selector: string) => ScrollTarget | null
}

interface WindowScroller {
  scrollTo: (options: ScrollToOptions) => void
}

export function scrollAppContentToTop(
  root: ScrollRoot = document,
  win: WindowScroller = window,
  behavior: ScrollBehavior = 'auto',
): void {
  const options: ScrollToOptions = { top: 0, left: 0, behavior }
  const shellScroller = root.querySelector('.app-content')
  if (shellScroller) {
    shellScroller.scrollTo(options)
    // Instant resets also clear the raw offsets so route changes land at the top
    // right away; smooth scrolls let the browser animate down to 0 on its own.
    if (behavior === 'auto') {
      shellScroller.scrollTop = 0
      shellScroller.scrollLeft = 0
    }
    return
  }

  win.scrollTo(options)
}
