import { useEffect, useMemo, useRef, useState } from 'react'
import { useGridSettings } from '../hooks/useGridSettings'
import FlatView from '../components/FlatView'
import PerspectiveView from '../components/PerspectiveView'
import DrawingCanvas from '../components/DrawingCanvas'
import LabeledRange from '../components/LabeledRange'
import { applyFovWheelDelta, computeFitDistance, degreesToRadians, getPerspectiveParams, rollDegrees, roundDegrees, SLIDER_AZIMUTH_MAX_DEG, SLIDER_AZIMUTH_MIN_DEG, SLIDER_FOV_MAX_DEG, SLIDER_FOV_MIN_DEG } from '../utils/perspective'
import { PLANE_CANVAS_SIZE, type ProjectPointerToPlane } from '../utils/planeProjection'

function createDrawingSurface() {
  return document.createElement('canvas')
}

export default function PerspectiveTrainingMode() {
  const {
    settings,
    currentShape,
    nextShape,
    randomOrientation,
    setGridSize,
    toggleShapeOnGrid,
  } = useGridSettings()

  const perspectiveAreaRef = useRef<HTMLDivElement>(null)
  const drawingSurface = useMemo(() => createDrawingSurface(), [])
  const projectPointerRef = useRef<ProjectPointerToPlane | null>(null)
  const [perspectiveSize, setPerspectiveSize] = useState({ width: 0, height: 0 })
  const [printImageDataUrl, setPrintImageDataUrl] = useState<string | null>(null)
  const [azimuthDeg, setAzimuthDeg] = useState(90)
  const [elevationDeg, setElevationDeg] = useState(30)
  const [fovDeg, setFovDeg] = useState(50)
  const [rollRad, setRollRad] = useState(0)
  const [framingPadding, setFramingPadding] = useState(1.1)

  useEffect(() => {
    const target = perspectiveAreaRef.current
    if (!target) return

    const updateSize = () => {
      setPerspectiveSize({
        width: target.clientWidth,
        height: target.clientHeight,
      })
    }

    updateSize()
    const observer = new ResizeObserver(updateSize)
    observer.observe(target)
    window.addEventListener('resize', updateSize)

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', updateSize)
    }
  }, [])

  useEffect(() => {
    const target = perspectiveAreaRef.current
    if (!target) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      setFovDeg(current => applyFovWheelDelta(current, event.deltaY))
    }
    target.addEventListener('wheel', onWheel, { passive: false })
    return () => target.removeEventListener('wheel', onWheel)
  }, [])

  const aspectForDebug =
    perspectiveSize.width > 0 && perspectiveSize.height > 0
      ? perspectiveSize.width / perspectiveSize.height
      : 1

  useEffect(() => {
    const randomBase = getPerspectiveParams(settings.orientationSeed, aspectForDebug)
    setAzimuthDeg(roundDegrees(randomBase.azimuthRad))
    setElevationDeg(roundDegrees(randomBase.elevationRad))
    setFovDeg(Math.round(randomBase.fov))
    setRollRad(randomBase.rollRad)
    setFramingPadding(randomBase.framingPadding)
  }, [settings.orientationSeed])

  const capturePerspectiveSnapshot = (): string | null => {
    const container = perspectiveAreaRef.current
    if (!container) return null
    const canvases = container.querySelectorAll('canvas')
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
  }, [])

  const handlePrint = () => {
    const snapshot = capturePerspectiveSnapshot()
    if (snapshot) setPrintImageDataUrl(snapshot)
    requestAnimationFrame(() => {
      window.print()
    })
  }

  const currentPerspective = useMemo(() => {
    const zoomScale = 1.5
    const distance = computeFitDistance(aspectForDebug, fovDeg, framingPadding) / zoomScale
    return {
      azimuthRad: (azimuthDeg * Math.PI) / 180,
      elevationRad: (elevationDeg * Math.PI) / 180,
      rollRad,
      fov: fovDeg,
      distance,
      framingPadding,
    }
  }, [aspectForDebug, azimuthDeg, elevationDeg, fovDeg, rollRad, framingPadding])

  const displayedAzimuthDeg = roundDegrees(currentPerspective.azimuthRad)
  const displayedElevationDeg = roundDegrees(currentPerspective.elevationRad)
  const displayedRollDeg = rollDegrees(currentPerspective.rollRad)
  const displayedFovDeg = Math.round(currentPerspective.fov)

  return (
    <div className="flex flex-1 overflow-hidden gap-4 p-4 min-h-0">
      <div className="no-print flex flex-col flex-1 min-w-0 rounded-xl overflow-hidden bg-white border border-gray-200">
        <div className="px-4 pt-3 text-xs text-gray-400 uppercase tracking-wider">Reference</div>
        <div className="no-print p-3 pt-2">
          <div className="flex flex-wrap items-end gap-3 bg-gray-50 border border-gray-200 rounded-lg p-3">
            <button
              onClick={nextShape}
              className="px-3 py-2 rounded bg-gray-100 text-gray-700 hover:bg-gray-200 text-sm"
            >
              Next Shape →
            </button>
            <div className="min-w-52 flex-1">
              <p className="text-xs text-gray-400 uppercase tracking-wider mb-1 font-medium">
                Grid cells — {settings.gridSize} × {settings.gridSize}
              </p>
              <input
                type="range"
                min={1}
                max={8}
                value={settings.gridSize}
                onChange={e => setGridSize(Number(e.target.value))}
                className="w-full accent-amber-500"
              />
            </div>
          </div>
        </div>
        <div className="relative flex-1 min-h-0 mx-4 mb-4 mt-2">
          <FlatView
            shape={currentShape}
            gridSize={settings.gridSize}
            showShape={true}
          />
        </div>
      </div>

      <div className="print-perspective-host flex flex-col flex-1 min-w-0 rounded-xl overflow-hidden bg-white border border-gray-200">
        <div className="no-print px-4 pt-3 text-xs text-gray-400 uppercase tracking-wider">Perspective</div>
        <div className="no-print p-3 pt-2">
          <div className="flex flex-wrap items-center gap-3 bg-gray-50 border border-gray-200 rounded-lg p-3">
            <button
              onClick={randomOrientation}
              className="px-3 py-2 rounded bg-gray-100 text-gray-700 hover:bg-gray-200 text-sm"
            >
              Next Perspective →
            </button>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <div
                onClick={toggleShapeOnGrid}
                className={`w-10 h-5 rounded-full transition-colors ${
                  settings.showShapeOnGrid ? 'bg-amber-500' : 'bg-gray-400'
                }`}
              >
                <div className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${
                  settings.showShapeOnGrid ? 'translate-x-5' : 'translate-x-0'
                }`} />
              </div>
              <span className="text-sm text-gray-700">Show shape</span>
            </label>
          </div>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            <LabeledRange
              label="Azimuth"
              value={displayedAzimuthDeg}
              min={SLIDER_AZIMUTH_MIN_DEG}
              max={SLIDER_AZIMUTH_MAX_DEG}
              onChange={value => setAzimuthDeg(value)}
            />
            <LabeledRange
              label="Elevation"
              value={displayedElevationDeg}
              min={-90}
              max={90}
              onChange={value => setElevationDeg(value)}
            />
            <LabeledRange
              label="Spin"
              value={displayedRollDeg}
              min={0}
              max={359}
              onChange={value => setRollRad(degreesToRadians(value))}
            />
            <LabeledRange
              label="FOV"
              value={displayedFovDeg}
              min={SLIDER_FOV_MIN_DEG}
              max={SLIDER_FOV_MAX_DEG}
              onChange={value => setFovDeg(value)}
            />
          </div>
        </div>

        <div
          id="print-area"
          ref={perspectiveAreaRef}
          className="relative flex-1 min-h-0 overflow-hidden"
        >
          <PerspectiveView
            gridSize={settings.gridSize}
            perspective={currentPerspective}
            shapeImagePath={currentShape.imagePath}
            showShape={settings.showShapeOnGrid}
            drawingCanvas={drawingSurface}
            projectPointerRef={projectPointerRef}
          />
          <DrawingCanvas
            enabled={settings.drawingEnabled}
            surface={drawingSurface}
            width={PLANE_CANVAS_SIZE}
            height={PLANE_CANVAS_SIZE}
            projectPointerRef={projectPointerRef}
            onPrint={handlePrint}
          />
        </div>
        <img
          src={printImageDataUrl ?? ''}
          alt=""
          className="print-only perspective-print-image"
        />
      </div>
    </div>
  )
}
