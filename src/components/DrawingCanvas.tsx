import { forwardRef, useEffect, useRef, useState, type Ref, type MutableRefObject } from 'react'
import type { ProjectPointerToPlane } from '../utils/planeProjection'

const BLACK_CROSSHAIR_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 16 16'><path d='M8 1v14M1 8h14' stroke='black' stroke-width='1.5' stroke-linecap='round'/></svg>"
)}") 8 8, crosshair`

function mergeRefs<T>(...refs: Array<Ref<T> | undefined>) {
  return (value: T | null) => {
    for (const ref of refs) {
      if (!ref) continue
      if (typeof ref === 'function') ref(value)
      else (ref as MutableRefObject<T | null>).current = value
    }
  }
}

interface Props {
  enabled: boolean
  width: number
  height: number
  surface?: HTMLCanvasElement
  projectPointerRef?: MutableRefObject<ProjectPointerToPlane | null>
  clearTrigger?: number
  onPrint?: () => void
  onDraw?: () => void
  showPrint?: boolean
}

const DrawingCanvas = forwardRef<HTMLCanvasElement, Props>(function DrawingCanvas(
  { enabled, width, height, surface, projectPointerRef, clearTrigger, onPrint, onDraw, showPrint = true },
  ref,
) {
  const hostRef = useRef<HTMLDivElement>(null)
  const internalCanvasRef = useRef<HTMLCanvasElement>(null)
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null)
  const drawingRef = useRef(false)
  const activePointerIdRef = useRef<number | null>(null)
  const onDrawRef = useRef(onDraw)
  const eraserModeRef = useRef(false)
  const [eraserMode, setEraserMode] = useState(false)
  const [hasDrawn, setHasDrawn] = useState(false)

  onDrawRef.current = onDraw
  eraserModeRef.current = eraserMode
  const projectToPlane = Boolean(projectPointerRef)

  const PEN_SIZE = projectToPlane ? 6 : 3
  const ERASER_SIZE = projectToPlane ? 40 : 20

  const getCanvas = () => surface ?? internalCanvasRef.current

  const notifyDraw = () => onDrawRef.current?.()

  const applyCanvasPresentation = (canvas: HTMLCanvasElement) => {
    canvas.style.position = 'absolute'
    canvas.style.top = '0'
    canvas.style.left = '0'
    canvas.style.width = '100%'
    canvas.style.height = '100%'
    canvas.style.touchAction = 'none'
    canvas.style.userSelect = 'none'
    if (projectToPlane) {
      canvas.style.opacity = '0'
      canvas.style.pointerEvents = 'none'
    } else {
      canvas.style.opacity = '1'
      canvas.style.pointerEvents = enabled ? 'auto' : 'none'
      canvas.style.cursor = enabled ? BLACK_CROSSHAIR_CURSOR : 'default'
    }
  }

  useEffect(() => {
    if (!surface) return
    const host = hostRef.current
    if (!host) return
    applyCanvasPresentation(surface)
    host.appendChild(surface)
    return () => {
      host.removeChild(surface)
    }
  }, [surface, enabled, projectToPlane])

  useEffect(() => {
    const canvas = getCanvas()
    if (!canvas) return
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctxRef.current = ctx
  }, [surface])

  useEffect(() => {
    const canvas = getCanvas()
    const ctx = ctxRef.current
    if (!canvas || !ctx || width <= 0 || height <= 0) return

    const prev = document.createElement('canvas')
    prev.width = canvas.width
    prev.height = canvas.height
    const prevCtx = prev.getContext('2d')
    if (prevCtx && canvas.width > 0 && canvas.height > 0) {
      prevCtx.drawImage(canvas, 0, 0)
    }

    canvas.width = width
    canvas.height = height

    const nextCtx = canvas.getContext('2d', { willReadFrequently: true })
    if (!nextCtx) return
    nextCtx.lineCap = 'round'
    nextCtx.lineJoin = 'round'
    if (prev.width > 0 && prev.height > 0) {
      nextCtx.drawImage(prev, 0, 0)
    }
    ctxRef.current = nextCtx
    notifyDraw()
  }, [width, height, surface])

  const toDrawPoint = (clientX: number, clientY: number) => {
    const canvas = getCanvas()
    if (!canvas) return null

    if (projectPointerRef) {
      return projectPointerRef.current?.(clientX, clientY, canvas.width, canvas.height) ?? null
    }

    const rect = canvas.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return null
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
    if (eraserModeRef.current) {
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
    const canvas = getCanvas()
    const ctx = ctxRef.current
    if (!canvas || !ctx) return
    ctx.globalCompositeOperation = 'source-over'
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasDrawn(false)
    notifyDraw()
  }

  useEffect(() => {
    const canvas = getCanvas()
    const host = hostRef.current
    const eventTarget = projectToPlane ? host : canvas
    if (!eventTarget || !canvas || !enabled) return

    const isPrimaryPointer = (event: PointerEvent) => {
      if (event.pointerType === 'mouse') return event.button === 0
      return true
    }

    const stampPoint = (ctx: CanvasRenderingContext2D, x: number, y: number) => {
      applyBrushStyle()
      ctx.beginPath()
      ctx.arc(x, y, (eraserModeRef.current ? ERASER_SIZE : PEN_SIZE) / 2, 0, Math.PI * 2)
      ctx.fill()
      notifyDraw()
    }

    const onPointerDown = (event: Event) => {
      const pointerEvent = event as PointerEvent
      if (!isPrimaryPointer(pointerEvent)) return
      if (activePointerIdRef.current !== null) return
      if (pointerEvent.target instanceof Element && pointerEvent.target.closest('button, [data-drawing-ui]')) return

      const ctx = ctxRef.current
      if (!ctx) return

      const point = toDrawPoint(pointerEvent.clientX, pointerEvent.clientY)
      if (!point) return

      pointerEvent.preventDefault()
      setHasDrawn(true)

      stampPoint(ctx, point.x, point.y)
      applyBrushStyle()
      ctx.beginPath()
      ctx.moveTo(point.x, point.y)
      drawingRef.current = true
      activePointerIdRef.current = pointerEvent.pointerId
      eventTarget.setPointerCapture(pointerEvent.pointerId)
    }

    const onPointerMove = (event: Event) => {
      const pointerEvent = event as PointerEvent
      if (!drawingRef.current || pointerEvent.pointerId !== activePointerIdRef.current) return

      const ctx = ctxRef.current
      if (!ctx) return

      const point = toDrawPoint(pointerEvent.clientX, pointerEvent.clientY)
      if (!point) return

      pointerEvent.preventDefault()
      ctx.lineTo(point.x, point.y)
      ctx.stroke()
      notifyDraw()
    }

    const finishStroke = (event: Event) => {
      const pointerEvent = event as PointerEvent
      if (pointerEvent.pointerId !== activePointerIdRef.current) return

      const ctx = ctxRef.current
      if (!ctx) return

      drawingRef.current = false
      activePointerIdRef.current = null
      ctx.closePath()

      if (eventTarget.hasPointerCapture(pointerEvent.pointerId)) {
        eventTarget.releasePointerCapture(pointerEvent.pointerId)
      }
    }

    eventTarget.addEventListener('pointerdown', onPointerDown, { passive: false })
    eventTarget.addEventListener('pointermove', onPointerMove, { passive: false })
    eventTarget.addEventListener('pointerup', finishStroke)
    eventTarget.addEventListener('pointercancel', finishStroke)

    return () => {
      eventTarget.removeEventListener('pointerdown', onPointerDown)
      eventTarget.removeEventListener('pointermove', onPointerMove)
      eventTarget.removeEventListener('pointerup', finishStroke)
      eventTarget.removeEventListener('pointercancel', finishStroke)
    }
  }, [enabled, eraserMode, width, height, surface, projectToPlane])

  useEffect(() => {
    if (clearTrigger === undefined) return
    const canvas = getCanvas()
    const ctx = ctxRef.current
    if (!canvas || !ctx) return
    ctx.globalCompositeOperation = 'source-over'
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setEraserMode(false)
    setHasDrawn(false)
    drawingRef.current = false
    activePointerIdRef.current = null
    notifyDraw()
  }, [clearTrigger, surface])

  return (
    <div
      ref={hostRef}
      className="absolute inset-0"
      style={{
        zIndex: 10,
        touchAction: 'none',
        userSelect: 'none',
        pointerEvents: projectToPlane && enabled ? 'auto' : 'none',
        cursor: projectToPlane && enabled ? BLACK_CROSSHAIR_CURSOR : 'default',
      }}
    >
      {!surface && (
        <canvas
          ref={mergeRefs(internalCanvasRef, ref)}
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
      )}
      {enabled && (
        <div
          className="no-print absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2"
          data-drawing-ui
          onPointerDown={event => event.stopPropagation()}
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
          {showPrint && onPrint && (
            <button
              onClick={onPrint}
              className="px-3 py-1 rounded bg-gray-100 border border-gray-300 text-gray-700 text-sm hover:bg-gray-200"
            >
              Print
            </button>
          )}
        </div>
      )}
      {enabled && !hasDrawn && (
        <div
          className="no-print draw-hint absolute top-5 right-5 px-5 py-2.5 rounded-full bg-white/95 border border-gray-300 text-base text-gray-700 shadow-sm"
          style={{ pointerEvents: 'none', zIndex: 20 }}
        >
          Draw here
        </div>
      )}
    </div>
  )
})

export default DrawingCanvas
