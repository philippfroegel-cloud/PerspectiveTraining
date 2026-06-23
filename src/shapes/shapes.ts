export interface Shape {
  id: string
  name: string
  /** Resolved URL to the PNG image — set automatically from the images folder */
  imagePath: string
}

// Auto-discover all PNGs in src/shapes/images/
// Adding a new .png file here will automatically include it after saving.
const imageModules = import.meta.glob('./images/*.png', { eager: true }) as Record<
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

export const shapes: Shape[] = Object.entries(imageModules).map(([path, mod]) => {
  const filename = path.split('/').pop() ?? path
  const id       = filename.replace(/\.png$/i, '')
  return {
    id,
    name:      toDisplayName(filename),
    imagePath: mod.default,
  }
})
