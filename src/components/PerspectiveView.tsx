import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import type { PerspectiveParams } from '../utils/perspective'
import { acquireShapeTexture, getCachedShapeTexture } from '../utils/shapeTextures'

interface Props {
  gridSize: number
  perspective: PerspectiveParams
  shapeImagePath: string
  showShape: boolean
}

type SceneContext = {
  mount: HTMLDivElement
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer
  gridGroup: THREE.Group
  shapeMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> | null
  animId: number
}

const shapePlaneGeometry = new THREE.PlaneGeometry(4, 4)

function applyCamera(camera: THREE.PerspectiveCamera, perspective: PerspectiveParams, aspect: number) {
  const { azimuthRad, elevationRad, rollRad, distance, fov } = perspective
  camera.fov = fov
  camera.aspect = aspect
  camera.position.set(
    Math.cos(azimuthRad) * Math.cos(elevationRad) * distance,
    Math.sin(elevationRad) * distance,
    Math.sin(azimuthRad) * Math.cos(elevationRad) * distance
  )
  camera.rotation.set(0, 0, 0)
  camera.lookAt(0, 0, 0)
  camera.rotateZ(rollRad)
  camera.updateProjectionMatrix()
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

function disposeShapeMesh(ctx: SceneContext) {
  const mesh = ctx.shapeMesh
  if (!mesh) return
  ctx.scene.remove(mesh)
  mesh.material.dispose()
  ctx.shapeMesh = null
}

function setShapeTexture(ctx: SceneContext, texture: THREE.Texture, visible: boolean) {
  let mesh = ctx.shapeMesh
  if (!mesh) {
    const shapeMat = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: 1,
      alphaTest: 0.01,
      side: THREE.DoubleSide,
      depthTest: true,
      depthWrite: false,
    })
    mesh = new THREE.Mesh(shapePlaneGeometry, shapeMat)
    mesh.position.z = -0.0005
    ctx.scene.add(mesh)
    ctx.shapeMesh = mesh
  } else if (mesh.material.map !== texture) {
    mesh.material.map = texture
    mesh.material.needsUpdate = true
  }
  mesh.visible = visible
}

export default function PerspectiveView({ gridSize, perspective, shapeImagePath, showShape }: Props) {
  const mountRef = useRef<HTMLDivElement>(null)
  const ctxRef = useRef<SceneContext | null>(null)
  const showShapeRef = useRef(showShape)
  showShapeRef.current = showShape

  // Create renderer/scene once; everything else updates in place.
  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0xffffff)

    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100)
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.setSize(mount.clientWidth, mount.clientHeight)
    mount.appendChild(renderer.domElement)

    const gridGroup = buildGridGroup(gridSize)
    scene.add(gridGroup)
    scene.add(new THREE.AmbientLight(0xffffff, 0.5))

    applyCamera(camera, perspective, mount.clientWidth / mount.clientHeight)

    const ctx: SceneContext = {
      mount,
      scene,
      camera,
      renderer,
      gridGroup,
      shapeMesh: null,
      animId: 0,
    }
    ctxRef.current = ctx

    const render = () => {
      ctx.animId = requestAnimationFrame(render)
      renderer.render(scene, camera)
    }
    render()

    const onResize = () => {
      const w = mount.clientWidth
      const h = mount.clientHeight
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    }
    window.addEventListener('resize', onResize)

    return () => {
      cancelAnimationFrame(ctx.animId)
      window.removeEventListener('resize', onResize)
      disposeShapeMesh(ctx)
      disposeGroup(gridGroup)
      renderer.dispose()
      mount.removeChild(renderer.domElement)
      ctxRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-time scene setup
  }, [])

  useEffect(() => {
    const ctx = ctxRef.current
    if (!ctx) return
    const { width, height } = ctx.mount.getBoundingClientRect()
    applyCamera(ctx.camera, perspective, width / height)
  }, [perspective])

  useEffect(() => {
    const ctx = ctxRef.current
    if (!ctx) return
    ctx.scene.remove(ctx.gridGroup)
    disposeGroup(ctx.gridGroup)
    ctx.gridGroup = buildGridGroup(gridSize)
    ctx.scene.add(ctx.gridGroup)
  }, [gridSize])

  useEffect(() => {
    const ctx = ctxRef.current
    if (!ctx || !shapeImagePath) {
      if (ctx?.shapeMesh) ctx.shapeMesh.visible = false
      return
    }

    const cached = getCachedShapeTexture(shapeImagePath)
    if (cached) {
      setShapeTexture(ctx, cached, showShapeRef.current)
      return
    }

    return acquireShapeTexture(shapeImagePath, texture => {
      const liveCtx = ctxRef.current
      if (!liveCtx) return
      setShapeTexture(liveCtx, texture, showShapeRef.current)
    })
  }, [shapeImagePath])

  useEffect(() => {
    const mesh = ctxRef.current?.shapeMesh
    if (mesh) mesh.visible = showShape
  }, [showShape])

  return <div ref={mountRef} className="w-full h-full" />
}
