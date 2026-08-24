import { useState } from 'react'
import { shapes } from './shapes/shapes'
import { prefetchShapeTextures } from './utils/shapeTextures'
import PerspectiveTrainingMode from './modes/PerspectiveTrainingMode'
import DrawPerspectiveMode from './modes/DrawPerspectiveMode'

prefetchShapeTextures(shapes.map(shape => shape.imagePath))

type AppTab = 'training' | 'mode2'

const tabs: { id: AppTab; label: string }[] = [
  { id: 'training', label: 'Perspective map' },
  { id: 'mode2', label: 'Free drawing' },
]

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>('training')

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

        <nav className="flex gap-1 rounded-lg bg-gray-100 p-1">
          {tabs.map(tab => {
            const active = activeTab === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  active
                    ? 'bg-white text-gray-800 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.label}
              </button>
            )
          })}
        </nav>
      </header>

      <div className="flex flex-1 flex-col min-h-0">
        <div className={activeTab === 'training' ? 'flex flex-1 flex-col min-h-0' : 'hidden'}>
          <PerspectiveTrainingMode />
        </div>
        {activeTab === 'mode2' ? (
          <div className="flex flex-1 flex-col min-h-0">
            <DrawPerspectiveMode />
          </div>
        ) : null}
      </div>
    </div>
  )
}
