import { forwardRef, useEffect, useRef, useState, type Ref, type MutableRefObject } from 'react'
import type { ProjectPointerToPlane } from '../utils/planeProjection'

const BLACK_CROSSHAIR_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 16 16'><path d='M8 1v14M1 8h14' stroke='black' stroke-width='1.5' stroke-linecap='round'/></svg>"
)}") 8 8, crosshair`

const UNDO_LIMIT = 10
const DRAW_HINT_DELAY_MS = 2000

function cloneCanvas(source: HTMLCanvasElement) {
  const copy = document.createElement('canvas')
  copy.width = source.width
  copy.height = source.height
  const copyCtx = copy.getContext('2d')
  if (copyCtx) copyCtx.drawImage(source, 0, 0)
  return copy
}

function isInsideGrid(point: { x: number; y: number }, width: number, height: number) {
  return point.x >= 0 && point.x <= width && point.y >= 0 && point.y <= height
}

/** Liang–Barsky clip of a segment to the grid rectangle. */
function clipLineToGrid(
  a: { x: number; y: number },
  b: { x: number; y: number },
  width: number,
  height: number,
): { ax: number; ay: number; bx: number; by: number } | null {
  const dx = b.x - a.x
  const dy = b.y - a.y
  let t0 = 0
  let t1 = 1
  const clip = (p: number, q: number) => {
    if (p === 0) return q >= 0
    const r = q / p
    if (p < 0) {
      if (r > t1) return false
      if (r > t0) t0 = r
    } else {
      if (r < t0) return false
      if (r < t1) t1 = r
    }
    return true
  }
  if (!clip(-dx, a.x) || !clip(dx, width - a.x) || !clip(-dy, a.y) || !clip(dy, height - a.y)) {
    return null
  }
  return {
    ax: a.x + t0 * dx,
    ay: a.y + t0 * dy,
    bx: a.x + t1 * dx,
    by: a.y + t1 * dy,
  }
}

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
  dismissHintTrigger?: number
  onPrint?: () => void
  onDraw?: () => void
  showPrint?: boolean
}

