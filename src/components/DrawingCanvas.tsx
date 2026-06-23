import { useEffect, useRef, useState } from 'react'

interface Props {
  enabled: boolean
  width: number
  height: number
  clearTrigger?: number
}

export default function DrawingCanvas({ enabled, width, height, clearTrigger }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null)
  const drawingRef = useRef(false)
  const [eraserMode, setEraserMode] = useState(false)

  const PEN_SIZE = 3
  const ERASER_SIZE = 20

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctxRef.current = ctx
  }, [])

  // Resize canvas while keeping existing strokes.
  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = ctxRef.current
    if (!canvas || !ctx || width <= 0 || height <= 0) return

    const prev = document.createElement('canvas')
    prev.width = canvas.width
    prev.height = canvas.height
    const prevCtx = prev.getContext('2d')
    if (prevCtx) prevCtx.drawImage(canvas, 0, 0)

    canvas.width = width
    canvas.height = height

    const nextCtx = canvas.getContext('2d')
    if (!nextCtx) return
    nextCtx.lineCap = 'round'
    nextCtx.lineJoin = 'round'
    nextCtx.drawImage(prev, 0, 0)
    ctxRef.current = nextCtx
  }, [width, height])

  const toCanvasPoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    }
  }

  const applyBrushStyle = () => {
    const ctx = ctxRef.current
    if (!ctx) return
    if (eraserMode) {
      // True eraser on the overlay only (does not affect perspective grid).
      ctx.globalCompositeOperation = 'destination-out'
      ctx.strokeStyle = 'rgba(0,0,0,1)'
      ctx.lineWidth = ERASER_SIZE
    } else {
      ctx.globalCompositeOperation = 'source-over'
      ctx.strokeStyle = '#ef4444'
      ctx.lineWidth = PEN_SIZE
    }
  }

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!enabled) return
    const ctx = ctxRef.current
    if (!ctx) return
    const point = toCanvasPoint(event)
    applyBrushStyle()
    ctx.beginPath()
    ctx.moveTo(point.x, point.y)
    drawingRef.current = true
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!enabled || !drawingRef.current) return
    const ctx = ctxRef.current
    if (!ctx) return
    const point = toCanvasPoint(event)
    ctx.lineTo(point.x, point.y)
    ctx.stroke()
  }

  const finishStroke = () => {
    const ctx = ctxRef.current
    if (!ctx) return
    drawingRef.current = false
    ctx.closePath()
  }

  const clearCanvas = () => {
    const canvas = canvasRef.current
    const ctx = ctxRef.current
    if (!canvas || !ctx) return
    ctx.globalCompositeOperation = 'source-over'
    ctx.clearRect(0, 0, canvas.width, canvas.height)
  }

  // Reset drawing whenever perspective is randomized.
  useEffect(() => {
    clearCanvas()
    setEraserMode(false)
  }, [clearTrigger])

  return (
    <div className="absolute inset-0" style={{ zIndex: 10 }}>
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishStroke}
        onPointerLeave={finishStroke}
        onPointerCancel={finishStroke}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: enabled ? 'auto' : 'none',
          cursor: enabled ? 'crosshair' : 'default',
        }}
      />
      {enabled && (
        <div
          className="no-print absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2"
          style={{ pointerEvents: 'auto', zIndex: 20 }}
        >
          <button
            onClick={() => setEraserMode(v => !v)}
            className="px-3 py-1 rounded bg-gray-100 border border-gray-300 text-gray-700 text-sm hover:bg-gray-200"
          >
            {eraserMode ? 'Pen' : 'Eraser'}
          </button>
          <button
            onClick={clearCanvas}
            className="px-3 py-1 rounded bg-red-100 border border-red-300 text-red-700 text-sm hover:bg-red-200"
          >
            Clear
          </button>
        </div>
      )}
    </div>
  )
}
