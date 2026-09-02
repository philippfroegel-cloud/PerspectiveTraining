import { useEffect, useMemo, useRef, useState } from 'react'
import { useGridSettings } from '../hooks/useGridSettings'
import FlatView from '../components/FlatView'
import PerspectiveView from '../components/PerspectiveView'
import DrawingCanvas from '../components/DrawingCanvas'
import LabeledRange from '../components/LabeledRange'
import { cameraSlidersFromSeed, computeFitDistance, degreesToRadians, getPerspectiveParams, rollDegrees, roundDegrees, SLIDER_AZIMUTH_MAX_DEG, SLIDER_AZIMUTH_MIN_DEG, SLIDER_FOV_MAX_DEG, SLIDER_FOV_MIN_DEG } from '../utils/perspective'
import { IDENTITY_VIEW_ZOOM, PLANE_CANVAS_SIZE, clientToViewNdc, isViewPanPointer, panViewByNdc, zoomViewAroundNdc, type ProjectPointerToPlane } from '../utils/planeProjection'
import { blurFocusedRange, isRangeInput, isTextEntryTarget } from '../utils/shortcutTarget'

function createDrawingSurface() {
  return document.createElement('canvas')
}

function Toggle({
  on,
  onToggle,
  label,
}: {
  on: boolean
  onToggle: () => void
  label: string
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none" onClick={onToggle}>
      <div
        className={`w-9 h-[18px] rounded-full transition-colors ${on ? 'bg-amber-500' : 'bg-gray-400'}`}
      >
        <div
          className={`h-[18px] w-[18px] rounded-full bg-white shadow transition-transform ${
            on ? 'translate-x-[18px]' : 'translate-x-0'
          }`}
        />
      </div>
      <span className="text-sm text-gray-700 whitespace-nowrap">{label}</span>
    </label>
  )
}

