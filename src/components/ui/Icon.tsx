import type { CSSProperties } from 'react'

type IconName =
  | 'home'
  | 'film'
  | 'tv'
  | 'sparkle'
  | 'search'
  | 'settings'
  | 'play'
  | 'pause'
  | 'plus'
  | 'chevron-down'
  | 'chevron-left'
  | 'chevron-right'
  | 'danmaku'
  | 'volume'
  | 'fullscreen'
  | 'next'
  | 'star'
  | 'check'
  | 'back'

const PATHS: Record<IconName, JSX.Element> = {
  home: (
    <>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.3V20h14V9.3" />
    </>
  ),
  film: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <path d="M7 4v16M17 4v16M3 9h4M17 9h4M3 15h4M17 15h4" />
    </>
  ),
  tv: (
    <>
      <rect x="2.5" y="5" width="19" height="13" rx="2.5" />
      <path d="M8 21h8M12 18v3" />
    </>
  ),
  sparkle: <path d="M12 3l2.2 5.6L20 10l-5.8 1.4L12 17l-2.2-5.6L4 10l5.8-1.4z" />,
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" />
    </>
  ),
  play: <path d="M7 4.5v15l13-7.5z" fill="currentColor" stroke="none" />,
  pause: <path d="M8 4.5v15M16 4.5v15" />,
  plus: <path d="M12 5v14M5 12h14" />,
  'chevron-down': <path d="m6 9 6 6 6-6" />,
  'chevron-left': <path d="m15 6-6 6 6 6" />,
  'chevron-right': <path d="m9 6 6 6-6 6" />,
  danmaku: (
    <>
      <rect x="2.5" y="5" width="19" height="13" rx="3" />
      <path d="M6 10h7M6 13.5h4M14 13.5h4" />
    </>
  ),
  volume: (
    <>
      <path d="M4 9v6h3l5 4V5L7 9z" />
      <path d="M16 9a4 4 0 0 1 0 6" />
    </>
  ),
  fullscreen: <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />,
  next: (
    <>
      <path d="M5 4.5v15l11-7.5z" fill="currentColor" stroke="none" />
      <path d="M18 4.5v15" />
    </>
  ),
  star: (
    <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 17l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7" />,
  back: <path d="M11 5l-7 7 7 7M4 12h16" />,
}

export function Icon({
  name,
  size = 18,
  color = 'currentColor',
  strokeWidth = 1.7,
  style,
}: {
  name: IconName
  size?: number
  color?: string
  strokeWidth?: number
  style?: CSSProperties
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flex: 'none', ...style }}
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  )
}
