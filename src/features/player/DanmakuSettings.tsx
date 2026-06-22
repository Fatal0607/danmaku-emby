import { Icon } from '@/components/ui/Icon'
import { Slider, Toggle, Segmented } from '@/components/ui/primitives'
import { useUI } from '@/lib/store'
import './danmaku-settings.css'

export function DanmakuSettings({ onClose }: { onClose: () => void }) {
  const { danmaku, setDanmaku } = useUI()

  return (
    <div className="dm-settings" role="dialog" aria-label="弹幕设置">
      <div className="dm-settings-head">
        <div className="dm-settings-title">
          <Icon name="danmaku" size={18} color="var(--accent-bright)" />
          弹幕设置
        </div>
        <button className="dm-settings-close" onClick={onClose} aria-label="关闭">
          <Icon name="chevron-down" size={16} color="var(--text-muted)" />
        </button>
      </div>

      <div className="dm-settings-row dm-settings-toggle">
        <div>
          <div className="dm-settings-label">显示弹幕</div>
          <div className="dm-settings-hint">弹弹play · 12,480 条</div>
        </div>
        <Toggle
          checked={danmaku.enabled}
          onChange={(v) => setDanmaku({ enabled: v })}
          label="显示弹幕"
        />
      </div>

      <div className="dm-settings-divider" />

      <div className="dm-settings-row">
        <Slider
          label="不透明度"
          valueLabel={`${Math.round(danmaku.opacity * 100)}%`}
          value={danmaku.opacity}
          onChange={(v) => setDanmaku({ opacity: v })}
        />
      </div>
      <div className="dm-settings-row">
        <Slider
          label="字号"
          valueLabel={`${danmaku.fontScale.toFixed(2)}×`}
          value={(danmaku.fontScale - 0.5) / 1}
          onChange={(v) => setDanmaku({ fontScale: 0.5 + v })}
        />
      </div>
      <div className="dm-settings-row">
        <Slider
          label="速度"
          valueLabel={`${danmaku.speed.toFixed(1)}×`}
          value={(danmaku.speed - 0.5) / 1.5}
          onChange={(v) => setDanmaku({ speed: 0.5 + v * 1.5 })}
        />
      </div>
      <div className="dm-settings-row">
        <Slider
          label="密度"
          valueLabel={`${Math.round(danmaku.density * 100)}%`}
          value={danmaku.density}
          onChange={(v) => setDanmaku({ density: v })}
        />
      </div>

      <div className="dm-settings-divider" />

      <div className="dm-settings-row">
        <div className="dm-settings-label" style={{ marginBottom: 10 }}>
          显示区域
        </div>
        <Segmented
          value={danmaku.area}
          onChange={(v) => setDanmaku({ area: v })}
          options={[
            { value: 'top', label: '顶部' },
            { value: 'half', label: '半屏' },
            { value: 'full', label: '全屏' },
          ]}
        />
      </div>
    </div>
  )
}
