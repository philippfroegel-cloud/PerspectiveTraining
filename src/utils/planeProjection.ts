import * as THREE from 'three'
import { SLIDER_FOV_MIN_DEG, type PerspectiveParams } from './perspective'

export const PLANE_HALF_SIZE = 2
export const PLANE_CANVAS_SIZE = 1024

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

export function applyCamera(
  camera: THREE.PerspectiveCamera,
  perspective: PerspectiveParams,
  aspect: number,
) {
  const { azimuthRad, elevationRad, distance, fov } = perspective
  camera.fov = Math.max(SLIDER_FOV_MIN_DEG, fov)
  camera.aspect = aspect
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
