import { useEffect, useRef, type MutableRefObject } from 'react'
import * as THREE from 'three'
import type { PerspectiveParams } from '../utils/perspective'
import { applyCamera, applySheetSpin, projectPointerWithCamera, type ProjectPointerToPlane } from '../utils/planeProjection'
import { acquireShapeTexture, getCachedShapeTexture } from '../utils/shapeTextures'
import { IDENTITY_SHAPE_POSE, SHAPE_POSE_CANVAS_SIZE, drawPosedShape, type ShapePose } from '../utils/shapePose'

interface Props {
  gridSize: number
  perspective: PerspectiveParams
  shapeImagePath?: string
  showShape?: boolean
  shapePose?: ShapePose
  drawingCanvas?: HTMLCanvasElement | null
  projectPointerRef?: MutableRefObject<ProjectPointerToPlane | null>
  showDrawing?: boolean
}

type SceneContext = {
  mount: HTMLDivElement
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer
  sheetGroup: THREE.Group
  gridGroup: THREE.Group
  hitMesh: THREE.Mesh
  shapeOverlayMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> | null
  sourceShapeTexture: THREE.Texture | null
  shapePoseCanvas: HTMLCanvasElement | null
  shapePoseTexture: THREE.CanvasTexture | null
  drawingOverlayMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> | null
  drawingTexture: THREE.CanvasTexture | null
  drawingCopyCanvas: HTMLCanvasElement | null
  animId: number
}

const shapePlaneGeometry = new THREE.PlaneGeometry(4, 4)

function disposeOverlayMesh(mesh: THREE.Mesh | null) {
  if (!mesh) return
  mesh.parent?.remove(mesh)
  const material = mesh.material
  if (Array.isArray(material)) {
    material.forEach(entry => entry.dispose())
  } else {
    material.dispose()
  }
}

function disposeGroup(group: THREE.Group) {
  group.traverse(object => {
    if (object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.LineSegments) {
      object.geometry.dispose()
      if (Array.isArray(object.material)) {
        object.material.forEach(material => material.dispose())
      } else {
        object.material.dispose()
      }
    }
  })
  group.clear()
}

function buildGridGroup(gridSize: number): THREE.Group {
  const group = new THREE.Group()

  const halfSize = 2
  const fullSize = halfSize * 2
  const step = fullSize / gridSize
  const linePositions: number[] = []
  for (let i = 0; i <= gridSize; i++) {
    const t = -halfSize + i * step
    linePositions.push(t, -halfSize, 0, t, halfSize, 0)
    linePositions.push(-halfSize, t, 0, halfSize, t, 0)
  }

  const gridGeo = new THREE.BufferGeometry()
  gridGeo.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3))
  group.add(new THREE.LineSegments(gridGeo, new THREE.LineBasicMaterial({ color: 0x9ca3af })))

  const borderGeo = new THREE.EdgesGeometry(new THREE.PlaneGeometry(4, 4, 1, 1))
  group.add(new THREE.LineSegments(borderGeo, new THREE.LineBasicMaterial({ color: 0x6b7280, linewidth: 2 })))

  const bottomEdgeGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-2, -2, 0.002),
    new THREE.Vector3(2, -2, 0.002),
  ])
  group.add(new THREE.Line(bottomEdgeGeo, new THREE.LineBasicMaterial({ color: 0x374151 })))

  const markerGeo = new THREE.BufferGeometry()
  markerGeo.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([
      -1.92, -1.92, 0.002,
      -1.62, -1.92, 0.002,
      -1.92, -1.62, 0.002,
    ], 3)
  )
  markerGeo.setIndex([0, 1, 2])
  group.add(new THREE.Mesh(markerGeo, new THREE.MeshBasicMaterial({ color: 0x374151, side: THREE.DoubleSide })))

  const fillMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(4, 4),
    new THREE.MeshBasicMaterial({ color: 0xfafafa, side: THREE.DoubleSide })
  )
  fillMesh.position.z = -0.001
  group.add(fillMesh)

  return group
}

