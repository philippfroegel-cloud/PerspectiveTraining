import { useEffect, useRef, useState } from 'react'

const BLACK_CROSSHAIR_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 16 16'><path d='M8 1v14M1 8h14' stroke='black' stroke-width='1.5' stroke-linecap='round'/></svg>"
)}") 8 8, crosshair`

interface Props {
  enabled: boolean
  width: number
  height: number
  clearTrigger?: number
  onPrint?: () => void
}

export default function DrawingCanvas({ enabled, width, height, clearTrigger, onPrint }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null)
  const drawingRef = useRef(false)
  const activePointerIdRef = useRef<number | null>(null)
  const [eraserMode, setEraserMode] = useState(false)
  const [hasDrawn, setHasDrawn] = useState(false)

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

  const toCanvasPoint = (canvas: HTMLCanvasElement, clientX: number, clientY: number) => {
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    }
  }

  const applyBrushStyle = () => {
    const ctx = ctxRef.current
    if (!ctx) return
    if (eraserMode) {
      ctx.globalCompositeOperation = 'destination-out'
      ctx.strokeStyle = 'rgba(0,0,0,1)'
      ctx.fillStyle = 'rgba(0,0,0,1)'
      ctx.lineWidth = ERASER_SIZE
    } else {
      ctx.globalCompositeOperation = 'source-over'
      ctx.strokeStyle = '#ef4444'
      ctx.fillStyle = '#ef4444'
      ctx.lineWidth = PEN_SIZE
    }
  }

  const clearCanvas = () => {
    const canvas = canvasRef.current
    const ctx = ctxRef.current
    if (!canvas || !ctx) return
    ctx.globalCompositeOperation = 'source-over'
    ctx.clearRect(0, 0, canvas.width, canvas.height)
  }

  // Native pointer listeners so we can preventDefault on touch/stylus (stops scroll/pan).
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !enabled) return

    const isPrimaryPointer = (event: PointerEvent) => {
      if (event.pointerType === 'mouse') return event.button === 0
      return true
    }

    const stampPoint = (ctx: CanvasRenderingContext2D, x: number, y: number) => {
      applyBrushStyle()
      ctx.beginPath()
      ctx.arc(x, y, (eraserMode ? ERASER_SIZE : PEN_SIZE) / 2, 0, Math.PI * 2)
      ctx.fill()
    }

    const onPointerDown = (event: PointerEvent) => {
      if (!isPrimaryPointer(event)) return
      if (activePointerIdRef.current !== null) return

      const ctx = ctxRef.current
      if (!ctx) return

      event.preventDefault()
      setHasDrawn(true)

      const point = toCanvasPoint(canvas, event.clientX, event.clientY)
      stampPoint(ctx, point.x, point.y)
      applyBrushStyle()
      ctx.beginPath()
      ctx.moveTo(point.x, point.y)
      drawingRef.current = true
      activePointerIdRef.current = event.pointerId
      canvas.setPointerCapture(event.pointerId)
    }

    const onPointerMove = (event: PointerEvent) => {
      if (!drawingRef.current || event.pointerId !== activePointerIdRef.current) return

      const ctx = ctxRef.current
      if (!ctx) return

      event.preventDefault()
      const point = toCanvasPoint(canvas, event.clientX, event.clientY)
      ctx.lineTo(point.x, point.y)
      ctx.stroke()
    }

    const finishStroke = (event: PointerEvent) => {
      if (event.pointerId !== activePointerIdRef.current) return

      const ctx = ctxRef.current
      if (!ctx) return

      drawingRef.current = false
      activePointerIdRef.current = null
      ctx.closePath()

      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId)
      }
    }

    canvas.addEventListener('pointerdown', onPointerDown, { passive: false })
    canvas.addEventListener('pointermove', onPointerMove, { passive: false })
    canvas.addEventListener('pointerup', finishStroke)
    canvas.addEventListener('pointercancel', finishStroke)

    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', finishStroke)
      canvas.removeEventListener('pointercancel', finishStroke)
    }
  }, [enabled, eraserMode, width, height])

  // Reset drawing whenever perspective is randomized.
  useEffect(() => {
    clearCanvas()
    setEraserMode(false)
    setHasDrawn(false)
    drawingRef.current = false
    activePointerIdRef.current = null
  }, [clearTrigger])

  return (
    <div className="absolute inset-0" style={{ zIndex: 10 }}>
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: enabled ? 'auto' : 'none',
          cursor: enabled ? BLACK_CROSSHAIR_CURSOR : 'default',
          touchAction: 'none',
          userSelect: 'none',
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
            className="px-3 py-1 rounded bg-gray-100 border border-gray-300 text-gray-700 text-sm hover:bg-gray-200"
          >
            Clear
          </button>
          <button
            onClick={onPrint}
            className="px-3 py-1 rounded bg-gray-100 border border-gray-300 text-gray-700 text-sm hover:bg-gray-200"
          >
            Print
          </button>
        </div>
      )}
      {enabled && !hasDrawn && (
        <div
          className="no-print absolute top-4 right-4 px-3 py-1 rounded-full bg-white/90 border border-gray-300 text-xs text-gray-600"
          style={{ pointerEvents: 'none', zIndex: 20 }}
        >
          Touch or drag to draw
        </div>
      )}
    </div>
  )
}
