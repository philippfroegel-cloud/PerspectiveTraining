import { useEffect, useMemo, useRef, useState } from 'react'
import { useGridSettings } from '../hooks/useGridSettings'
import FlatView from '../components/FlatView'
import PerspectiveView from '../components/PerspectiveView'
import DrawingCanvas from '../components/DrawingCanvas'
import LabeledRange from '../components/LabeledRange'
import { applyFovWheelDelta, cameraSlidersFromSeed, computeFitDistance, degreesToRadians, getPerspectiveParams, rollDegrees, roundDegrees, SLIDER_AZIMUTH_MAX_DEG, SLIDER_AZIMUTH_MIN_DEG, SLIDER_FOV_MAX_DEG, SLIDER_FOV_MIN_DEG } from '../utils/perspective'
import { PLANE_CANVAS_SIZE, type ProjectPointerToPlane } from '../utils/planeProjection'

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
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <div
        onClick={onToggle}
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
      event.preventDefault()
      setFovDeg(current => applyFovWheelDelta(current, event.deltaY))
    }
    perspectiveNode.addEventListener('wheel', onWheel, { passive: false })
    return () => perspectiveNode.removeEventListener('wheel', onWheel)
  }, [perspectiveNode])

  const aspectForFraming =
    perspectiveSize.width > 0 && perspectiveSize.height > 0
      ? perspectiveSize.width / perspectiveSize.height
      : 1

  useEffect(() => {
    if (settings.orientationSeed === null) return
    const randomBase = getPerspectiveParams(settings.orientationSeed, aspectForFraming)
    setAzimuthDeg(roundDegrees(randomBase.azimuthRad))
    setElevationDeg(roundDegrees(randomBase.elevationRad))
    setFovDeg(Math.round(randomBase.fov))
    setRollRad(randomBase.rollRad)
    setFramingPadding(randomBase.framingPadding)
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
    const zoomScale = 1.5
    const distance = computeFitDistance(aspectForFraming, fovDeg, framingPadding) / zoomScale
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
            </div>
            <label
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
            </label>
          </div>
      </div>
      <div className="col-start-1 row-start-2 flex min-h-0 flex-col overflow-hidden rounded-b-xl border border-t-0 border-gray-200 bg-white px-3 pt-1 pb-2">
        <div className="drawing-pointer-root relative flex min-h-0 flex-1 items-center justify-center">
          <div className="relative aspect-square h-full w-auto max-w-full overflow-hidden">
            <FlatView
              shape={currentShape}
              gridSize={settings.gridSize}
              showShape={showShapeLeft}
              shapePose={settings.shapePose}
            />
            <DrawingCanvas
              surface={drawingSurface}
              enabled
              width={PLANE_CANVAS_SIZE}
              height={PLANE_CANVAS_SIZE}
              displaySurface
              inkVisible={showDrawingLeft}
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
              />
              <LabeledRange
                compact
                label="Elevation"
                value={displayedElevationDeg}
                min={-90}
                max={90}
                onChange={value => setElevationDeg(value)}
              />
              <LabeledRange
                compact
                label="Spin"
                value={displayedRollDeg}
                min={0}
                max={359}
                onChange={value => setRollRad(degreesToRadians(value))}
              />
              <LabeledRange
                compact
                label="FOV"
                value={displayedFovDeg}
                min={SLIDER_FOV_MIN_DEG}
                max={SLIDER_FOV_MAX_DEG}
                onChange={value => setFovDeg(value)}
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
        className="no-print pointer-events-none absolute inset-0 z-20 col-start-1 row-start-1 col-span-2 row-span-2 flex items-center justify-center"
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
