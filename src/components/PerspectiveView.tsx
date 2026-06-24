import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import type { PerspectiveParams } from '../utils/perspective'

interface Props {
  gridSize: number
  perspective: PerspectiveParams
  shapeImagePath: string
  showShape: boolean
}

export default function PerspectiveView({ gridSize, perspective, shapeImagePath, showShape }: Props) {
  const mountRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    const width  = mount.clientWidth
    const height = mount.clientHeight

    // ── Scene ──────────────────────────────────────────────────────────
    const scene    = new THREE.Scene()
    scene.background = new THREE.Color(0xffffff)

    // ── Camera ─────────────────────────────────────────────────────────
    const { azimuthRad, elevationRad, rollRad, distance, fov } = perspective
    const camera = new THREE.PerspectiveCamera(fov, width / height, 0.1, 100)
    camera.position.set(
      Math.cos(azimuthRad) * Math.cos(elevationRad) * distance,
      Math.sin(elevationRad) * distance,
      Math.sin(azimuthRad) * Math.cos(elevationRad) * distance
    )
    camera.lookAt(0, 0, 0)
    camera.rotateZ(rollRad)

    // ── Renderer ───────────────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.setSize(width, height)
    mount.appendChild(renderer.domElement)

    // ── Grid plane ─────────────────────────────────────────────────────
    // Build explicit grid lines so all inner cells are visible.
    const halfSize = 2
    const fullSize = halfSize * 2
    const step = fullSize / gridSize
    const linePositions: number[] = []
    for (let i = 0; i <= gridSize; i++) {
      const t = -halfSize + i * step
      // vertical
      linePositions.push(t, -halfSize, 0, t, halfSize, 0)
      // horizontal
      linePositions.push(-halfSize, t, 0, halfSize, t, 0)
    }
    const gridGeo = new THREE.BufferGeometry()
    gridGeo.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3))
    const lineMat = new THREE.LineBasicMaterial({ color: 0x9ca3af })
    const gridMesh = new THREE.LineSegments(gridGeo, lineMat)
    scene.add(gridMesh)

    // Outer border in darker color so boundary stands out
    const borderGeo  = new THREE.EdgesGeometry(new THREE.PlaneGeometry(4, 4, 1, 1))
    const borderMat  = new THREE.LineBasicMaterial({ color: 0x6b7280, linewidth: 2 })
    const borderMesh = new THREE.LineSegments(borderGeo, borderMat)
    scene.add(borderMesh)

    // Orientation cues: bolder bottom edge + small bottom-left corner marker
    const bottomEdgeGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-2, -2, 0.002),
      new THREE.Vector3(2, -2, 0.002),
    ])
    const bottomEdgeMat = new THREE.LineBasicMaterial({ color: 0x374151 })
    const bottomEdgeMesh = new THREE.Line(bottomEdgeGeo, bottomEdgeMat)
    scene.add(bottomEdgeMesh)

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
    const markerMat = new THREE.MeshBasicMaterial({ color: 0x374151, side: THREE.DoubleSide })
    const markerMesh = new THREE.Mesh(markerGeo, markerMat)
    scene.add(markerMesh)

    // Subtle fill so the plane reads as a solid surface in the scene
    const fillMat  = new THREE.MeshBasicMaterial({ color: 0xfafafa, side: THREE.DoubleSide })
    const fillMesh = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), fillMat)
    fillMesh.position.z = -0.001  // just behind the lines
    scene.add(fillMesh)

    // Optional shape overlay on top of the perspective grid.
    // The PNG is expected to have transparent background.
    let shapeMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> | undefined
    let shapeTexture: THREE.Texture | undefined
    if (showShape && shapeImagePath) {
      shapeTexture = new THREE.TextureLoader().load(shapeImagePath)
      const shapeMat = new THREE.MeshBasicMaterial({
        map: shapeTexture,
        transparent: true,
        opacity: 1,
        alphaTest: 0.01,
        side: THREE.DoubleSide,
        depthTest: true,
        depthWrite: false,
      })
      shapeMesh = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), shapeMat)
      shapeMesh.position.z = -0.0005
      scene.add(shapeMesh)
    }

    // Subtle ambient + directional light (not actually needed for line/basic mats,
    // but good practice if we add more materials later)
    scene.add(new THREE.AmbientLight(0xffffff, 0.5))

    // ── Render loop ────────────────────────────────────────────────────
    let animId: number
    const render = () => {
      animId = requestAnimationFrame(render)
      renderer.render(scene, camera)
    }
    render()

    // ── Resize handler ─────────────────────────────────────────────────
    const onResize = () => {
      const w = mount.clientWidth
      const h = mount.clientHeight
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    }
    window.addEventListener('resize', onResize)

    // ── Cleanup ────────────────────────────────────────────────────────
    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('resize', onResize)
      renderer.dispose()
      if (shapeTexture) shapeTexture.dispose()
      if (shapeMesh) {
        shapeMesh.geometry.dispose()
        shapeMesh.material.dispose()
      }
      gridGeo.dispose()
      lineMat.dispose()
      borderGeo.dispose()
      borderMat.dispose()
      bottomEdgeGeo.dispose()
      bottomEdgeMat.dispose()
      markerGeo.dispose()
      markerMat.dispose()
      fillMat.dispose()
      fillMesh.geometry.dispose()
      mount.removeChild(renderer.domElement)
    }
  }, [gridSize, perspective, shapeImagePath, showShape])

  return <div ref={mountRef} className="w-full h-full" />
}
