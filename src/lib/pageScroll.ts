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

const TOP_LEFT: ScrollToOptions = { top: 0, left: 0, behavior: 'auto' }

export function scrollAppContentToTop(
  root: ScrollRoot = document,
  win: WindowScroller = window,
): void {
  const shellScroller = root.querySelector('.app-content')
  if (shellScroller) {
    shellScroller.scrollTo(TOP_LEFT)
    shellScroller.scrollTop = 0
    shellScroller.scrollLeft = 0
    return
  }

  win.scrollTo(TOP_LEFT)
}