function disposeShapeOverlay(ctx: SceneContext) {
  disposeOverlayMesh(ctx.shapeOverlayMesh)
  ctx.shapeOverlayMesh = null
  ctx.shapePoseTexture?.dispose()
  ctx.shapePoseTexture = null
  ctx.shapePoseCanvas = null
  ctx.sourceShapeTexture = null
}

function disposeDrawingOverlay(ctx: SceneContext) {
  disposeOverlayMesh(ctx.drawingOverlayMesh)
  ctx.drawingOverlayMesh = null
}

function setShapeOverlayTexture(
  ctx: SceneContext,
  texture: THREE.Texture,
  visible: boolean,
  pose: ShapePose,
  options?: { alphaTest?: number },
) {
  ctx.sourceShapeTexture = texture
  let canvas = ctx.shapePoseCanvas
  if (!canvas) {
    canvas = document.createElement('canvas')
    canvas.width = SHAPE_POSE_CANVAS_SIZE
    canvas.height = SHAPE_POSE_CANVAS_SIZE
    ctx.shapePoseCanvas = canvas
  }
  const canvasCtx = canvas.getContext('2d')
  if (!canvasCtx || !texture.image) return
  drawPosedShape(canvasCtx, texture.image, pose, SHAPE_POSE_CANVAS_SIZE)

  let mesh = ctx.shapeOverlayMesh
  if (!mesh) {
    const poseTexture = new THREE.CanvasTexture(canvas)
    poseTexture.minFilter = THREE.LinearFilter
    poseTexture.magFilter = THREE.LinearFilter
    poseTexture.colorSpace = THREE.SRGBColorSpace
    ctx.shapePoseTexture = poseTexture
    const overlayMat = new THREE.MeshBasicMaterial({
      map: poseTexture,
      transparent: true,
      opacity: 1,
      alphaTest: options?.alphaTest,
      side: THREE.DoubleSide,
      depthTest: true,
      depthWrite: false,
    })
    mesh = new THREE.Mesh(shapePlaneGeometry, overlayMat)
    mesh.position.z = -0.0006
    ctx.sheetGroup.add(mesh)
    ctx.shapeOverlayMesh = mesh
  } else if (ctx.shapePoseTexture) {
    ctx.shapePoseTexture.needsUpdate = true
    mesh.material.alphaTest = options?.alphaTest ?? mesh.material.alphaTest
    mesh.material.needsUpdate = true
  }
  mesh.visible = visible
}

function syncDrawingOverlay(ctx: SceneContext, sourceCanvas: HTMLCanvasElement) {
  if (sourceCanvas.width <= 0 || sourceCanvas.height <= 0) return

  const size = Math.max(sourceCanvas.width, sourceCanvas.height)

  let copyCanvas = ctx.drawingCopyCanvas
  if (!copyCanvas) {
    copyCanvas = document.createElement('canvas')
    ctx.drawingCopyCanvas = copyCanvas
  }
  if (copyCanvas.width !== size || copyCanvas.height !== size) {
    copyCanvas.width = size
    copyCanvas.height = size
    if (ctx.drawingTexture) {
      ctx.drawingTexture.dispose()
      ctx.drawingTexture = null
      disposeDrawingOverlay(ctx)
    }
  }

  const copyCtx = copyCanvas.getContext('2d')
  if (!copyCtx) return
  copyCtx.clearRect(0, 0, size, size)
  copyCtx.drawImage(
    sourceCanvas,
    0,
    0,
    sourceCanvas.width,
    sourceCanvas.height,
    0,
    0,
    size,
    size,
  )

  if (!ctx.drawingTexture) {
    const texture = new THREE.CanvasTexture(copyCanvas)
    texture.minFilter = THREE.LinearFilter
    texture.magFilter = THREE.LinearFilter
    texture.colorSpace = THREE.SRGBColorSpace
    ctx.drawingTexture = texture

    const overlayMat = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: false,
      opacity: 1,
      alphaTest: 0.12,
      side: THREE.FrontSide,
      depthTest: true,
      depthWrite: true,
      toneMapped: false,
    })
    overlayMat.customProgramCacheKey = () => 'opaque-drawing-overlay'
    overlayMat.onBeforeCompile = shader => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <map_fragment>',
        `#include <map_fragment>
         if (diffuseColor.a < 0.12) discard;
         diffuseColor.rgb /= max(diffuseColor.a, 0.001);
         diffuseColor.a = 1.0;`,
      )
    }
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), overlayMat)
    mesh.position.z = 0.002
    ctx.sheetGroup.add(mesh)
    ctx.drawingOverlayMesh = mesh
  } else {
    ctx.drawingTexture.image = copyCanvas
  }

  ctx.drawingTexture.needsUpdate = true
}

