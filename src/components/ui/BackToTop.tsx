import { useScrolledPast } from '@/hooks/useScrolledPast'
import { scrollAppContentToTop } from '@/lib/pageScroll'
import { Icon } from './Icon'
import './back-to-top.css'

const SHOW_AFTER_PX = 300

/** Floating control that scrolls the shell content back to the top once the
 *  user has scrolled a meaningful distance down the page. */
export function BackToTop() {
  const visible = useScrolledPast(SHOW_AFTER_PX)

  return (
    <button
      type="button"
      className={`back-to-top${visible ? ' is-visible' : ''}`}
      onClick={() => scrollAppContentToTop(document, window, 'smooth')}
      aria-label="返回顶部"
      aria-hidden={!visible}
      tabIndex={visible ? 0 : -1}
    >
      <Icon name="arrow-up" size={20} color="#fff" />
    </button>
  )
}
