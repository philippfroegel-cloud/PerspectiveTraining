import type { Shape } from '../shapes/shapes'

interface Props {
  shape: Shape
  gridSize: number
  showShape: boolean
}

export default function FlatView({ shape, gridSize, showShape }: Props) {
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

  return (
    <div className="flex items-center justify-center w-full h-full">
      <svg
        viewBox={`-20 -20 ${size + 40} ${size + 40}`}
        width={size} height={size}
        style={{ display: 'block', maxWidth: '100%', maxHeight: '100%' }}
      >
        <defs>
          <clipPath id="grid-clip">
            <rect x={0} y={0} width={size} height={size} />
          </clipPath>
        </defs>

        {showShape && (
          <image
            href={shape.imagePath}
            x={0} y={0}
            width={size} height={size}
            preserveAspectRatio="xMidYMid meet"
            clipPath="url(#grid-clip)"
            opacity={0.6}
          />
        )}
        {gridLines}
        {/* Orientation cues: bolder bottom edge + small bottom-left marker */}
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