export default function CombinedMode() {
  const {
    settings,
    currentShape,
    nextShape,
    randomOrientation,
    setGridSize,
    toggleRandomPlacement,
  } = useGridSettings()

  const drawingSurface = useMemo(() => createDrawingSurface(), [])
  const projectPointerRef = useRef<ProjectPointerToPlane | null>(null)
  const [perspectiveNode, setPerspectiveNode] = useState<HTMLDivElement | null>(null)
  const [planePointerHost, setPlanePointerHost] = useState<HTMLDivElement | null>(null)
  const [drawingUiHost, setDrawingUiHost] = useState<HTMLDivElement | null>(null)
  const [hintHost, setHintHost] = useState<HTMLDivElement | null>(null)
  const [perspectiveSize, setPerspectiveSize] = useState({ width: 0, height: 0 })
  const [printImageDataUrl, setPrintImageDataUrl] = useState<string | null>(null)
  const startCamera = cameraSlidersFromSeed(settings.orientationSeed)
  const [azimuthDeg, setAzimuthDeg] = useState(startCamera.azimuthDeg)
  const [elevationDeg, setElevationDeg] = useState(startCamera.elevationDeg)
  const [fovDeg, setFovDeg] = useState(startCamera.fovDeg)
  const [rollRad, setRollRad] = useState(startCamera.rollRad)
  const [framingPadding, setFramingPadding] = useState(startCamera.framingPadding)
  const [drawingClearTrigger, setDrawingClearTrigger] = useState(0)
  const [showShapeLeft, setShowShapeLeft] = useState(true)
  const [showShapeRight, setShowShapeRight] = useState(false)
  const [showDrawingLeft, setShowDrawingLeft] = useState(true)
  const [showDrawingRight, setShowDrawingRight] = useState(true)
  const [showDiagonals, setShowDiagonals] = useState(false)
  const [flatRotationDeg, setFlatRotationDeg] = useState(0)
  const viewZoomRef = useRef(IDENTITY_VIEW_ZOOM)
  const [perspectiveLocks, setPerspectiveLocks] = useState({
    azimuth: false,
    elevation: false,
    spin: false,
    fov: false,
  })
  const perspectiveLocksRef = useRef(perspectiveLocks)
  perspectiveLocksRef.current = perspectiveLocks

  const togglePerspectiveLock = (key: keyof typeof perspectiveLocks) => {
    setPerspectiveLocks(current => ({ ...current, [key]: !current[key] }))
  }

  const clearDrawing = () => setDrawingClearTrigger(n => n + 1)

  useEffect(() => {
    if (!perspectiveNode) return

    const updatePerspectiveSize = () => {
      setPerspectiveSize({
        width: perspectiveNode.clientWidth,
        height: perspectiveNode.clientHeight,
      })
    }

    updatePerspectiveSize()
    const observer = new ResizeObserver(updatePerspectiveSize)
    observer.observe(perspectiveNode)
    window.addEventListener('resize', updatePerspectiveSize)

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', updatePerspectiveSize)
    }
  }, [perspectiveNode])

  useEffect(() => {
    if (!perspectiveNode) return
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return
      if (document.documentElement.classList.contains('drawing-stroke-active')) return
      event.preventDefault()
      const ndc = clientToViewNdc(perspectiveNode.getBoundingClientRect(), event.clientX, event.clientY)
      if (!ndc) return
      const factor = Math.exp(-event.deltaY * 0.0015)
      viewZoomRef.current = zoomViewAroundNdc(viewZoomRef.current, ndc.x, ndc.y, factor)
    }
    perspectiveNode.addEventListener('wheel', onWheel, { passive: false })
    return () => perspectiveNode.removeEventListener('wheel', onWheel)
  }, [perspectiveNode])

  useEffect(() => {
    if (!perspectiveNode) return
    let panPointerId: number | null = null
    let lastNdcX = 0
    let lastNdcY = 0
    const previousCursor = perspectiveNode.style.cursor

    const endPan = (event: PointerEvent) => {
      if (panPointerId === null || event.pointerId !== panPointerId) return
      if (perspectiveNode.hasPointerCapture(event.pointerId)) {
        perspectiveNode.releasePointerCapture(event.pointerId)
      }
      panPointerId = null
      perspectiveNode.style.cursor = previousCursor
    }

    const onPointerDown = (event: PointerEvent) => {
      if (!isViewPanPointer(event)) return
      if (document.documentElement.classList.contains('drawing-stroke-active')) return
      const ndc = clientToViewNdc(perspectiveNode.getBoundingClientRect(), event.clientX, event.clientY)
      if (!ndc) return
      event.preventDefault()
      panPointerId = event.pointerId
      lastNdcX = ndc.x
      lastNdcY = ndc.y
      perspectiveNode.style.cursor = 'grabbing'
      perspectiveNode.setPointerCapture(event.pointerId)
    }

    const onPointerMove = (event: PointerEvent) => {
      if (panPointerId === null || event.pointerId !== panPointerId) return
      const ndc = clientToViewNdc(perspectiveNode.getBoundingClientRect(), event.clientX, event.clientY)
      if (!ndc) return
      const dx = ndc.x - lastNdcX
      const dy = ndc.y - lastNdcY
      lastNdcX = ndc.x
      lastNdcY = ndc.y
      viewZoomRef.current = panViewByNdc(viewZoomRef.current, dx, dy)
    }

    const onContextMenu = (event: Event) => event.preventDefault()

    perspectiveNode.addEventListener('pointerdown', onPointerDown)
    perspectiveNode.addEventListener('pointermove', onPointerMove)
    perspectiveNode.addEventListener('pointerup', endPan)
    perspectiveNode.addEventListener('pointercancel', endPan)
    perspectiveNode.addEventListener('contextmenu', onContextMenu)
    return () => {
      perspectiveNode.removeEventListener('pointerdown', onPointerDown)
      perspectiveNode.removeEventListener('pointermove', onPointerMove)
      perspectiveNode.removeEventListener('pointerup', endPan)
      perspectiveNode.removeEventListener('pointercancel', endPan)
      perspectiveNode.removeEventListener('contextmenu', onContextMenu)
      perspectiveNode.style.cursor = previousCursor
    }
  }, [perspectiveNode])

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (isRangeInput(event.target)) return
      if (event.target instanceof Element && event.target.closest('input[type="range"]')) return
      blurFocusedRange()
    }
    const onPointerUp = () => blurFocusedRange()
    const onClick = () => {
      window.setTimeout(blurFocusedRange, 0)
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('click', onClick)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('click', onClick)
    }
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      if (event.ctrlKey || event.metaKey || event.altKey) return
      if (isTextEntryTarget(event.target)) return
      if (document.documentElement.classList.contains('drawing-stroke-active')) return
      event.preventDefault()
      blurFocusedRange()
      const delta = event.key === 'ArrowRight' ? 1 : -1
      setGridSize(Math.min(8, Math.max(1, settings.gridSize + delta)))
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [settings.gridSize, setGridSize])

  const aspectForFraming =
    perspectiveSize.width > 0 && perspectiveSize.height > 0
      ? perspectiveSize.width / perspectiveSize.height
      : 1

  useEffect(() => {
    if (settings.orientationSeed === null) return
    const randomBase = getPerspectiveParams(settings.orientationSeed, aspectForFraming)
    const locks = perspectiveLocksRef.current
    if (!locks.azimuth) setAzimuthDeg(roundDegrees(randomBase.azimuthRad))
    if (!locks.elevation) setElevationDeg(roundDegrees(randomBase.elevationRad))
    if (!locks.spin) setRollRad(randomBase.rollRad)
    if (!locks.fov) setFovDeg(Math.round(randomBase.fov))
    setFramingPadding(randomBase.framingPadding)
    viewZoomRef.current = IDENTITY_VIEW_ZOOM
  }, [settings.orientationSeed])

  const capturePerspectiveSnapshot = (): string | null => {
    if (!perspectiveNode) return null
    const canvases = perspectiveNode.querySelectorAll('canvas')
    if (!canvases.length) return null

    const baseCanvas = canvases[0] as HTMLCanvasElement
    if (baseCanvas.width === 0 || baseCanvas.height === 0) return null

    const out = document.createElement('canvas')
    out.width = baseCanvas.width
    out.height = baseCanvas.height
    const outCtx = out.getContext('2d')
    if (!outCtx) return null

    outCtx.drawImage(baseCanvas, 0, 0, out.width, out.height)
    return out.toDataURL('image/png')
  }

  useEffect(() => {
    const onBeforePrint = () => {
      const snapshot = capturePerspectiveSnapshot()
      if (snapshot) setPrintImageDataUrl(snapshot)
    }
    window.addEventListener('beforeprint', onBeforePrint)
    return () => window.removeEventListener('beforeprint', onBeforePrint)
  }, [perspectiveNode])

  const handlePrint = () => {
    const snapshot = capturePerspectiveSnapshot()
    if (snapshot) setPrintImageDataUrl(snapshot)
    requestAnimationFrame(() => {
      window.print()
    })
  }

  const currentPerspective = useMemo(() => {
    const distance = computeFitDistance(aspectForFraming, fovDeg, 1)
    return {
      azimuthRad: (azimuthDeg * Math.PI) / 180,
      elevationRad: (elevationDeg * Math.PI) / 180,
      rollRad,
      fov: fovDeg,
      distance,
      framingPadding,
    }
  }, [aspectForFraming, azimuthDeg, elevationDeg, fovDeg, rollRad, framingPadding])

  const displayedAzimuthDeg = roundDegrees(currentPerspective.azimuthRad)
  const displayedElevationDeg = roundDegrees(currentPerspective.elevationRad)
  const displayedRollDeg = rollDegrees(currentPerspective.rollRad)
  const displayedFovDeg = Math.round(currentPerspective.fov)

  return (
    <div className="relative grid flex-1 min-h-0 grid-cols-2 grid-rows-[auto_minmax(0,1fr)] gap-x-3 gap-y-0 overflow-hidden p-3">
      <div className="no-print col-start-1 row-start-1 flex min-h-0 flex-col rounded-t-xl border border-b-0 border-gray-200 bg-white px-3 pt-2.5 pb-1.5">
        <div className="combined-settings flex h-full flex-col gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <button
                onClick={() => {
                  nextShape()
                  clearDrawing()
                }}
                className="px-3 py-1.5 rounded bg-gray-400 text-white hover:bg-gray-500 text-sm font-medium"
              >
                Next Shape →
              </button>
              <Toggle
                on={settings.randomPlacement}
                onToggle={toggleRandomPlacement}
                label="Random placement"
              />
              <Toggle
                on={showShapeLeft}
                onToggle={() => setShowShapeLeft(value => !value)}
                label="Show shape"
              />
              <Toggle
                on={showDrawingLeft}
                onToggle={() => setShowDrawingLeft(value => !value)}
                label="Show drawing"
              />
              <Toggle
                on={showDiagonals}
                onToggle={() => setShowDiagonals(value => !value)}
                label="Show diagonals"
              />
            </div>
            <div
              title="←/→ to change grid size"
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1fr) auto',
                gridTemplateRows: 'auto auto',
                columnGap: 8,
                rowGap: 3,
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
                  lineHeight: 1,
                }}
              >
                Grid cells
              </span>
              <span
                style={{
                  fontSize: 12,
                  fontVariantNumeric: 'tabular-nums',
                  textAlign: 'right',
                  color: '#6b7280',
                  whiteSpace: 'nowrap',
                  letterSpacing: '0.05em',
                  lineHeight: 1,
                }}
              >
                {settings.gridSize} × {settings.gridSize}
              </span>
              <input
                type="range"
                min={1}
                max={8}
                value={settings.gridSize}
                onChange={e => setGridSize(Number(e.target.value))}
                className="accent-amber-500"
                style={{
                  gridColumn: '1 / -1',
                  width: '100%',
                  minWidth: 0,
                  margin: 0,
                  ['--range-progress' as string]: `${((settings.gridSize - 1) / 7) * 100}%`,
                }}
              />
            </div>
          </div>
      </div>
      <div className="col-start-1 row-start-2 flex min-h-0 flex-col overflow-hidden rounded-b-xl border border-t-0 border-gray-200 bg-white px-3 pt-1 pb-2">
        <div className="drawing-pointer-root relative flex min-h-0 flex-1 items-center justify-center [container-type:size]">
          <div className="flex items-end">
          <button
            type="button"
            title="Rotate paper 90°"
            aria-label="Rotate paper 90 degrees"
            data-drawing-ui
            className="no-print z-20 mb-0 mr-1 shrink-0 border-0 bg-transparent p-1 text-gray-500 shadow-none hover:text-gray-800"
            onPointerDown={event => event.stopPropagation()}
            onClick={() => setFlatRotationDeg(deg => (deg + 90) % 360)}
          >
            <svg
              viewBox="0 0 24 24"
              className="h-8 w-8 overflow-visible"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
              <path d="M21 3v5h-5" />
            </svg>
          </button>
            <div
              className="relative aspect-square overflow-hidden"
              style={{ width: 'min(calc(100cqw - 2.75rem), 100cqh)' }}
            >
              <div
                className="absolute inset-0 origin-center"
                style={{ transform: `rotate(${flatRotationDeg}deg)` }}
              >
              <FlatView
                shape={currentShape}
                gridSize={settings.gridSize}
                showShape={showShapeLeft}
                showDiagonals={showDiagonals}
                shapePose={settings.shapePose}
              />
              <DrawingCanvas
                surface={drawingSurface}
                enabled
                width={PLANE_CANVAS_SIZE}
                height={PLANE_CANVAS_SIZE}
                displaySurface
                inkVisible={showDrawingLeft}
                displayRotationDeg={flatRotationDeg}
                projectPointerRef={projectPointerRef}
                projectEventRoot={planePointerHost}
                uiPortal={drawingUiHost}
                hintPortal={hintHost}
                hintTitle="Draw on the grids."
                hintNote="Turn on/off what you want to see."
                showLocalToolbar={false}
                toolbarVariant="box"
                onPrint={handlePrint}
                clearTrigger={drawingClearTrigger}
              />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="no-print col-start-2 row-start-1 flex min-h-0 flex-col rounded-t-xl border border-b-0 border-gray-200 bg-white px-3 pt-2.5 pb-1.5">
        <div className="combined-settings flex h-full flex-col gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <button
                onClick={randomOrientation}
                className="px-3 py-1.5 rounded bg-gray-400 text-white hover:bg-gray-500 text-sm font-medium"
              >
                Next Perspective →
              </button>
              <Toggle
                on={showShapeRight}
                onToggle={() => setShowShapeRight(value => !value)}
                label="Show shape"
              />
              <Toggle
                on={showDrawingRight}
                onToggle={() => setShowDrawingRight(value => !value)}
                label="Show drawing"
              />
            </div>
            <div className="grid grid-cols-4 gap-x-3">
              <LabeledRange
                compact
                label="Azimuth"
                value={displayedAzimuthDeg}
                min={SLIDER_AZIMUTH_MIN_DEG}
                max={SLIDER_AZIMUTH_MAX_DEG}
                onChange={value => setAzimuthDeg(value)}
                locked={perspectiveLocks.azimuth}
                onToggleLock={() => togglePerspectiveLock('azimuth')}
              />
              <LabeledRange
                compact
                label="Elevation"
                value={displayedElevationDeg}
                min={-90}
                max={90}
                onChange={value => setElevationDeg(value)}
                locked={perspectiveLocks.elevation}
                onToggleLock={() => togglePerspectiveLock('elevation')}
              />
              <LabeledRange
                compact
                label="Spin"
                value={displayedRollDeg}
                min={0}
                max={359}
                onChange={value => setRollRad(degreesToRadians(value))}
                locked={perspectiveLocks.spin}
                onToggleLock={() => togglePerspectiveLock('spin')}
              />
              <LabeledRange
                compact
                label="FOV"
                value={displayedFovDeg}
                min={SLIDER_FOV_MIN_DEG}
                max={SLIDER_FOV_MAX_DEG}
                onChange={value => setFovDeg(value)}
                locked={perspectiveLocks.fov}
                onToggleLock={() => togglePerspectiveLock('fov')}
              />
            </div>
          </div>
      </div>
      <div className="print-perspective-host col-start-2 row-start-2 flex min-h-0 flex-col overflow-hidden rounded-b-xl border border-t-0 border-gray-200 bg-white px-3 pt-1 pb-2">
        <div
          ref={setPerspectiveNode}
          className="drawing-pointer-root print-area relative min-h-0 flex-1 overflow-hidden"
        >
          <PerspectiveView
            gridSize={settings.gridSize}
            perspective={currentPerspective}
            shapeImagePath={currentShape.imagePath}
            showShape={showShapeRight}
            shapePose={settings.shapePose}
            drawingCanvas={drawingSurface}
            projectPointerRef={projectPointerRef}
            showDrawing={showDrawingRight}
            showDiagonals={showDiagonals}
            viewZoomRef={viewZoomRef}
          />
          <div
            ref={setPlanePointerHost}
            className="drawing-pointer-root absolute inset-0 z-10"
            style={{ touchAction: 'none' }}
          />
        </div>
        <img
          src={printImageDataUrl ?? ''}
          alt=""
          className="print-only perspective-print-image"
        />
      </div>
      <div
        ref={setHintHost}
        className="no-print pointer-events-none absolute inset-0 z-50 col-start-1 row-start-1 col-span-2 row-span-2 flex items-center justify-center"
      />
      <div className="pointer-events-none col-start-1 col-span-2 row-start-2 relative z-30 h-0 w-full overflow-visible">
        <div
          ref={setDrawingUiHost}
          className="no-print pointer-events-auto absolute left-1/2 top-2 z-30 -translate-x-1/2 bg-gray-50 border border-gray-200 rounded-lg p-1 shadow-sm"
          data-drawing-ui
          onPointerDown={event => event.stopPropagation()}
        />
      </div>
    </div>
  )
}
