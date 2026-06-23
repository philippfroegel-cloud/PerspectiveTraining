interface Props {
  gridSize: number
  drawingEnabled: boolean
  showShapeOnGrid: boolean
  onNextShape: () => void
  onRandomPerspective: () => void
  onSetGridSize: (n: number) => void
  onToggleDrawing: () => void
  onToggleShapeOnGrid: () => void
  onPrint: () => void
  shapeName: string
}

export default function Controls({
  gridSize,
  drawingEnabled,
  showShapeOnGrid,
  onNextShape,
  onRandomPerspective,
  onSetGridSize,
  onToggleDrawing,
  onToggleShapeOnGrid,
  onPrint,
  shapeName,
}: Props) {
  return (
    <div className="no-print flex flex-wrap items-end gap-4 p-4 bg-white border border-gray-200 rounded-xl">

      {/* Shape */}
      <div>
        <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">Shape</p>
        <div className="flex items-center gap-2">
          <span className="flex-1 text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded px-3 py-2">
            {shapeName}
          </span>
          <button
            onClick={onNextShape}
            className="px-3 py-2 rounded bg-gray-100 text-gray-600 hover:bg-gray-200 text-sm"
          >
            Next →
          </button>
        </div>
      </div>

      {/* Perspective randomizer */}
      <div>
        <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">Perspective</p>
        <button
          onClick={onRandomPerspective}
          className="px-3 py-2 rounded bg-gray-100 text-gray-600 hover:bg-gray-200 text-sm"
        >
          Randomize →
        </button>
      </div>

      {/* Grid density */}
      <div className="min-w-56">
        <p className="text-xs text-gray-400 uppercase tracking-wider mb-1 font-medium">
          Grid cells — {gridSize} × {gridSize}
        </p>
        <input
          type="range"
          min={2}
          max={8}
          value={gridSize}
          onChange={e => onSetGridSize(Number(e.target.value))}
          className="w-full accent-amber-500"
        />
        <div className="flex justify-between text-xs text-gray-400 mt-1">
          <span>2</span><span>8</span>
        </div>
      </div>

      {/* Shape on grid toggle */}
      <label className="flex items-center gap-3 cursor-pointer select-none">
        <div
          onClick={onToggleShapeOnGrid}
          className={`w-10 h-5 rounded-full transition-colors ${
            showShapeOnGrid ? 'bg-amber-500' : 'bg-gray-600'
          }`}
        >
          <div className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${
            showShapeOnGrid ? 'translate-x-5' : 'translate-x-0'
          }`} />
        </div>
        <span className="text-sm text-gray-600">Show shape on perspective</span>
      </label>

      {/* Draw toggle */}
      <label className="flex items-center gap-3 cursor-pointer select-none">
        <div
          onClick={onToggleDrawing}
          className={`w-10 h-5 rounded-full transition-colors ${
            drawingEnabled ? 'bg-amber-500' : 'bg-gray-600'
          }`}
        >
          <div className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${
            drawingEnabled ? 'translate-x-5' : 'translate-x-0'
          }`} />
        </div>
        <span className="text-sm text-gray-600">Draw in browser</span>
      </label>

      {/* Print */}
      <button
        onClick={onPrint}
        className="py-2 px-3 rounded-lg bg-gray-50 border border-gray-200 text-gray-600 hover:bg-gray-100 text-sm"
      >
        🖨 Print current view
      </button>

    </div>
  )
}
