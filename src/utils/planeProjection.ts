import * as THREE from 'three'
import { SLIDER_FOV_MIN_DEG, type PerspectiveParams } from './perspective'

export const PLANE_HALF_SIZE = 2
export const PLANE_SIZE = PLANE_HALF_SIZE * 2
export const PLANE_CANVAS_SIZE = 1024

/** Right triangle in the bottom-left corner, as a fraction of the sheet. */
export const ORIENTATION_MARK = {
  inset: 0.016,
  leg: 0.04,
  color: 0x4b5563,
} as const

export type PaperUv = { u: number; v: number }

/** Paper UV: origin at the bottom-left, +u right, +v up. */
export function orientationMarkUvCorners(): [PaperUv, PaperUv, PaperUv] {
  const { inset, leg } = ORIENTATION_MARK
  return [
    { u: inset, v: inset },
    { u: inset + leg, v: inset },
    { u: inset, v: inset + leg },
  ]
}

export function paperUvToLocal(u: number, v: number) {
  return {
    x: (u - 0.5) * PLANE_SIZE,
    y: (v - 0.5) * PLANE_SIZE,
  }
}

export const GRID_DIAGONAL_COLOR = 0xe5e7eb

export function gridDiagonalColorCss() {
  return `#${GRID_DIAGONAL_COLOR.toString(16).padStart(6, '0')}`
}

/** Both diagonals of every cell, in paper UV. */
export function cellDiagonalUvSegments(gridSize: number): { a: PaperUv; b: PaperUv }[] {
  const n = Math.max(1, Math.floor(gridSize))
  const step = 1 / n
  const segments: { a: PaperUv; b: PaperUv }[] = []
  for (let col = 0; col < n; col++) {
    for (let row = 0; row < n; row++) {
      const u0 = col * step
      const u1 = (col + 1) * step
      const v0 = row * step
      const v1 = (row + 1) * step
      segments.push(
        { a: { u: u0, v: v0 }, b: { u: u1, v: v1 } },
        { a: { u: u0, v: v1 }, b: { u: u1, v: v0 } },
      )
    }
  }
  return segments
}

export function orientationMarkColorCss() {
  return `#${ORIENTATION_MARK.color.toString(16).padStart(6, '0')}`
}

export type ProjectPointerToPlane = (
  clientX: number,
  clientY: number,
  canvasWidth: number,
  canvasHeight: number,
) => { x: number; y: number } | null

const ndc = new THREE.Vector2()
const raycaster = new THREE.Raycaster()
const sheetPlane = new THREE.Plane()
const sheetNormal = new THREE.Vector3()
const sheetOrigin = new THREE.Vector3()
const sheetHit = new THREE.Vector3()
const sheetLocal = new THREE.Vector3()
const sheetInverse = new THREE.Matrix4()
const framingMatrix = new THREE.Matrix4()
const ndcCorner = new THREE.Vector3()

const SHEET_CORNERS_LOCAL: ReadonlyArray<readonly [number, number]> = [
  [-PLANE_HALF_SIZE, -PLANE_HALF_SIZE],
  [PLANE_HALF_SIZE, -PLANE_HALF_SIZE],
  [PLANE_HALF_SIZE, PLANE_HALF_SIZE],
  [-PLANE_HALF_SIZE, PLANE_HALF_SIZE],
]

/** Keep a hair of margin; never scale so far that a full paper edge leaves the frame. */
const FRAME_MARGIN = 0.98
const FRAME_ZOOM_MAX = 8
const ndcCornerXs = [0, 0, 0, 0]
const ndcCornerYs = [0, 0, 0, 0]
const cornerRadii = [0, 0, 0, 0]

function applyFilmFraming(camera: THREE.PerspectiveCamera, rollRad: number) {
  camera.updateMatrixWorld()
  const cosR = Math.cos(rollRad)
  const sinR = Math.sin(rollRad)
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (let i = 0; i < SHEET_CORNERS_LOCAL.length; i++) {
    const [lx, ly] = SHEET_CORNERS_LOCAL[i]
    ndcCorner.set(lx * cosR - ly * sinR, lx * sinR + ly * cosR, 0).project(camera)
    if (!Number.isFinite(ndcCorner.x) || !Number.isFinite(ndcCorner.y)) return
    ndcCornerXs[i] = ndcCorner.x
    ndcCornerYs[i] = ndcCorner.y
    minX = Math.min(minX, ndcCorner.x)
    maxX = Math.max(maxX, ndcCorner.x)
    minY = Math.min(minY, ndcCorner.y)
    maxY = Math.max(maxY, ndcCorner.y)
  }
  const panX = (minX + maxX) / 2
  const panY = (minY + maxY) / 2
  for (let i = 0; i < 4; i++) {
    cornerRadii[i] = Math.max(Math.abs(ndcCornerXs[i] - panX), Math.abs(ndcCornerYs[i] - panY), 1e-6)
  }
  cornerRadii.sort((a, b) => b - a)
  const allInside = 1 / cornerRadii[0]
  const oneCornerOut = 1 / cornerRadii[1]
  const uniqueFarthest = cornerRadii[0] > cornerRadii[1] * 1.002
  const zoom = Math.min(FRAME_ZOOM_MAX, (uniqueFarthest ? oneCornerOut : allInside) * FRAME_MARGIN)
  framingMatrix.set(
    zoom, 0, 0, -zoom * panX,
    0, zoom, 0, -zoom * panY,
    0, 0, 1, 0,
    0, 0, 0, 1,
  )
  camera.projectionMatrix.premultiply(framingMatrix)
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert()
}

