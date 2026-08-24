import { useId } from 'react'
import { shapes, type Shape } from '../shapes/shapes'

interface Props {
  shape?: Shape
  gridSize: number
  showShape?: boolean
  gridOnly?: boolean
}

export default function FlatView({ shape, gridSize, showShape = false, gridOnly = false }: Props) {
  const clipId = useId().replace(/:/g, '')
  const size = 500
  const cellSize = size / gridSize

  const gridLines: React.ReactElement[] = []

  for (let i = 0; i <= gridSize; i++) {
    const x = i * cellSize
    gridLines.push(
      <line key={`v-${i}`} x1={x} y1={0} x2={x} y2={size}
        stroke="#d1d5db" strokeWidth={i === 0 || i === gridSize ? 1.5 : 0.75} />
    )
  }

  for (let i = 0; i <= gridSize; i++) {
    const y = i * cellSize
    gridLines.push(
      <line key={`h-${i}`} x1={0} y1={y} x2={size} y2={y}
        stroke="#d1d5db" strokeWidth={i === 0 || i === gridSize ? 1.5 : 0.75} />
    )
  }

  const viewBox = gridOnly
    ? `0 0 ${size} ${size}`
    : `-20 -20 ${size + 40} ${size + 40}`

  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      <svg
        viewBox={viewBox}
        className="w-full h-full"
        style={{ display: 'block', maxWidth: '100%', maxHeight: '100%' }}
      >
        <defs>
          <clipPath id={clipId}>
            <rect x={0} y={0} width={size} height={size} />
          </clipPath>
        </defs>

        {!gridOnly && shape && shapes.map(entry => {
          const active = entry.imagePath === shape.imagePath
          return (
            <image
              key={entry.id}
              href={entry.imagePath}
              x={0}
              y={0}
              width={size}
              height={size}
              preserveAspectRatio="xMidYMid meet"
              clipPath={`url(#${clipId})`}
              opacity={showShape && active ? 0.6 : 0}
              visibility={active ? 'visible' : 'hidden'}
            />
          )
        })}
        {gridLines}
        <line
          x1={0}
          y1={size}
          x2={size}
          y2={size}
          stroke="#4b5563"
          strokeWidth={2.5}
        />
        <polygon
          points={`8,${size - 8} 28,${size - 8} 8,${size - 28}`}
          fill="#4b5563"
        />
      </svg>
    </div>
  )
}
