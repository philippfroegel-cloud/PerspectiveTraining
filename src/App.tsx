import { useEffect, useMemo, useRef, useState } from 'react'
import { useGridSettings } from './hooks/useGridSettings'
import FlatView from './components/FlatView'
import PerspectiveView from './components/PerspectiveView'
import DrawingCanvas from './components/DrawingCanvas'
import { computeFitDistance, getPerspectiveParams } from './utils/perspective'

export default function App() {
  const {
    settings,
    currentShape,
    nextShape,
    randomOrientation,
    setGridSize,
    toggleShapeOnGrid,
  } = useGridSettings()

  const perspectiveAreaRef = useRef<HTMLDivElement>(null)
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

  const aspectForDebug =
    perspectiveSize.width > 0 && perspectiveSize.height > 0
      ? perspectiveSize.width / perspectiveSize.height
      : 1

  useEffect(() => {
    const randomBase = getPerspectiveParams(settings.orientationSeed, aspectForDebug)
    setAzimuthDeg(Math.round((randomBase.azimuthRad * 180) / Math.PI))
    setElevationDeg(Math.round((randomBase.elevationRad * 180) / Math.PI))
    setFovDeg(Math.round(randomBase.fov))
    setRollRad(randomBase.rollRad)
    setFramingPadding(randomBase.framingPadding)
  }, [settings.orientationSeed, aspectForDebug])

  const capturePerspectiveSnapshot = (): string | null => {
    const container = perspectiveAreaRef.current
    if (!container) return null
    const canvases = container.querySelectorAll('canvas')
    if (!canvases.length) return null

    const baseCanvas = canvases[0] as HTMLCanvasElement
    const overlayCanvas = canvases.length > 1 ? (canvases[1] as HTMLCanvasElement) : null
    if (baseCanvas.width === 0 || baseCanvas.height === 0) return null

    const out = document.createElement('canvas')
    out.width = baseCanvas.width
    out.height = baseCanvas.height
    const outCtx = out.getContext('2d')
    if (!outCtx) return null

    outCtx.drawImage(baseCanvas, 0, 0, out.width, out.height)
    if (overlayCanvas) {
      outCtx.drawImage(overlayCanvas, 0, 0, out.width, out.height)
    }
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

  return (
    <div className="flex flex-col h-screen bg-gray-50">

      {/* ── Header ──────────────────────────────────────────── */}
      <header className="no-print flex items-center gap-3 px-6 py-3 bg-white border-b border-gray-200">
        <svg viewBox="0 0 24 24" className="w-6 h-6 text-amber-500 fill-amber-500">
          <path d="M3 3h7v7H3zm0 11h7v7H3zm11-11h7v7h-7zm0 11h7v7h-7z" opacity=".3"/>
          <path d="M3 3h7v7H3V3zm1 1v5h5V4H4zm10-1h7v7h-7V3zm1 1v5h5V4h-5zM3 14h7v7H3v-7zm1 1v5h5v-5H4zm10-1h7v7h-7v-7zm1 1v5h5v-5h-5z"/>
        </svg>
        <h1 className="text-lg font-semibold text-gray-800 tracking-wide">
          Perspective Training
        </h1>
      </header>

      {/* ── Main layout ─────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden gap-4 p-4 min-h-0">

        {/* Left: reference (always visible) */}
        <div
          className="no-print flex flex-col flex-1 min-w-0 rounded-xl overflow-hidden bg-white border border-gray-200"
        >
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
          <div className="flex-1 min-h-0 p-4 pt-2 flex items-center justify-center overflow-hidden">
            <FlatView
              shape={currentShape}
              gridSize={settings.gridSize}
              showShape={true}
            />
          </div>
        </div>

        {/* Right: perspective (always visible) */}
        <div
          className="print-perspective-host flex flex-col flex-1 min-w-0 rounded-xl overflow-hidden bg-white border border-gray-200"
        >
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
            <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="flex items-end gap-2">
                <label className="text-xs text-gray-500 uppercase tracking-wider whitespace-nowrap">
                  Azimuth {azimuthDeg}deg
                </label>
                <input
                  type="range"
                  min={0}
                  max={180}
                  value={azimuthDeg}
                  onChange={e => setAzimuthDeg(Number(e.target.value))}
                  className="w-full accent-amber-500"
                />
              </div>
              <div className="flex items-end gap-2">
                <label className="text-xs text-gray-500 uppercase tracking-wider whitespace-nowrap">
                  Elevation {elevationDeg}deg
                </label>
                <input
                  type="range"
                  min={-90}
                  max={90}
                  value={elevationDeg}
                  onChange={e => setElevationDeg(Number(e.target.value))}
                  className="w-full accent-amber-500"
                />
              </div>
              <div className="flex items-end gap-2">
                <label className="text-xs text-gray-500 uppercase tracking-wider whitespace-nowrap">
                  FOV {fovDeg}deg
                </label>
                <input
                  type="range"
                  min={42}
                  max={120}
                  value={fovDeg}
                  onChange={e => setFovDeg(Number(e.target.value))}
                  className="w-full accent-amber-500"
                />
              </div>
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
            />
            <DrawingCanvas
              enabled={settings.drawingEnabled}
              width={perspectiveSize.width}
              height={perspectiveSize.height}
              clearTrigger={settings.orientationSeed}
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

    </div>
  )
}
