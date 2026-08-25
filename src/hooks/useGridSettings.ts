import { useState } from 'react'
import { shapes, type Shape } from '../shapes/shapes'
import { IDENTITY_SHAPE_POSE, randomShapePose, type ShapePose } from '../utils/shapePose'

export interface GridSettings {
  shapeIndex: number
  gridSize: number
  orientationSeed: number
  showShapeOnGrid: boolean
  drawingEnabled: boolean
  randomPlacement: boolean
  shapePose: ShapePose
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
    randomPlacement: false,
    shapePose: IDENTITY_SHAPE_POSE,
  })

  const nextShape = () =>
    setSettings(s => {
      if (shapes.length === 0) return s
      return {
        ...s,
        shapeIndex: (s.shapeIndex + 1) % shapes.length,
        shapePose: s.randomPlacement ? randomShapePose() : s.shapePose,
      }
    })

  const randomOrientation = () =>
    setSettings(s => ({ ...s, orientationSeed: Math.random() }))

  const setGridSize = (gridSize: number) =>
    setSettings(s => ({ ...s, gridSize }))

  const toggleShapeOnGrid = () =>
    setSettings(s => ({ ...s, showShapeOnGrid: !s.showShapeOnGrid }))

  const toggleRandomPlacement = () =>
    setSettings(s => {
      const randomPlacement = !s.randomPlacement
      return {
        ...s,
        randomPlacement,
        shapePose: randomPlacement ? randomShapePose() : IDENTITY_SHAPE_POSE,
      }
    })

  return {
    settings,
    currentShape: shapes[settings.shapeIndex] ?? fallbackShape,
    nextShape,
    randomOrientation,
    setGridSize,
    toggleShapeOnGrid,
    toggleRandomPlacement,
  }
}
