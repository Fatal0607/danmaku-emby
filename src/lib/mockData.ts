import type { Server, MediaItem, Episode, DanmakuComment } from '@shared/types/domain'
import type { CommentEntity } from '@shared/types/danmaku'

export const servers: Server[] = [
  {
    id: 'living-room',
    name: '客厅影院',
    address: 'emby.local:8096',
    initial: '客',
    accentFrom: '#3a82f7',
    accentTo: '#6a5bff',
    status: 'connected',
    itemCount: 1284,
  },
  {
    id: 'study-nas',
    name: '书房 NAS',
    address: '192.168.1.12',
    initial: '书',
    accentFrom: '#2a8f6a',
    accentTo: '#1f6f9c',
    status: 'connected',
    itemCount: 642,
  },
  {
    id: 'office-remote',
    name: '远程·办公室',
    address: 'office.example.com',
    initial: '远',
    accentFrom: '#3a3f47',
    accentTo: '#2a2e35',
    status: 'offline',
  },
]

const G = {
  blue: ['#1d3a6e', '#0e1b3a'] as [string, string],
  rose: ['#5a2746', '#26101f'] as [string, string],
  teal: ['#2a5f57', '#102420'] as [string, string],
  violet: ['#4a3a6e', '#1c1530'] as [string, string],
  amber: ['#6e5326', '#2e2110'] as [string, string],
  cyan: ['#1f5a6e', '#0e2630'] as [string, string],
}

export const catalog: MediaItem[] = [
  {
    id: 'sea-beyond',
    title: '星海彼端',
    originalTitle: 'Beyond the Star Sea',
    kind: 'movie',
    year: 2024,
    rating: 8.9,
    genres: ['科幻', '悬疑', '2024'],
    poster: G.blue,
    overview:
      '一支深空勘探队在信号尽头发现了不该存在的回响。当通讯延迟拉长成永恒,他们必须在记忆与真相之间做出抉择。',
    progress: 0.42,
    episodeLabel: '继续观看',
    durationLabel: '47:08',
    quality: '4K HDR',
    danmaku: { status: 'matched', count: 12480, provider: '弹弹play' },
  },
  {
    id: 'fog-harbor',
    title: '雾港谜案',
    kind: 'series',
    year: 2023,
    rating: 8.4,
    genres: ['悬疑', '犯罪', '2023'],
    poster: G.rose,
    overview: '雾气弥漫的港口城市,一桩旧案牵出整座城的秘密。',
    progress: 0.18,
    episodeLabel: '第 7 集',
    durationLabel: '12:34 / 47:08',
    quality: '1080p',
    danmaku: { status: 'matching' },
  },
  {
    id: 'sakura-plan',
    title: '樱时计划',
    kind: 'anime',
    year: 2024,
    rating: 9.1,
    genres: ['动画', '校园', '科幻'],
    poster: G.teal,
    overview: '当樱花再次飘落,被重置的时间线里藏着一个无法挽回的约定。',
    progress: 0.73,
    episodeLabel: '第 11 集',
    quality: '1080p',
    danmaku: { status: 'matched', count: 23910, provider: '弹弹play' },
  },
  {
    id: 'silver-poem',
    title: '银翼之诗',
    kind: 'movie',
    year: 2022,
    rating: 7.8,
    genres: ['动作', '赛博朋克'],
    poster: G.violet,
    overview: '霓虹之下,一名义体侦探追查吞噬记忆的黑市技术。',
    quality: '4K HDR',
    danmaku: { status: 'unmatched' },
  },
  {
    id: 'red-beacon',
    title: '赤色信标',
    kind: 'series',
    year: 2024,
    rating: 8.0,
    genres: ['惊悚', '末日'],
    poster: G.amber,
    overview: '末日余烬中,唯一闪烁的信标指向人类最后的庇护所。',
    danmaku: { status: 'matched', count: 8210, provider: '弹弹play' },
  },
  {
    id: 'deep-current',
    title: '深流之下',
    kind: 'movie',
    year: 2021,
    rating: 7.5,
    genres: ['剧情', '海洋'],
    poster: G.cyan,
    overview: '深海科考站的孤独守望者,听见了来自更深处的呼唤。',
    danmaku: { status: 'unmatched' },
  },
]

export const episodes: Episode[] = Array.from({ length: 12 }, (_, i) => ({
  id: `ep-${i + 1}`,
  number: i + 1,
  title: i === 6 ? '回响' : `第 ${i + 1} 话`,
  duration: '24:30',
  poster: [G.teal, G.violet, G.blue, G.rose][i % 4] as [string, string],
  watched: i < 6,
  progress: i === 6 ? 0.26 : undefined,
  danmaku: i < 9 ? 'matched' : i === 9 ? 'matching' : 'unmatched',
  danmakuCount: i < 9 ? 1800 + i * 240 : undefined,
}))

const DM_COLORS = ['#ffffff', '#5b9bff', '#1fc77c', '#f0b042', '#ff8fb0', '#c8a8ff']
const DM_TEXTS = [
  '前方高能',
  '这一段封神了',
  '泪目了家人们',
  'BGM 太顶了',
  '名场面 +1',
  '考古的扣 1',
  '画质绝绝子',
  '弹幕护体',
  '导演牛',
  '这转折我没想到',
  '2024 还在看',
  '此处应有掌声',
  '细节拉满',
  '第三遍刷了',
  '高糖预警',
]

export const danmakuStream: DanmakuComment[] = Array.from({ length: 60 }, (_, i) => ({
  id: `dm-${i}`,
  timeSec: i * 1.4,
  text: DM_TEXTS[i % DM_TEXTS.length],
  color: DM_COLORS[i % DM_COLORS.length],
  lane: i % 7,
  mode: i % 11 === 0 ? 'top' : i % 13 === 0 ? 'bottom' : 'scroll',
}))

// Canonical `{p,m}` mock track for the browser preview. Spans a full 47-minute
// runtime so the time-synced overlay shows comments wherever the playhead sits.
const DM_COLOR_DECIMALS = DM_COLORS.map((hex) => parseInt(hex.slice(1), 16))
const MOCK_TRACK_DURATION = 2828

export const mockDanmakuComments: CommentEntity[] = Array.from({ length: 1200 }, (_, i) => {
  const timeSec = ((i + Math.random() * 0.6) / 1200) * MOCK_TRACK_DURATION
  const mode = i % 23 === 0 ? 5 : i % 29 === 0 ? 4 : 1
  const color = DM_COLOR_DECIMALS[i % DM_COLOR_DECIMALS.length]
  return { p: `${timeSec.toFixed(2)},${mode},${color},mock`, m: DM_TEXTS[i % DM_TEXTS.length] }
})