export default function PerspectiveView({
  gridSize,
  perspective,
  shapeImagePath = '',
  showShape = false,
  shapePose = IDENTITY_SHAPE_POSE,
  drawingCanvas = null,
  projectPointerRef,
  showDrawing = true,
}: Props) {
  const mountRef = useRef<HTMLDivElement>(null)
  const ctxRef = useRef<SceneContext | null>(null)
  const perspectiveRef = useRef(perspective)
  const showShapeRef = useRef(showShape)
  const shapePoseRef = useRef(shapePose)
  const drawingCanvasRef = useRef(drawingCanvas)
  const showDrawingRef = useRef(showDrawing)
  perspectiveRef.current = perspective
  showShapeRef.current = showShape
  shapePoseRef.current = shapePose
  drawingCanvasRef.current = drawingCanvas
  showDrawingRef.current = showDrawing

  // Create renderer/scene once; everything else updates in place.
  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0xffffff)

    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100)
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
    renderer.setPixelRatio(window.devicePixelRatio)

    const sheetGroup = new THREE.Group()
    const gridGroup = buildGridGroup(gridSize)
    sheetGroup.add(gridGroup)
    scene.add(sheetGroup)
    scene.add(new THREE.AmbientLight(0xffffff, 0.5))

    const hitMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(4, 4),
      new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide }),
    )
    sheetGroup.add(hitMesh)
    applySheetSpin(sheetGroup, perspective.rollRad)

    renderer.domElement.style.display = 'block'
    renderer.domElement.style.width = '100%'
    renderer.domElement.style.height = '100%'
    renderer.domElement.style.cursor = 'inherit'

    const syncViewport = () => {
      const w = mount.clientWidth
      const h = mount.clientHeight
      if (w <= 0 || h <= 0) return
      applyCamera(camera, perspectiveRef.current, w / h)
      applySheetSpin(sheetGroup, perspectiveRef.current.rollRad)
      renderer.setPixelRatio(window.devicePixelRatio)
      renderer.setSize(w, h)
    }

    syncViewport()
    applyCamera(
      camera,
      perspective,
      mount.clientWidth > 0 && mount.clientHeight > 0
        ? mount.clientWidth / mount.clientHeight
        : 1
    )

    mount.appendChild(renderer.domElement)

    const ctx: SceneContext = {
      mount,
      scene,
      camera,
      renderer,
      sheetGroup,
      gridGroup,
      hitMesh,
      shapeOverlayMesh: null,
      sourceShapeTexture: null,
      shapePoseCanvas: null,
      shapePoseTexture: null,
      drawingOverlayMesh: null,
      drawingTexture: null,
      drawingCopyCanvas: null,
      animId: 0,
    }
    ctxRef.current = ctx

    const render = () => {
      ctx.animId = requestAnimationFrame(render)
      const canvas = drawingCanvasRef.current
      if (canvas && canvas.width > 0 && canvas.height > 0) {
        syncDrawingOverlay(ctx, canvas)
      }
      if (ctx.drawingOverlayMesh) {
        ctx.drawingOverlayMesh.visible = Boolean(showDrawingRef.current && canvas && canvas.width > 0)
      }
      renderer.render(scene, camera)
    }
    render()

    const resizeObserver = new ResizeObserver(syncViewport)
    resizeObserver.observe(mount)
    window.addEventListener('resize', syncViewport)

    return () => {
      cancelAnimationFrame(ctx.animId)
      resizeObserver.disconnect()
      window.removeEventListener('resize', syncViewport)
      disposeShapeOverlay(ctx)
      disposeDrawingOverlay(ctx)
      ctx.drawingTexture?.dispose()
      ctx.drawingTexture = null
      disposeGroup(gridGroup)
      hitMesh.geometry.dispose()
      if (Array.isArray(hitMesh.material)) {
        hitMesh.material.forEach(material => material.dispose())
      } else {
        hitMesh.material.dispose()
      }
      renderer.dispose()
      mount.removeChild(renderer.domElement)
      ctxRef.current = null
      if (projectPointerRef) projectPointerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-time scene setup
  }, [])

  useEffect(() => {
    const ctx = ctxRef.current
    if (!ctx) return
    const w = ctx.mount.clientWidth
    const h = ctx.mount.clientHeight
    const aspect = w > 0 && h > 0 ? w / h : 1
    applyCamera(ctx.camera, perspective, aspect)
    applySheetSpin(ctx.sheetGroup, perspective.rollRad)
  }, [perspective])

  useEffect(() => {
    const ctx = ctxRef.current
    if (!ctx) return
    ctx.sheetGroup.remove(ctx.gridGroup)
    disposeGroup(ctx.gridGroup)
    ctx.gridGroup = buildGridGroup(gridSize)
    ctx.sheetGroup.add(ctx.gridGroup)
  }, [gridSize])

  useEffect(() => {
    const ctx = ctxRef.current
    if (!ctx || !shapeImagePath) {
      if (ctx?.shapeOverlayMesh) ctx.shapeOverlayMesh.visible = false
      return
    }

    const cached = getCachedShapeTexture(shapeImagePath)
    if (cached) {
      setShapeOverlayTexture(ctx, cached, showShapeRef.current, shapePoseRef.current, { alphaTest: 0.01 })
      return
    }

    return acquireShapeTexture(shapeImagePath, texture => {
      const liveCtx = ctxRef.current
      if (!liveCtx) return
      setShapeOverlayTexture(liveCtx, texture, showShapeRef.current, shapePoseRef.current, { alphaTest: 0.01 })
    })
  }, [shapeImagePath])

  useEffect(() => {
    const mesh = ctxRef.current?.shapeOverlayMesh
    if (mesh) mesh.visible = showShape
  }, [showShape])

  useEffect(() => {
    const mesh = ctxRef.current?.drawingOverlayMesh
    if (mesh) mesh.visible = showDrawing
  }, [showDrawing])

  useEffect(() => {
    const ctx = ctxRef.current
    const source = ctx?.sourceShapeTexture
    if (!ctx || !source) return
    setShapeOverlayTexture(ctx, source, showShapeRef.current, shapePose, { alphaTest: 0.01 })
  }, [shapePose])

  useEffect(() => {
    if (!projectPointerRef) return
    projectPointerRef.current = (clientX, clientY, canvasWidth, canvasHeight) => {
      const ctx = ctxRef.current
      if (!ctx) return null
      return projectPointerWithCamera(
        ctx.camera,
        ctx.renderer.domElement,
        ctx.hitMesh,
        clientX,
        clientY,
        canvasWidth,
        canvasHeight,
      )
    }
    return () => {
      projectPointerRef.current = null
    }
  }, [projectPointerRef])

  return <div ref={mountRef} className="w-full h-full" />
}
