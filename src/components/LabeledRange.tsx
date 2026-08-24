interface Props {
  label: string
  value: number
  min: number
  max: number
  onChange: (value: number) => void
}

export default function LabeledRange({ label, value, min, max, onChange }: Props) {
  return (
    <label
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) 5.5ch',
        gridTemplateRows: 'auto auto',
        columnGap: 8,
        rowGap: 4,
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
          color: '#6b7280',
          fontWeight: 500,
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 12,
          fontVariantNumeric: 'tabular-nums',
          textAlign: 'right',
          color: '#6b7280',
          whiteSpace: 'nowrap',
          letterSpacing: '0.05em',
        }}
      >
        {value}°
      </span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="accent-amber-500"
        style={{ gridColumn: '1 / -1', width: '100%', minWidth: 0, margin: 0 }}
      />
    </label>
  )
}