const DrawingCanvas = forwardRef<HTMLCanvasElement, Props>(function DrawingCanvas(
  { enabled, width, height, surface, projectPointerRef, clearTrigger, dismissHintTrigger, onPrint, onDraw, showPrint = true },
  ref,
) {
  const hostRef = useRef<HTMLDivElement>(null)
  const internalCanvasRef = useRef<HTMLCanvasElement>(null)
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null)
  const drawingRef = useRef(false)
  const activePointerIdRef = useRef<number | null>(null)
  const strokeSnapshotRef = useRef<HTMLCanvasElement | null>(null)
  const strokePointsRef = useRef<Array<{ x: number; y: number }>>([])
  const strokeDrewRef = useRef(false)
  const undoStackRef = useRef<HTMLCanvasElement[]>([])
  const onDrawRef = useRef(onDraw)
  const eraserModeRef = useRef(false)
  const [eraserMode, setEraserMode] = useState(false)
  const [undoCount, setUndoCount] = useState(0)
  const [showDrawHint, setShowDrawHint] = useState(false)
  const hintDismissedRef = useRef(false)

  const dismissDrawHint = () => {
    hintDismissedRef.current = true
    setShowDrawHint(false)
  }

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

  const clearUndoStack = () => {
    undoStackRef.current = []
    setUndoCount(0)
  }

  const undoLastStroke = () => {
    if (drawingRef.current) return
    const host = hostRef.current
    if (host?.closest('.hidden')) return
    const canvas = getCanvas()
    const ctx = ctxRef.current
    const previous = undoStackRef.current.pop()
    if (!canvas || !ctx || !previous) return
    ctx.globalCompositeOperation = 'source-over'
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(previous, 0, 0)
    setUndoCount(undoStackRef.current.length)
    notifyDraw()
  }

  const clearCanvas = () => {
    const canvas = getCanvas()
    const ctx = ctxRef.current
    if (!canvas || !ctx) return
    ctx.globalCompositeOperation = 'source-over'
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    clearUndoStack()
    dismissDrawHint()
    notifyDraw()
  }

  useEffect(() => {
    const canvas = getCanvas()
    const host = hostRef.current
    const eventTarget = host?.closest('.drawing-pointer-root') ?? (projectToPlane ? host : canvas)
    if (!eventTarget || !canvas || !enabled) return

    const isPrimaryPointer = (event: PointerEvent) => {
      if (event.pointerType === 'mouse') return event.button === 0
      return true
    }

    const captureStrokeSnapshot = () => {
      const snapshot = document.createElement('canvas')
      snapshot.width = canvas.width
      snapshot.height = canvas.height
      const snapshotCtx = snapshot.getContext('2d')
      if (snapshotCtx) snapshotCtx.drawImage(canvas, 0, 0)
      strokeSnapshotRef.current = snapshot
    }

    const restoreStrokeSnapshot = (ctx: CanvasRenderingContext2D) => {
      const snapshot = strokeSnapshotRef.current
      ctx.globalCompositeOperation = 'source-over'
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      if (snapshot) ctx.drawImage(snapshot, 0, 0)
    }

    const redrawActiveStroke = (straight: boolean) => {
      const ctx = ctxRef.current
      const points = strokePointsRef.current
      if (!ctx || points.length === 0) return

      restoreStrokeSnapshot(ctx)
      applyBrushStyle()

      const width = canvas.width
      const height = canvas.height
      const radius = (eraserModeRef.current ? ERASER_SIZE : PEN_SIZE) / 2
      let drew = false

      if (straight) {
        const rawStart = points[0]
        const rawEnd = points[points.length - 1]
        const clipped = clipLineToGrid(rawStart, rawEnd, width, height)
        if (clipped) {
          if (clipped.ax === clipped.bx && clipped.ay === clipped.by) {
            ctx.beginPath()
            ctx.arc(clipped.ax, clipped.ay, radius, 0, Math.PI * 2)
            ctx.fill()
          } else {
            ctx.beginPath()
            ctx.moveTo(clipped.ax, clipped.ay)
            ctx.lineTo(clipped.bx, clipped.by)
            ctx.stroke()
          }
          drew = true
        } else if (isInsideGrid(rawStart, width, height)) {
          ctx.beginPath()
          ctx.arc(rawStart.x, rawStart.y, radius, 0, Math.PI * 2)
          ctx.fill()
          drew = true
        }
      } else {
        ctx.beginPath()
        let pathOpen = false
        let lastX = 0
        let lastY = 0
        const moveOrLine = (x: number, y: number, connect: boolean) => {
          if (!pathOpen) {
            ctx.moveTo(x, y)
            pathOpen = true
          } else if (connect) {
            ctx.lineTo(x, y)
          } else {
            ctx.moveTo(x, y)
          }
          lastX = x
          lastY = y
        }
        for (let i = 0; i < points.length - 1; i++) {
          const clipped = clipLineToGrid(points[i], points[i + 1], width, height)
          if (!clipped) continue
          const connect =
            pathOpen && Math.abs(lastX - clipped.ax) < 0.01 && Math.abs(lastY - clipped.ay) < 0.01
          moveOrLine(clipped.ax, clipped.ay, connect)
          ctx.lineTo(clipped.bx, clipped.by)
          lastX = clipped.bx
          lastY = clipped.by
          pathOpen = true
          drew = true
        }
        if (drew) {
          ctx.stroke()
        } else if (points.some(point => isInsideGrid(point, width, height))) {
          const inside = points.find(point => isInsideGrid(point, width, height))
          if (inside) {
            ctx.beginPath()
            ctx.arc(inside.x, inside.y, radius, 0, Math.PI * 2)
            ctx.fill()
            drew = true
          }
        }
      }

      strokeDrewRef.current = drew
      notifyDraw()
    }

    const onPointerDown = (event: Event) => {
      const pointerEvent = event as PointerEvent
      if (!isPrimaryPointer(pointerEvent)) return
      if (activePointerIdRef.current !== null) return
      if (pointerEvent.target instanceof Element && pointerEvent.target.closest('button, [data-drawing-ui]')) return

      const ctx = ctxRef.current
      if (!ctx) return

      const mapped = toDrawPoint(pointerEvent.clientX, pointerEvent.clientY)
      if (!mapped) return

      pointerEvent.preventDefault()
      hintDismissedRef.current = true
      setShowDrawHint(false)

      captureStrokeSnapshot()
      drawingRef.current = true
      strokeDrewRef.current = false
      activePointerIdRef.current = pointerEvent.pointerId
      if (eventTarget instanceof HTMLElement) {
        eventTarget.setPointerCapture(pointerEvent.pointerId)
      }
      strokePointsRef.current = [mapped]
      redrawActiveStroke(pointerEvent.shiftKey)
    }

    const onPointerMove = (event: Event) => {
      const pointerEvent = event as PointerEvent
      if (!drawingRef.current || pointerEvent.pointerId !== activePointerIdRef.current) return

      const mapped = toDrawPoint(pointerEvent.clientX, pointerEvent.clientY)
      if (!mapped) return

      pointerEvent.preventDefault()
      const points = strokePointsRef.current
      const last = points[points.length - 1]
      if (last && last.x === mapped.x && last.y === mapped.y) return
      points.push(mapped)
      redrawActiveStroke(pointerEvent.shiftKey)
    }

    const finishStroke = (event: Event) => {
      const pointerEvent = event as PointerEvent
      if (pointerEvent.pointerId !== activePointerIdRef.current) return

      const ctx = ctxRef.current
      if (!ctx) return

      const snapshot = strokeSnapshotRef.current
      if (pointerEvent.type === 'pointercancel' && snapshot) {
        restoreStrokeSnapshot(ctx)
        notifyDraw()
      } else if (snapshot && strokeDrewRef.current) {
        const stack = undoStackRef.current
        stack.push(cloneCanvas(snapshot))
        if (stack.length > UNDO_LIMIT) stack.shift()
        setUndoCount(stack.length)
      }

      drawingRef.current = false
      activePointerIdRef.current = null
      strokeSnapshotRef.current = null
      strokePointsRef.current = []
      strokeDrewRef.current = false
      ctx.closePath()

      if (eventTarget instanceof HTMLElement && eventTarget.hasPointerCapture(pointerEvent.pointerId)) {
        eventTarget.releasePointerCapture(pointerEvent.pointerId)
      }
    }

    const onShiftChange = (event: KeyboardEvent) => {
      if (!drawingRef.current) return
      if (event.key !== 'Shift') return
      event.preventDefault()
      redrawActiveStroke(event.shiftKey)
    }

    eventTarget.addEventListener('pointerdown', onPointerDown, { passive: false })
    window.addEventListener('pointermove', onPointerMove, { passive: false })
    window.addEventListener('pointerup', finishStroke)
    window.addEventListener('pointercancel', finishStroke)
    window.addEventListener('keydown', onShiftChange)
    window.addEventListener('keyup', onShiftChange)

    return () => {
      eventTarget.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', finishStroke)
      window.removeEventListener('pointercancel', finishStroke)
      window.removeEventListener('keydown', onShiftChange)
      window.removeEventListener('keyup', onShiftChange)
    }
  }, [enabled, eraserMode, width, height, surface, projectToPlane])

  const skipInitialClearRef = useRef(true)
  useEffect(() => {
    if (clearTrigger === undefined) return
    if (skipInitialClearRef.current) {
      skipInitialClearRef.current = false
      return
    }
    const canvas = getCanvas()
    const ctx = ctxRef.current
    if (!canvas || !ctx) return
    ctx.globalCompositeOperation = 'source-over'
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setEraserMode(false)
    drawingRef.current = false
    activePointerIdRef.current = null
    undoStackRef.current = []
    setUndoCount(0)
    dismissDrawHint()
    notifyDraw()
  }, [clearTrigger, surface])

  const skipInitialHintDismissRef = useRef(true)
  useEffect(() => {
    if (dismissHintTrigger === undefined) return
    if (skipInitialHintDismissRef.current) {
      skipInitialHintDismissRef.current = false
      return
    }
    dismissDrawHint()
  }, [dismissHintTrigger])

  useEffect(() => {
    if (!enabled || hintDismissedRef.current) {
      setShowDrawHint(false)
      return
    }
    const timeoutId = window.setTimeout(() => {
      if (hintDismissedRef.current || drawingRef.current) return
      setShowDrawHint(true)
    }, DRAW_HINT_DELAY_MS)
    return () => window.clearTimeout(timeoutId)
  }, [enabled])

  useEffect(() => {
    if (!enabled) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'z' || event.shiftKey) return
      event.preventDefault()
      undoLastStroke()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [enabled])

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
            onClick={undoLastStroke}
            disabled={undoCount === 0}
            className="px-3 py-1 rounded bg-gray-100 border border-gray-300 text-gray-700 text-sm hover:bg-gray-200 disabled:opacity-40 disabled:hover:bg-gray-100"
          >
            Undo
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
      {enabled && showDrawHint && (
        <div
          className="no-print draw-hint pointer-events-none absolute inset-0 flex items-center justify-center"
          style={{ zIndex: 20 }}
        >
          <div className="px-5 py-3 rounded-2xl bg-white/95 border border-gray-300 text-center shadow-sm">
            <div className="text-base text-gray-700">Draw here</div>
            <div className="mt-0.5 text-xs text-gray-500">(Hold Shift for straight lines)</div>
          </div>
        </div>
      )}
    </div>
  )
})

export default DrawingCanvas
