import { IS_FIRST_APP_LAUNCH } from '../utils/firstLaunch'

export interface Shape {
  id: string
  name: string
  /** Resolved URL to the PNG image — set automatically from the images folder */
  imagePath: string
}

// Auto-discover all PNGs in src/shapes/images-cropped/
// Adding a new .png file here will automatically include it after saving.
const imageModules = import.meta.glob('./images-cropped/*.png', { eager: true }) as Record<
  string,
  { default: string }
>

// Pretty-print a filename like "my-guitar.png" → "My Guitar"
function toDisplayName(filename: string): string {
  return filename
    .replace(/\.png$/i, '')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}

function shuffleInPlace<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[items[i], items[j]] = [items[j], items[i]]
  }
  return items
}

/** First launch: generated_06_tl first. Later visits: fully shuffled. Order stays fixed for this page load. */
function orderShapesForSession(items: Shape[]): Shape[] {
  if (!IS_FIRST_APP_LAUNCH) return shuffleInPlace([...items])
  const firstId = 'generated_06_tl'
  const firstIndex = items.findIndex(shape => shape.id === firstId)
  if (firstIndex < 0) return shuffleInPlace([...items])
  const rest = items.filter((_, index) => index !== firstIndex)
  return [items[firstIndex], ...shuffleInPlace(rest)]
}

export const shapes: Shape[] = orderShapesForSession(
  Object.entries(imageModules).map(([path, mod]) => {
    const filename = path.split('/').pop() ?? path
    const id = filename.replace(/\.png$/i, '')
    return {
      id,
      name: toDisplayName(filename),
      imagePath: mod.default,
    }
  }),
)
