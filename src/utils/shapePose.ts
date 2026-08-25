export interface ShapePose {
  /** Center X in 0..1, left to right */
  cx: number
  /** Center Y in 0..1, bottom to top */
  cy: number
  /** Clockwise rotation on the sheet, in radians */
  rotationRad: number
  /** Size relative to the full grid; 1 fills the square */
  scale: number
}

export const IDENTITY_SHAPE_POSE: ShapePose = {
  cx: 0.5,
  cy: 0.5,
  rotationRad: 0,
  scale: 1,
}

export const SHAPE_POSE_CANVAS_SIZE = 1024

/** Full-size image, rotated and clearly shifted. The grid clips overflow. */
export function randomShapePose(): ShapePose {
  const minOffset = 0.18
  const maxOffset = 0.36
  const offset = minOffset + Math.random() * (maxOffset - minOffset)
  const heading = Math.random() * Math.PI * 2
  return {
    cx: Math.min(0.85, Math.max(0.15, 0.5 + Math.cos(heading) * offset)),
    cy: Math.min(0.85, Math.max(0.15, 0.5 + Math.sin(heading) * offset)),
    rotationRad: Math.random() * Math.PI * 2,
    scale: 1,
  }
}

export function drawPosedShape(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  pose: ShapePose,
  size: number,
) {
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, size, size)
  const imageSize = size * pose.scale
  ctx.save()
  ctx.translate(pose.cx * size, (1 - pose.cy) * size)
  ctx.rotate(pose.rotationRad)
  ctx.drawImage(image, -imageSize / 2, -imageSize / 2, imageSize, imageSize)
  ctx.restore()
}
