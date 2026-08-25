import { forwardRef, useEffect, useRef, useState, type ReactNode, type Ref, type MutableRefObject } from 'react'
import { createPortal } from 'react-dom'
import type { ProjectPointerToPlane } from '../utils/planeProjection'

type PointerSpace = 'screen' | 'plane'

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
  /** Extra root whose pointers map through projectPointerRef (3D view). */
  projectEventRoot?: HTMLElement | null
  /** Keep the 2D canvas visible while also drawing from a projected view. */
  displaySurface?: boolean
  /** Host for a second copy of the drawing toolbar / hint (the other view). */
  uiPortal?: HTMLElement | null
  /** Host for the draw hint (e.g. centered over both grids). */
  hintPortal?: HTMLElement | null
  clearTrigger?: number
  dismissHintTrigger?: number
  showHint?: boolean
  hintTitle?: string
  hintSubtitle?: string
  hintNote?: string
  inkVisible?: boolean
  showLocalToolbar?: boolean
  toolbarVariant?: 'overlay' | 'box'
  onPrint?: () => void
  onDraw?: () => void
  showPrint?: boolean
}

function ToolGlyph({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" className="h-[26px] w-[26px] overflow-visible" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  )
}

const DrawingCanvas = forwardRef<HTMLCanvasElement, Props>(function DrawingCanvas(
  {
    enabled,
    width,
    height,
    surface,
    projectPointerRef,
    projectEventRoot = null,
    displaySurface,
    uiPortal = null,
    hintPortal = null,
    clearTrigger,
    dismissHintTrigger,
    showHint = true,
    hintTitle = 'Draw here',
    hintSubtitle = 'Hold Shift for straight lines.',
    hintNote,
    inkVisible = true,
    showLocalToolbar = true,
    toolbarVariant = 'overlay',
    onPrint,
    onDraw,
    showPrint = true,
  },
  ref,
) {
  const hostRef = useRef<HTMLDivElement>(null)
  const internalCanvasRef = useRef<HTMLCanvasElement>(null)
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null)
  const drawingRef = useRef(false)
  const activePointerIdRef = useRef<number | null>(null)
  const pointerCaptureTargetRef = useRef<HTMLElement | null>(null)
  const pointerSpaceRef = useRef<PointerSpace>('screen')
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
  const usesPlaneProjection = Boolean(projectPointerRef)
  const hideSurface = displaySurface === undefined ? usesPlaneProjection : !displaySurface

  const PEN_SIZE = usesPlaneProjection ? 6 : 3
  const ERASER_SIZE = usesPlaneProjection ? 40 : 20

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
    canvas.style.cursor = enabled ? BLACK_CROSSHAIR_CURSOR : 'default'
    if (hideSurface) {
      canvas.style.opacity = '0'
      canvas.style.pointerEvents = 'none'
    } else {
      canvas.style.opacity = inkVisible ? '1' : '0'
      canvas.style.pointerEvents = enabled ? 'auto' : 'none'
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
  }, [surface, enabled, hideSurface, inkVisible])

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

  const toDrawPoint = (clientX: number, clientY: number, space: PointerSpace) => {
    const canvas = getCanvas()
    if (!canvas) return null

    if (space === 'plane') {
      return projectPointerRef?.current?.(clientX, clientY, canvas.width, canvas.height) ?? null
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
    const flatEventTarget = host?.closest('.drawing-pointer-root') ?? (hideSurface ? host : canvas)
    const planeEventTarget = projectEventRoot
    if (!canvas || !enabled) return
    if (!flatEventTarget && !planeEventTarget) return

    let lastClientX = 0
    let lastClientY = 0

    const setStrokeCursor = (active: boolean) => {
      document.documentElement.classList.toggle('drawing-stroke-active', active)
    }

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

    const onPointerDown = (space: PointerSpace) => (event: Event) => {
      const pointerEvent = event as PointerEvent
      if (!isPrimaryPointer(pointerEvent)) return
      if (activePointerIdRef.current !== null) return
      if (pointerEvent.target instanceof Element && pointerEvent.target.closest('button, [data-drawing-ui]')) return

      const ctx = ctxRef.current
      if (!ctx) return

      pointerSpaceRef.current = space
      const mapped = toDrawPoint(pointerEvent.clientX, pointerEvent.clientY, space)
      if (!mapped) return

      pointerEvent.preventDefault()
      hintDismissedRef.current = true
      setShowDrawHint(false)

      captureStrokeSnapshot()
      drawingRef.current = true
      strokeDrewRef.current = false
      activePointerIdRef.current = pointerEvent.pointerId
      lastClientX = pointerEvent.clientX
      lastClientY = pointerEvent.clientY
      setStrokeCursor(true)
      if (event.currentTarget instanceof HTMLElement) {
        event.currentTarget.setPointerCapture(pointerEvent.pointerId)
        pointerCaptureTargetRef.current = event.currentTarget
      }
      strokePointsRef.current = [mapped]
      redrawActiveStroke(pointerEvent.shiftKey)
    }

    const appendMappedPoint = (clientX: number, clientY: number) => {
      const space = pointerSpaceRef.current
      const mapped = toDrawPoint(clientX, clientY, space)
      if (!mapped) return false

      const points = strokePointsRef.current
      const last = points[points.length - 1]
      if (last && last.x === mapped.x && last.y === mapped.y) {
        lastClientX = clientX
        lastClientY = clientY
        return false
      }

      // Far on a receding plane, a few screen pixels jump a long way on the
      // shared 2D bitmap. Sample along the screen segment so the polyline stays connected.
      if (space === 'plane' && last) {
        const canvasDist = Math.hypot(mapped.x - last.x, mapped.y - last.y)
        const maxStep = Math.max(PEN_SIZE, 6)
        if (canvasDist > maxStep) {
          const steps = Math.min(64, Math.ceil(canvasDist / maxStep))
          for (let i = 1; i < steps; i++) {
            const t = i / steps
            const sample = toDrawPoint(
              lastClientX + (clientX - lastClientX) * t,
              lastClientY + (clientY - lastClientY) * t,
              'plane',
            )
            if (!sample) continue
            const prev = points[points.length - 1]
            if (prev && prev.x === sample.x && prev.y === sample.y) continue
            points.push(sample)
          }
        }
      }

      points.push(mapped)
      lastClientX = clientX
      lastClientY = clientY
      return true
    }

    const onPointerMove = (event: Event) => {
      const pointerEvent = event as PointerEvent
      if (!drawingRef.current || pointerEvent.pointerId !== activePointerIdRef.current) return

      pointerEvent.preventDefault()
      const coalesced =
        typeof pointerEvent.getCoalescedEvents === 'function' ? pointerEvent.getCoalescedEvents() : []
      const samples = coalesced.length > 0 ? coalesced : [pointerEvent]
      let added = false
      for (const sample of samples) {
        if (appendMappedPoint(sample.clientX, sample.clientY)) added = true
      }
      if (added) redrawActiveStroke(pointerEvent.shiftKey)
    }

    const finishStroke = (event: Event) => {
      const pointerEvent = event as PointerEvent
      if (pointerEvent.pointerId !== activePointerIdRef.current) return

      const ctx = ctxRef.current
      setStrokeCursor(false)
      if (!ctx) {
        drawingRef.current = false
        activePointerIdRef.current = null
        return
      }

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
      setStrokeCursor(false)

      const captureTarget = pointerCaptureTargetRef.current
      if (captureTarget?.hasPointerCapture(pointerEvent.pointerId)) {
        captureTarget.releasePointerCapture(pointerEvent.pointerId)
      }
      pointerCaptureTargetRef.current = null
    }

    const onShiftChange = (event: KeyboardEvent) => {
      if (!drawingRef.current) return
      if (event.key !== 'Shift') return
      event.preventDefault()
      redrawActiveStroke(event.shiftKey)
    }

    const onFlatPointerDown = onPointerDown(hideSurface ? 'plane' : 'screen')
    const onPlanePointerDown = onPointerDown('plane')
    const previousFlatCursor = flatEventTarget instanceof HTMLElement ? flatEventTarget.style.cursor : ''
    const previousPlaneCursor = planeEventTarget?.style.cursor ?? ''
    const previousPlaneTouchAction = planeEventTarget?.style.touchAction ?? ''
    const previousPlaneUserSelect = planeEventTarget?.style.userSelect ?? ''

    if (flatEventTarget instanceof HTMLElement) {
      flatEventTarget.style.cursor = BLACK_CROSSHAIR_CURSOR
    }
    flatEventTarget?.addEventListener('pointerdown', onFlatPointerDown, { passive: false })
    if (planeEventTarget && planeEventTarget !== flatEventTarget) {
      planeEventTarget.style.cursor = BLACK_CROSSHAIR_CURSOR
      planeEventTarget.style.touchAction = 'none'
      planeEventTarget.style.userSelect = 'none'
      planeEventTarget.addEventListener('pointerdown', onPlanePointerDown, { passive: false })
    }
    window.addEventListener('pointermove', onPointerMove, { passive: false })
    window.addEventListener('pointerup', finishStroke)
    window.addEventListener('pointercancel', finishStroke)
    window.addEventListener('keydown', onShiftChange)
    window.addEventListener('keyup', onShiftChange)

    return () => {
      setStrokeCursor(false)
      if (flatEventTarget instanceof HTMLElement) {
        flatEventTarget.style.cursor = previousFlatCursor
      }
      flatEventTarget?.removeEventListener('pointerdown', onFlatPointerDown)
      if (planeEventTarget && planeEventTarget !== flatEventTarget) {
        planeEventTarget.removeEventListener('pointerdown', onPlanePointerDown)
        planeEventTarget.style.cursor = previousPlaneCursor
        planeEventTarget.style.touchAction = previousPlaneTouchAction
        planeEventTarget.style.userSelect = previousPlaneUserSelect
      }
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', finishStroke)
      window.removeEventListener('pointercancel', finishStroke)
      window.removeEventListener('keydown', onShiftChange)
      window.removeEventListener('keyup', onShiftChange)
    }
  }, [enabled, eraserMode, width, height, surface, hideSurface, projectEventRoot])

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
    if (!showHint || !enabled || hintDismissedRef.current) {
      setShowDrawHint(false)
      return
    }
    const host = hostRef.current
    if (!host) return

    let timeoutId: number | undefined
    const schedule = () => {
      timeoutId = window.setTimeout(() => {
        if (hintDismissedRef.current || drawingRef.current) return
        setShowDrawHint(true)
      }, DRAW_HINT_DELAY_MS)
    }

    if (!host.closest('.hidden') && host.getClientRects().length > 0) {
      schedule()
      return () => window.clearTimeout(timeoutId)
    }

    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return
      observer.disconnect()
      schedule()
    })
    observer.observe(host)
    return () => {
      observer.disconnect()
      if (timeoutId !== undefined) window.clearTimeout(timeoutId)
    }
  }, [enabled, showHint])

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

  const renderToolbar = () => {
    if (!enabled) return null
    const box = toolbarVariant === 'box'
    if (box) {
      const iconBtn =
        'flex h-[42px] w-[42px] items-center justify-center rounded text-gray-600 hover:bg-gray-200 hover:text-gray-800'
      return (
        <div
          className="no-print flex flex-col gap-0.5"
          data-drawing-ui
          onPointerDown={event => event.stopPropagation()}
          style={{ pointerEvents: 'auto', zIndex: 20 }}
        >
          <button
            type="button"
            title={eraserMode ? 'Pen' : 'Eraser'}
            onClick={() => setEraserMode(v => !v)}
            className={`${iconBtn} ${eraserMode ? 'bg-gray-200 text-gray-800' : ''}`}
          >
            {eraserMode ? (
              <ToolGlyph>
                <path d="M12 19h7" />
                <path d="m16.2 3.8 3 3L8 18l-4 1 1-4Z" />
              </ToolGlyph>
            ) : (
              <ToolGlyph>
                <path d="M18.5 15.5 9 6l-5.5 5.5a2 2 0 0 0 0 2.8l5.2 5.2h6.6L18.5 15.5z" />
                <path d="m8.5 19.5 10-10" />
              </ToolGlyph>
            )}
          </button>
          <button
            type="button"
            title="Undo"
            onClick={undoLastStroke}
            disabled={undoCount === 0}
            className={`${iconBtn} disabled:opacity-35 disabled:hover:bg-transparent`}
          >
            <ToolGlyph>
              <path d="M8 5 3 10l5 5" />
              <path d="M3 10h10a6 6 0 0 1 0 12" />
            </ToolGlyph>
          </button>
          <button type="button" title="Clear" onClick={clearCanvas} className={iconBtn}>
            <ToolGlyph>
              <path d="M4 7h16" />
              <path d="M9 7V5h6v2" />
              <path d="m10 11 .5 7" />
              <path d="m14 11-.5 7" />
              <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" />
            </ToolGlyph>
          </button>
          {showPrint && onPrint && (
            <button type="button" title="Print" onClick={onPrint} className={iconBtn}>
              <ToolGlyph>
                <path d="M7 17h10v4H7z" />
                <path d="M7 3h10v5H7z" />
                <path d="M5 8h14a2 2 0 0 1 2 2v5H3v-5a2 2 0 0 1 2-2z" />
              </ToolGlyph>
            </button>
          )}
        </div>
      )
    }

    const buttonClass =
      'px-3 py-1 rounded bg-gray-100 border border-gray-300 text-gray-700 text-sm hover:bg-gray-200'
    return (
      <div
        className="no-print absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2"
        data-drawing-ui
        onPointerDown={event => event.stopPropagation()}
        style={{ pointerEvents: 'auto', zIndex: 20 }}
      >
        <button type="button" onClick={() => setEraserMode(v => !v)} className={buttonClass}>
          {eraserMode ? 'Pen' : 'Eraser'}
        </button>
        <button
          type="button"
          onClick={undoLastStroke}
          disabled={undoCount === 0}
          className={`${buttonClass} disabled:opacity-40 disabled:hover:bg-gray-100`}
        >
          Undo
        </button>
        <button type="button" onClick={clearCanvas} className={buttonClass}>
          Clear
        </button>
        {showPrint && onPrint && (
          <button type="button" onClick={onPrint} className={buttonClass}>
            Print
          </button>
        )}
      </div>
    )
  }

  const renderHint = () =>
    showHint && enabled && showDrawHint ? (
      <div
        className={
          hintPortal
            ? 'no-print draw-hint pointer-events-none'
            : 'no-print draw-hint pointer-events-none absolute inset-0 flex items-center justify-center'
        }
        style={{ zIndex: 20 }}
      >
        <div
          className={`px-6 py-3.5 rounded-2xl bg-white/95 border border-gray-300 shadow-sm ${
            hintNote ? 'text-left' : 'text-center'
          }`}
        >
          <div className="text-[19px] text-gray-700">{hintTitle}</div>
          <div className="mt-1 text-[15px] text-gray-500">{hintSubtitle}</div>
          {hintNote ? <div className="mt-0.5 text-[15px] text-gray-500">{hintNote}</div> : null}
        </div>
      </div>
    ) : null

  return (
    <div
      ref={hostRef}
      className="absolute inset-0"
      style={{
        zIndex: 10,
        touchAction: 'none',
        userSelect: 'none',
        pointerEvents: hideSurface && enabled ? 'auto' : 'none',
        cursor: enabled ? BLACK_CROSSHAIR_CURSOR : 'default',
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
      {showLocalToolbar ? renderToolbar() : null}
      {hintPortal ? createPortal(renderHint(), hintPortal) : renderHint()}
      {uiPortal ? createPortal(renderToolbar(), uiPortal) : null}
    </div>
  )
})

export default DrawingCanvas
