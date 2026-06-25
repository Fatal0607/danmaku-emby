import type { CSSProperties, ReactNode } from 'react'
import './primitives.css'

/* ---- Button ---- */
type ButtonVariant = 'primary' | 'secondary' | 'ghost'
export function Button({
  children,
  variant = 'primary',
  pulse,
  full,
  onClick,
  disabled,
  style,
}: {
  children: ReactNode
  variant?: ButtonVariant
  pulse?: boolean
  full?: boolean
  onClick?: () => void
  disabled?: boolean
  style?: CSSProperties
}) {
  return (
    <button
      className={`btn btn-${variant}${pulse ? ' btn-pulse' : ''}${full ? ' btn-full' : ''}`}
      onClick={onClick}
      disabled={disabled}
      style={style}
    >
      {children}
    </button>
  )
}

/* ---- Tag / pill ---- */
export function Tag({
  children,
  tone = 'neutral',
  dot,
}: {
  children: ReactNode
  tone?: 'neutral' | 'accent' | 'success' | 'warning'
  dot?: boolean
}) {
  return (
    <span className={`tag tag-${tone}`}>
      {dot && <span className="tag-dot" />}
      {children}
    </span>
  )
}

/* ---- Toggle ---- */
export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange?: (v: boolean) => void
  label?: string
}) {
  return (
    <button
      className={`toggle${checked ? ' toggle-on' : ''}`}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange?.(!checked)}
    >
      <span className="toggle-knob" />
    </button>
  )
}

/* ---- Slider ---- */
export function Slider({
  value,
  onChange,
  label,
  valueLabel,
}: {
  value: number // 0..1
  onChange?: (v: number) => void
  label?: string
  valueLabel?: string
}) {
  const pct = Math.round(value * 100)
  return (
    <div className="slider-row">
      {(label || valueLabel) && (
        <div className="slider-head">
          {label && <span>{label}</span>}
          {valueLabel && <span className="slider-val">{valueLabel}</span>}
        </div>
      )}
      <label className="slider">
        <div className="slider-track">
          <div className="slider-fill" style={{ width: `${pct}%` }} />
          <div className="slider-thumb" style={{ left: `${pct}%` }} />
        </div>
        <input
          type="range"
          min={0}
          max={100}
          value={pct}
          onChange={(e) => onChange?.(Number(e.target.value) / 100)}
          aria-label={label}
        />
      </label>
    </div>
  )
}

/* ---- Segmented control ---- */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[]
  value: T
  onChange?: (v: T) => void
}) {
  return (
    <div className="segmented" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={o.value === value}
          className={`segmented-item${o.value === value ? ' is-active' : ''}`}
          onClick={() => onChange?.(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/* ---- Glass panel ---- */
export function GlassPanel({
  children,
  style,
  className,
}: {
  children: ReactNode
  style?: CSSProperties
  className?: string
}) {
  return (
    <div className={`glass-panel${className ? ' ' + className : ''}`} style={style}>
      {children}
    </div>
  )
}
