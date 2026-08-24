export interface PerspectiveParams {
  azimuthRad: number
  elevationRad: number
  rollRad: number
  distance: number
  fov: number
  framingPadding: number
}

export const SLIDER_AZIMUTH_MIN_DEG = 0
export const SLIDER_AZIMUTH_MAX_DEG = 180
export const SLIDER_FOV_MIN_DEG = 1
export const SLIDER_FOV_MAX_DEG = 120
export const RANDOM_AZIMUTH_MIN_DEG = 20
export const RANDOM_AZIMUTH_MAX_DEG = 160

export function radiansToDegrees(rad: number): number {
  return (rad * 180) / Math.PI
}

export function degreesToRadians(deg: number): number {
  return (deg * Math.PI) / 180
}

export function roundDegrees(rad: number): number {
  return Math.round(radiansToDegrees(rad))
}

export function rollDegrees(rad: number): number {
  const normalized = ((roundDegrees(rad) % 360) + 360) % 360
  return normalized === 360 ? 0 : normalized
}

export function applyFovWheelDelta(currentFovDeg: number, deltaY: number): number {
  return Math.round(
    Math.min(SLIDER_FOV_MAX_DEG, Math.max(SLIDER_FOV_MIN_DEG, currentFovDeg + deltaY * 0.04)),
  )
}

export function makeSeededRandom(seed: number): () => number {
  let state = Math.floor(seed * 2147483647) ^ 0x9e3779b9
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 4294967296
  }
}

export function computeFitDistance(aspectRatio: number, fov: number, framingPadding: number): number {
  const safeAspect = Math.max(0.1, aspectRatio)
  const safeFov = Math.max(SLIDER_FOV_MIN_DEG, fov)
  const halfFovV = (safeFov * Math.PI / 180) / 2
  const halfFovH = Math.atan(Math.tan(halfFovV) * safeAspect)
  const limitingHalfFov = Math.min(halfFovV, halfFovH)
  const planeHalfSize = 2
  const planeBoundingRadius = Math.sqrt(2) * planeHalfSize
  const fitDistance = planeBoundingRadius / Math.sin(limitingHalfFov)
  return fitDistance * framingPadding
}

export function getPerspectiveParams(seed: number, aspectRatio: number): PerspectiveParams {
  const rand = makeSeededRandom(seed)

  // Front hemisphere only. Keep away from edge-on extremes when randomizing.
  const minAzimuthRad = degreesToRadians(RANDOM_AZIMUTH_MIN_DEG)
  const maxAzimuthRad = degreesToRadians(RANDOM_AZIMUTH_MAX_DEG)
  const azimuthRad = minAzimuthRad + rand() * (maxAzimuthRad - minAzimuthRad)
  // Signed elevation: include both above and below viewpoints,
  // while skipping the ultra-flat near-zero band.
  const elevationMagnitudeDeg = 8 + rand() * 70 // 8°..78°
  const elevationSign = rand() < 0.5 ? -1 : 1
  const elevationRad = elevationSign * elevationMagnitudeDeg * (Math.PI / 180)
  const rollRad = rand() * Math.PI * 2

  // Angle-conditioned FOV:
  // - edge-on-ish views keep narrower FOV (less distortion)
  // - face-on-ish views may use much wider FOV (up to ~120)
  // Plane normal is +Z and camera direction toward origin has z component sin(az)*cos(el).
  const facingScore = Math.abs(Math.sin(azimuthRad) * Math.cos(elevationRad)) // 0..1
  const easedFacing = Math.pow(facingScore, 1.6)
  const fovMin = 42
  const fovMax = 58 + 62 * easedFacing // 58..120 depending on orientation
  const fov = fovMin + rand() * (fovMax - fovMin)

  // Keep slight size variation while avoiding clipping.
  const framingPadding = 1.04 + rand() * 0.16 // 1.04..1.20
  const zoomScale = 1.5
  const distance = computeFitDistance(aspectRatio, fov, framingPadding) / zoomScale

  return { azimuthRad, elevationRad, rollRad, distance, fov, framingPadding }
}
