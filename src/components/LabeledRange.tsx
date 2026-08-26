interface Props {
  label: string
  value: number
  min: number
  max: number
  onChange: (value: number) => void
  compact?: boolean
  locked?: boolean
  onToggleLock?: () => void
}

function LockGlyph({ locked }: { locked: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="12"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3.5" y="7.5" width="9" height="6.5" rx="1.2" />
      {locked ? (
        <path d="M5.5 7.5V5.5a2.5 2.5 0 0 1 5 0v2" />
      ) : (
        <path d="M5.5 7.5V5.5a2.5 2.5 0 0 1 5 0" />
      )}
    </svg>
  )
}

export default function LabeledRange({
  label,
  value,
  min,
  max,
  onChange,
  compact = false,
  locked = false,
  onToggleLock,
}: Props) {
  const labelColor = locked ? '#d97706' : '#6b7280'
  const lockTitle = locked
    ? 'Unlock — Next Perspective may change this value.'
    : 'Lock — Next Perspective will keep this value.'

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: onToggleLock ? 'minmax(0, 1fr) auto' : 'minmax(0, 1fr) 5.5ch',
        gridTemplateRows: 'auto auto',
        columnGap: 8,
        rowGap: compact ? 3 : 4,
        minWidth: 0,
        width: '100%',
        alignItems: 'baseline',
      }}
    >
      <span
        style={{
          fontSize: 12,
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
          color: labelColor,
          fontWeight: 500,
          whiteSpace: 'nowrap',
          lineHeight: 1,
        }}
      >
        {label}
      </span>
      <span
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: 2,
          fontSize: 12,
          fontVariantNumeric: 'tabular-nums',
          color: labelColor,
          whiteSpace: 'nowrap',
          letterSpacing: '0.05em',
          lineHeight: 1,
        }}
      >
        {onToggleLock ? (
          <button
            type="button"
            title={lockTitle}
            aria-label={locked ? `Unlock ${label}` : `Lock ${label}`}
            aria-pressed={locked}
            onClick={onToggleLock}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              margin: 0,
              padding: 0,
              border: 0,
              background: 'transparent',
              color: labelColor,
              opacity: locked ? 1 : 0.55,
            }}
          >
            <LockGlyph locked={locked} />
          </button>
        ) : null}
        {value}°
      </span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className={locked ? 'range-locked' : undefined}
        style={{
          gridColumn: '1 / -1',
          width: '100%',
          minWidth: 0,
          margin: 0,
          ['--range-progress' as string]: `${max === min ? 0 : ((value - min) / (max - min)) * 100}%`,
        }}
      />
    </div>
  )
}
