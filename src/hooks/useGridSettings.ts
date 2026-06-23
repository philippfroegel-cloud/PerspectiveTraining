import { useState } from 'react'
import { shapes, type Shape } from '../shapes/shapes'

export interface GridSettings {
  shapeIndex: number
  gridSize: number
  orientationSeed: number
  showShapeOnGrid: boolean
  drawingEnabled: boolean
}

export function useGridSettings() {
  const fallbackShape: Shape = {
    id: 'no-shape',
    name: 'No Shapes Found',
    imagePath: '',
  }

  const [settings, setSettings] = useState<GridSettings>({
    shapeIndex: 0,
    gridSize: 4,
    orientationSeed: Math.random(),
    showShapeOnGrid: false,
    drawingEnabled: true,
  })

  const nextShape = () =>
    setSettings(s => {
      if (shapes.length === 0) return s
      return { ...s, shapeIndex: (s.shapeIndex + 1) % shapes.length }
    })

  const randomOrientation = () =>
    setSettings(s => ({ ...s, orientationSeed: Math.random() }))

  const setGridSize = (gridSize: number) =>
    setSettings(s => ({ ...s, gridSize }))

  const toggleShapeOnGrid = () =>
    setSettings(s => ({ ...s, showShapeOnGrid: !s.showShapeOnGrid }))

  return {
    settings,
    currentShape: shapes[settings.shapeIndex] ?? fallbackShape,
    nextShape,
    randomOrientation,
    setGridSize,
    toggleShapeOnGrid,
  }
}
