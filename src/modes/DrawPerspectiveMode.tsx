import { useEffect, useMemo, useRef, useState } from 'react'
import FlatView from '../components/FlatView'
import PerspectiveView from '../components/PerspectiveView'
import DrawingCanvas from '../components/DrawingCanvas'
import LabeledRange from '../components/LabeledRange'
import { applyFovWheelDelta, cameraSlidersFromSeed, computeFitDistance, degreesToRadians, getPerspectiveParams, rollDegrees, roundDegrees, SLIDER_AZIMUTH_MAX_DEG, SLIDER_AZIMUTH_MIN_DEG, SLIDER_FOV_MAX_DEG, SLIDER_FOV_MIN_DEG } from '../utils/perspective'
import { PLANE_CANVAS_SIZE, type ProjectPointerToPlane } from '../utils/planeProjection'
import { initialOrientationSeed } from '../utils/firstLaunch'

function createDrawingSurface() {
  return document.createElement('canvas')
}

export default function DrawPerspectiveMode() {
  const drawingSurface = useMemo(() => createDrawingSurface(), [])
  const [gridSize, setGridSize] = useState(4)
  const [orientationSeed, setOrientationSeed] = useState<number | null>(initialOrientationSeed)

  const projectPointerRef = useRef<ProjectPointerToPlane | null>(null)
  const [perspectiveNode, setPerspectiveNode] = useState<HTMLDivElement | null>(null)
  const [planePointerHost, setPlanePointerHost] = useState<HTMLDivElement | null>(null)
  const [drawingUiHost, setDrawingUiHost] = useState<HTMLDivElement | null>(null)
  const [perspectiveSize, setPerspectiveSize] = useState({ width: 0, height: 0 })

  const startCamera = cameraSlidersFromSeed(orientationSeed)
  const [azimuthDeg, setAzimuthDeg] = useState(startCamera.azimuthDeg)
  const [elevationDeg, setElevationDeg] = useState(startCamera.elevationDeg)
  const [fovDeg, setFovDeg] = useState(startCamera.fovDeg)
  const [rollRad, setRollRad] = useState(startCamera.rollRad)
  const [framingPadding, setFramingPadding] = useState(startCamera.framingPadding)
  const [printImageDataUrl, setPrintImageDataUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!perspectiveNode) return

    const updatePerspectiveSize = () => {
      setPerspectiveSize({
        width: perspectiveNode.clientWidth,
        height: perspectiveNode.clientHeight,
      })
    }

    updatePerspectiveSize()

    const perspectiveObserver = new ResizeObserver(updatePerspectiveSize)
    perspectiveObserver.observe(perspectiveNode)
    window.addEventListener('resize', updatePerspectiveSize)

    return () => {
      perspectiveObserver.disconnect()
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
    if (orientationSeed === null) return
    const randomBase = getPerspectiveParams(orientationSeed, aspectForFraming)
    setAzimuthDeg(roundDegrees(randomBase.azimuthRad))
    setElevationDeg(roundDegrees(randomBase.elevationRad))
    setFovDeg(Math.round(randomBase.fov))
    setRollRad(randomBase.rollRad)
    setFramingPadding(randomBase.framingPadding)
  }, [orientationSeed])

  const randomOrientation = () => setOrientationSeed(Math.random())

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
    <div className="flex flex-1 overflow-hidden gap-4 p-4 min-h-0">
      <div className="no-print flex flex-col flex-1 min-w-0 rounded-xl overflow-hidden bg-white border border-gray-200">
        <div className="px-4 pt-3 text-xs text-gray-400 uppercase tracking-wider">Draw</div>
        <div className="no-print p-3 pt-2">
          <div className="flex flex-wrap items-end gap-3 bg-gray-50 border border-gray-200 rounded-lg p-3">
            <div className="min-w-52 flex-1">
              <p className="text-xs text-gray-400 uppercase tracking-wider mb-1 font-medium">
                Grid cells — {gridSize} × {gridSize}
              </p>
              <input
                type="range"
                min={1}
                max={8}
                value={gridSize}
                onChange={e => setGridSize(Number(e.target.value))}
                className="w-full accent-amber-500"
              />
            </div>
          </div>
        </div>
        <div className="drawing-pointer-root relative flex-1 min-h-0 mx-4 mb-4 mt-2 flex items-center justify-center">
          <div className="relative aspect-square h-full w-auto max-w-full">
            <FlatView gridSize={gridSize} gridOnly />
            <DrawingCanvas
              surface={drawingSurface}
              enabled
              width={PLANE_CANVAS_SIZE}
              height={PLANE_CANVAS_SIZE}
              displaySurface
              projectPointerRef={projectPointerRef}
              projectEventRoot={planePointerHost}
              uiPortal={drawingUiHost}
              onPrint={handlePrint}
              showHint={false}
            />
          </div>
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
          ref={setPerspectiveNode}
          className="drawing-pointer-root print-area relative flex-1 min-h-0 overflow-hidden"
        >
          <PerspectiveView
            gridSize={gridSize}
            perspective={currentPerspective}
            drawingCanvas={drawingSurface}
            projectPointerRef={projectPointerRef}
          />
          <div
            ref={setPlanePointerHost}
            className="drawing-pointer-root absolute inset-0 z-10"
            style={{ touchAction: 'none' }}
          />
          <div
            ref={setDrawingUiHost}
            className="no-print pointer-events-none absolute inset-0 z-20"
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