export type ViewZoom = {
  scale: number
  tx: number
  ty: number
}

export const IDENTITY_VIEW_ZOOM: ViewZoom = { scale: 1, tx: 0, ty: 0 }

const USER_ZOOM_MIN = 0.4
const USER_ZOOM_MAX = 8

export function zoomViewAroundNdc(
  current: ViewZoom,
  ndcX: number,
  ndcY: number,
  factor: number,
): ViewZoom {
  const nextScale = Math.min(USER_ZOOM_MAX, Math.max(USER_ZOOM_MIN, current.scale * factor))
  const applied = nextScale / current.scale
  return {
    scale: nextScale,
    tx: applied * current.tx + (1 - applied) * ndcX,
    ty: applied * current.ty + (1 - applied) * ndcY,
  }
}

export function panViewByNdc(current: ViewZoom, dx: number, dy: number): ViewZoom {
  return { scale: current.scale, tx: current.tx + dx, ty: current.ty + dy }
}

export function clientToViewNdc(rect: DOMRect, clientX: number, clientY: number) {
  if (rect.width <= 0 || rect.height <= 0) return null
  return {
    x: ((clientX - rect.left) / rect.width) * 2 - 1,
    y: -((clientY - rect.top) / rect.height) * 2 + 1,
  }
}

export function isViewPanPointer(event: PointerEvent) {
  if (event.pointerType === 'touch' || event.pointerType === 'pen') return false
  if (event.button === 2) return true
  return event.button === 0 && (event.ctrlKey || event.metaKey)
}

function applyViewZoom(camera: THREE.PerspectiveCamera, viewZoom: ViewZoom) {
  if (viewZoom.scale === 1 && viewZoom.tx === 0 && viewZoom.ty === 0) return
  framingMatrix.set(
    viewZoom.scale, 0, 0, viewZoom.tx,
    0, viewZoom.scale, 0, viewZoom.ty,
    0, 0, 1, 0,
    0, 0, 0, 1,
  )
  camera.projectionMatrix.premultiply(framingMatrix)
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert()
}

export function applyCamera(
  camera: THREE.PerspectiveCamera,
  perspective: PerspectiveParams,
  aspect: number,
  viewZoom: ViewZoom = IDENTITY_VIEW_ZOOM,
) {
  const { azimuthRad, elevationRad, distance, fov, rollRad } = perspective
  camera.fov = Math.max(SLIDER_FOV_MIN_DEG, fov)
  camera.aspect = aspect
  camera.zoom = 1
  camera.clearViewOffset()
  camera.near = Math.max(0.1, distance / 200)
  camera.far = Math.max(200, distance * 4)
  camera.position.set(
    Math.cos(azimuthRad) * Math.cos(elevationRad) * distance,
    Math.sin(elevationRad) * distance,
    Math.sin(azimuthRad) * Math.cos(elevationRad) * distance,
  )
  camera.rotation.set(0, 0, 0)
  camera.lookAt(0, 0, 0)
  camera.updateProjectionMatrix()
  applyFilmFraming(camera, rollRad)
  applyViewZoom(camera, viewZoom)
}

export function applySheetSpin(sheet: THREE.Object3D, rollRad: number) {
  sheet.rotation.z = rollRad
}

export function projectPointerWithCamera(
  camera: THREE.Camera,
  viewElement: HTMLElement,
  hitObject: THREE.Object3D,
  clientX: number,
  clientY: number,
  canvasWidth: number,
  canvasHeight: number,
): { x: number; y: number } | null {
  const rect = viewElement.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0 || canvasWidth <= 0 || canvasHeight <= 0) return null

  ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1
  ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1
  raycaster.setFromCamera(ndc, camera)

  hitObject.updateWorldMatrix(true, false)
  sheetInverse.copy(hitObject.matrixWorld).invert()
  sheetNormal.set(0, 0, 1).transformDirection(hitObject.matrixWorld).normalize()
  sheetOrigin.setFromMatrixPosition(hitObject.matrixWorld)
  sheetPlane.setFromNormalAndCoplanarPoint(sheetNormal, sheetOrigin)

  if (!raycaster.ray.intersectPlane(sheetPlane, sheetHit)) return null

  sheetLocal.copy(sheetHit).applyMatrix4(sheetInverse)
  const u = sheetLocal.x / (PLANE_HALF_SIZE * 2) + 0.5
  const v = sheetLocal.y / (PLANE_HALF_SIZE * 2) + 0.5

  return {
    x: u * canvasWidth,
    y: (1 - v) * canvasHeight,
  }
}
