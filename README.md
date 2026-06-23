# PerspectiveTraining

A browser-based drawing tool that helps artists practice perspective and 3D drawing by providing reference shapes overlaid on grids — both flat and oriented in 3D space.

---

## What It Does

Artists often struggle with drawing objects in perspective because they cannot "feel" how a flat 2D reference translates onto a surface tilted in space. This tool bridges that gap by showing:

1. **Flat reference view** — a shape (heart, guitar, bottle, etc.) drawn on a 2D grid, so the artist can study its proportions cell by cell.
2. **Perspective grid view** — the same grid rendered as a plane tilted in 3D space. The artist can either print this grid and draw on paper, or draw directly in the browser.

By switching between the two views and practicing drawing the shape inside the perspective grid, artists train their eye and hand to understand foreshortening and spatial orientation.

---

## Feature Overview

### Current Features (v1)

| Feature | Description |
|---|---|
| Shape library | A set of built-in practice shapes (heart, guitar, bottle, arrow, star, house) defined as SVG paths |
| Flat reference view | The selected shape displayed on a square 2D grid with labeled cells |
| Perspective grid view | A 3D-rendered plane with the same grid lines, shown at a default tilt in perspective |
| Next shape | A button to cycle to the next shape in the library |
| Next orientation | A button to cycle through several preset camera angles / grid orientations |
| Grid density | A slider to set the number of grid cells (e.g. 4×4 up to 12×12) |
| Print support | A print button that hides all UI chrome and renders the current view full-page |
| Draw in browser | A toggle that places a transparent drawing canvas on top of the grid so the artist can draw freehand with a mouse or stylus; includes an eraser and clear button |
| Shape overlay toggle | A toggle to show or hide the reference shape on the perspective grid |

### Planned Features (v2+)

| Feature | Description |
|---|---|
| Mouse-drag grid rotation | Click and drag the perspective grid to freely rotate it in 3D space (Three.js `OrbitControls`) |
| Upload custom shapes | Upload an SVG file; the app extracts the path and adds it to the session's shape library |
| Shape on perspective grid | The reference shape rendered as a texture on the 3D plane |
| Difficulty presets | Pre-named camera angles: "Worm's eye", "Bird's eye", "3-point perspective", etc. |
| Save drawing | Export the user's freehand drawing as a PNG |

---

## Technology Stack

### Runtime & Build

| Tool | Version | Purpose |
|---|---|---|
| [Node.js](https://nodejs.org) | 20 LTS | JavaScript runtime |
| [Vite](https://vitejs.dev) | 5.x | Dev server and bundler — fast HMR, no config needed |
| [TypeScript](https://typescriptlang.org) | 5.x | Type safety across all source files |

### UI Framework

| Library | Purpose |
|---|---|
| [React](https://react.dev) 18 | Component model, state management, rendering |
| [Tailwind CSS](https://tailwindcss.com) 3 | Utility-class styling — no separate CSS files needed for layout |

### Rendering

| Library | Purpose |
|---|---|
| SVG (inline React) | Flat reference view — shapes and 2D grid. SVG is resolution-independent and prints perfectly. |
| [Three.js](https://threejs.org) | Perspective grid view — a `PlaneGeometry` with grid lines rendered via WebGL. Handles camera, projection, and (in v2) mouse interaction via `OrbitControls`. |
| [Fabric.js](http://fabricjs.com) | Freehand drawing layer — sits on top of both views as a transparent `<canvas>`. Provides brush, eraser, and clear operations. |

### Shape Data

Shapes are stored in `src/shapes/shapes.ts` as an array of objects:

```ts
interface Shape {
  id: string;
  name: string;         // Display name, e.g. "Heart"
  viewBox: string;      // SVG viewBox, e.g. "0 0 100 100"
  path: string;         // SVG path `d` attribute
}
```

This makes it trivial to add new shapes without touching any rendering code.

---

## Project Structure

```
PerspectiveTraining/
├── public/
│   └── favicon.svg
├── src/
│   ├── components/
│   │   ├── FlatView.tsx          # SVG shape + 2D grid
│   │   ├── PerspectiveView.tsx   # Three.js 3D grid plane
│   │   ├── DrawingCanvas.tsx     # Fabric.js freehand overlay
│   │   ├── Controls.tsx          # Next shape/orientation, grid density, toggles
│   │   └── PrintButton.tsx       # Triggers window.print()
│   ├── shapes/
│   │   └── shapes.ts             # Shape library (SVG path data)
│   ├── hooks/
│   │   └── useGridSettings.ts    # Shared state: gridSize, shapeIndex, orientation
│   ├── App.tsx                   # Root component, layout
│   ├── main.tsx                  # React entry point
│   └── index.css                 # Tailwind directives + print media query
├── index.html
├── tailwind.config.js
├── tsconfig.json
├── vite.config.ts
├── package.json
└── README.md
```

---

## How the Perspective Grid Works

The perspective grid is a flat plane in 3D space. Here is the data flow:

```
gridSize (e.g. 6)
        │
        ▼
Three.js Scene
  ├── PerspectiveCamera  (positioned above and to the side)
  ├── PlaneGeometry      (1×1 unit square, subdivided into gridSize×gridSize cells)
  │     └── rendered with EdgesGeometry → LineSegments (grid lines)
  └── GridHelper         (axis-aligned reference lines at the base)
```

The camera is placed at a fixed position for each orientation preset. In v2, `OrbitControls` will replace the fixed position with mouse-driven rotation.

---

## Getting Started (Development)

```bash
# Install dependencies
npm install

# Start dev server (opens at http://localhost:5173)
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

---

## Printing

Click the **Print** button or press `Ctrl+P`. The CSS `@media print` rule:
- Hides all control panels and buttons
- Renders the active view (flat or perspective) full-page
- Forces a white background so ink is not wasted

For best results, print the perspective grid without the shape overlay so you have a blank practice grid.

---

## Adding a New Shape

1. Find or create an SVG path for your shape.
2. Open `src/shapes/shapes.ts`.
3. Add an entry to the array:

```ts
{
  id: "my-shape",
  name: "My Shape",
  viewBox: "0 0 100 100",
  path: "M 50,10 L 90,90 L 10,90 Z"   // your SVG path d attribute
}
```

No other changes are needed — the shape will automatically appear in the rotation.
