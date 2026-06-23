export interface PerspectiveParams {
  azimuthRad: number
  elevationRad: number
  rollRad: number
  distance: number
  fov: number
}

export function makeSeededRandom(seed: number): () => number {
  let state = Math.floor(seed * 2147483647) ^ 0x9e3779b9
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 4294967296
  }
}

export function getPerspectiveParams(seed: number, aspectRatio: number): PerspectiveParams {
  const rand = makeSeededRandom(seed)

  // Front hemisphere only.
  // Keep at least 5° away from 0° and 180°.
  const minAzimuthRad = 5 * (Math.PI / 180)
  const maxAzimuthRad = 175 * (Math.PI / 180)
  const azimuthRad = minAzimuthRad + rand() * (maxAzimuthRad - minAzimuthRad)
  // Signed elevation: include both above and below viewpoints,
  // while skipping the ultra-flat near-zero band.
  const elevationMagnitudeDeg = 8 + rand() * 70 // 8°..78°
  const elevationSign = rand() < 0.5 ? -1 : 1
  const elevationRad = elevationSign * elevationMagnitudeDeg * (Math.PI / 180)
  const rollRad = rand() * Math.PI * 2
  const fov = 42 + rand() * 20 // 42..62

  // Compute a fit-based camera distance so the full 4x4 plane remains visible.
  // Use the tighter of vertical/horizontal half-FOV and a sphere bound for robustness.
  const safeAspect = Math.max(0.1, aspectRatio)
  const halfFovV = (fov * Math.PI / 180) / 2
  const halfFovH = Math.atan(Math.tan(halfFovV) * safeAspect)
  const limitingHalfFov = Math.min(halfFovV, halfFovH)
  const planeHalfSize = 2
  const planeBoundingRadius = Math.sqrt(2) * planeHalfSize
  const fitDistance = planeBoundingRadius / Math.sin(limitingHalfFov)

  // Keep slight size variation while avoiding clipping.
  const framingPadding = 1.04 + rand() * 0.16 // 1.04..1.20
  const zoomScale = 1.5
  const distance = (fitDistance * framingPadding) / zoomScale

  return { azimuthRad, elevationRad, rollRad, distance, fov }
}
