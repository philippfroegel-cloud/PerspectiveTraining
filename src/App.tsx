import { shapes } from './shapes/shapes'
import { prefetchShapeTextures } from './utils/shapeTextures'
import CombinedMode from './modes/CombinedMode'

prefetchShapeTextures(shapes.map(shape => shape.imagePath))

export default function App() {
  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <header className="no-print flex items-center gap-6 px-6 py-3 bg-white border-b border-gray-200">
        <div className="flex items-center gap-3 shrink-0">
          <svg viewBox="0 0 24 24" className="w-6 h-6 text-amber-500 fill-amber-500">
            <path d="M3 3h7v7H3zm0 11h7v7H3zm11-11h7v7h-7zm0 11h7v7h-7z" opacity=".3"/>
            <path d="M3 3h7v7H3V3zm1 1v5h5V4H4zm10-1h7v7h-7V3zm1 1v5h5V4h-5zM3 14h7v7H3v-7zm1 1v5h5v-5H4zm10-1h7v7h-7v-7zm1 1v5h5v-5h-5z"/>
          </svg>
          <h1 className="text-lg font-semibold text-gray-800 tracking-wide">
            Perspective Training
          </h1>
        </div>

        <p className="ml-auto shrink-0 text-sm text-gray-500">
          Philipp Frögel
          <span className="mx-1.5">·</span>
          <a
            href="https://github.com/philippfroegel-cloud/PerspectiveTraining"
            target="_blank"
            rel="noreferrer"
            className="hover:text-gray-700"
          >
            GitHub
          </a>
          <span className="mx-1.5">·</span>
          <span className="select-all">philipp.froegel@gmail.com</span>
        </p>
      </header>

      <div className="flex flex-1 flex-col min-h-0">
        <CombinedMode />
      </div>
    </div>
  )
}
