import * as THREE from 'three'

const textureCache = new Map<string, THREE.Texture>()
const texturePending = new Map<string, Promise<THREE.Texture>>()
const textureLoader = new THREE.TextureLoader()

/** Warm browser image cache (helps FlatView SVG + Three.js decode). */
export function prefetchShapeImages(urls: string[]) {
  for (const url of urls) {
    const img = new Image()
    img.decoding = 'async'
    img.src = url
  }
}

/** Start loading all shape textures as early as possible. */
export function prefetchShapeTextures(urls: string[]) {
  prefetchShapeImages(urls)

  for (const url of urls) {
    if (textureCache.has(url) || texturePending.has(url)) continue

    const promise = new Promise<THREE.Texture>((resolve, reject) => {
      textureLoader.load(
        url,
        texture => {
          textureCache.set(url, texture)
          texturePending.delete(url)
          resolve(texture)
        },
        undefined,
        error => {
          texturePending.delete(url)
          reject(error)
        }
      )
    })

    texturePending.set(url, promise)
  }
}

export function getCachedShapeTexture(url: string): THREE.Texture | undefined {
  return textureCache.get(url)
}

export function acquireShapeTexture(
  url: string,
  onReady: (texture: THREE.Texture) => void,
): () => void {
  let cancelled = false

  const cached = textureCache.get(url)
  if (cached) {
    onReady(cached)
    return () => {
      cancelled = true
    }
  }

  const pending = texturePending.get(url)
  if (pending) {
    pending
      .then(texture => {
        if (!cancelled) onReady(texture)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }

  textureLoader.load(url, texture => {
    if (cancelled) {
      texture.dispose()
      return
    }
    textureCache.set(url, texture)
    onReady(texture)
  })

  return () => {
    cancelled = true
  }
}
