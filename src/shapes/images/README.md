# Shape Images

Place your PNG silhouette images here.

## Naming convention

Name each file exactly after the shape's `id` in `shapes.ts`:

| Shape    | Filename        |
|----------|-----------------|
| Heart    | `heart.png`     |
| Guitar   | `guitar.png`    |
| Bottle   | `bottle.png`    |
| Arrow    | `arrow.png`     |
| Star     | `star.png`      |
| House    | `house.png`     |
| Fish     | `fish.png`      |
| Tree     | `tree.png`      |

## PNG requirements

- **Square canvas** (e.g. 512×512 px) — the app will scale it to fit the grid
- **Transparent background** — only the shape itself should have pixels
- **Black or dark fill / outline** — the app tints it amber on the grid
- Any drawing app works: Inkscape (free), Photoshop, Paint.NET, GIMP, etc.
  - In Inkscape: File → Export PNG, check "transparent background"
