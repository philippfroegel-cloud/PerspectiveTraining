import { useId } from 'react'
import { shapes, type Shape } from '../shapes/shapes'
import { IDENTITY_SHAPE_POSE, type ShapePose } from '../utils/shapePose'

interface Props {
  shape?: Shape
  gridSize: number
  showShape?: boolean
  gridOnly?: boolean
  shapePose?: ShapePose
}

export default function FlatView({
  shape,
  gridSize,
  showShape = false,
  gridOnly = false,
  shapePose = IDENTITY_SHAPE_POSE,
}: Props) {
  const clipId = useId().replace(/:/g, '')
  const size = 500
  // Outer strokes are centered on the path. Inset so the right/bottom
  // outlines are not clipped by viewBox 0 0 size size.
  const gridOrigin = 1.5
  const gridSpan = size - gridOrigin * 2
  const cellSize = gridSpan / gridSize
  const imageSize = gridSpan * shapePose.scale
  const imageX = gridOrigin + shapePose.cx * gridSpan - imageSize / 2
  const imageY = gridOrigin + (1 - shapePose.cy) * gridSpan - imageSize / 2
  const rotateDeg = (shapePose.rotationRad * 180) / Math.PI
  const rotateOrigin = `${gridOrigin + shapePose.cx * gridSpan} ${gridOrigin + (1 - shapePose.cy) * gridSpan}`
  const gridEnd = gridOrigin + gridSpan

  const gridLines: React.ReactElement[] = []

  for (let i = 0; i <= gridSize; i++) {
    const x = gridOrigin + i * cellSize
    gridLines.push(
      <line key={`v-${i}`} x1={x} y1={gridOrigin} x2={x} y2={gridEnd}
        stroke="#d1d5db" strokeWidth={i === 0 || i === gridSize ? 1.5 : 0.75} />
    )
  }

  for (let i = 0; i <= gridSize; i++) {
    const y = gridOrigin + i * cellSize
    gridLines.push(
      <line key={`h-${i}`} x1={gridOrigin} y1={y} x2={gridEnd} y2={y}
        stroke="#d1d5db" strokeWidth={i === 0 || i === gridSize ? 1.5 : 0.75} />
    )
  }

  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="w-full h-full"
        style={{ display: 'block', maxWidth: '100%', maxHeight: '100%' }}
      >
        <defs>
          <clipPath id={clipId}>
            <rect x={gridOrigin} y={gridOrigin} width={gridSpan} height={gridSpan} />
          </clipPath>
        </defs>

        <g clipPath={`url(#${clipId})`}>
          {!gridOnly && shape && shapes.map(entry => {
            const active = entry.imagePath === shape.imagePath
            return (
              <image
                key={entry.id}
                href={entry.imagePath}
                x={imageX}
                y={imageY}
                width={imageSize}
                height={imageSize}
                preserveAspectRatio="xMidYMid meet"
                transform={`rotate(${rotateDeg} ${rotateOrigin})`}
                opacity={showShape && active ? 1 : 0}
                visibility={active ? 'visible' : 'hidden'}
              />
            )
          })}
        </g>
        {gridLines}
        <line
          x1={gridOrigin}
          y1={gridEnd}
          x2={gridEnd}
          y2={gridEnd}
          stroke="#4b5563"
          strokeWidth={2.5}
        />
        <polygon
          points={`${gridOrigin + 8},${gridEnd - 8} ${gridOrigin + 28},${gridEnd - 8} ${gridOrigin + 8},${gridEnd - 28}`}
          fill="#4b5563"
        />
      </svg>
    </div>
  )
}
