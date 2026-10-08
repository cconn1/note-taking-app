import getStroke from 'perfect-freehand'

// Handwriting is stored as strokes (data, not images) in pages.ink.
// Coordinates are in page units: the page is always 1000 wide, y grows downward,
// so the same ink scales to any screen (the SVG viewBox does the scaling).
export const INK_WIDTH = 1000

export type Point = [x: number, y: number, pressure: number]
export const INK_COLORS = ['ink', 'blue', 'red', 'yellow'] as const
export type InkColor = (typeof INK_COLORS)[number]
export type Tool = 'pen' | 'highlighter'
export type Stroke = { id: string; tool: Tool; color: InkColor; size: number; points: Point[] }

// Distance from p to the segment a–b.
export function segDist([px, py]: readonly number[], [ax, ay]: readonly number[], [bx, by]: readonly number[]) {
  const dx = bx - ax
  const dy = by - ay
  const len = dx * dx + dy * dy
  const t = len ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len)) : 0
  return Math.hypot(px - ax - t * dx, py - ay - t * dy)
}

// Ramer–Douglas–Peucker on x/y (kept points keep their pressure). Run once when a stroke ends.
export function simplify(points: Point[], tolerance = 0.4): Point[] {
  if (points.length < 3) return points
  const keep = new Uint8Array(points.length)
  keep[0] = keep[points.length - 1] = 1
  const stack: [number, number][] = [[0, points.length - 1]]
  while (stack.length) {
    const [a, b] = stack.pop()!
    let max = 0
    let idx = -1
    for (let i = a + 1; i < b; i++) {
      const d = segDist(points[i], points[a], points[b])
      if (d > max) [max, idx] = [d, i]
    }
    if (max > tolerance) {
      keep[idx] = 1
      stack.push([a, idx], [idx, b])
    }
  }
  return points.filter((_, i) => keep[i])
}

// 1 decimal for position, 2 for pressure: plenty for handwriting, much smaller JSON.
export const roundPoints = (points: Point[]): Point[] =>
  points.map(([x, y, p]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10, Math.round(p * 100) / 100])

// Does an eraser at (x, y) with this radius touch the stroke?
export function hits(stroke: Stroke, x: number, y: number, radius: number) {
  const r = radius + stroke.size / 2
  const pts = stroke.points
  if (pts.length === 1) return Math.hypot(pts[0][0] - x, pts[0][1] - y) <= r
  for (let i = 1; i < pts.length; i++) if (segDist([x, y], pts[i - 1], pts[i]) <= r) return true
  return false
}

// Canvas height in page units: room below the lowest stroke, never shorter than a page.
export const inkHeight = (strokes: Stroke[]) =>
  Math.max(1200, ...strokes.flatMap((s) => s.points.map((p) => p[1] + 400)))

// SVG path for a stroke's outline. perfect-freehand turns the points into a pressure-shaped
// outline at draw time, so only the raw points are stored.
export function outlinePath(points: Point[], tool: Tool, size: number, last = true) {
  // Mice and fingers report a flat 0.5; let perfect-freehand fake pressure from speed instead.
  const simulatePressure = points.every((p) => p[2] === 0.5)
  const outline = getStroke(points, {
    size,
    thinning: tool === 'highlighter' ? 0 : 0.6,
    smoothing: 0.5,
    streamline: 0.4,
    simulatePressure,
    last,
  })
  if (!outline.length) return ''
  const d: (string | number)[] = ['M', ...outline[0], 'Q']
  outline.forEach(([x0, y0], i) => {
    const [x1, y1] = outline[(i + 1) % outline.length]
    d.push(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2)
  })
  d.push('Z')
  return d.map((v) => (typeof v === 'number' ? Math.round(v * 10) / 10 : v)).join(' ')
}

// Strokes never change once drawn, so each one's path is computed once.
const pathCache = new WeakMap<Stroke, string>()
export function strokePath(stroke: Stroke) {
  let d = pathCache.get(stroke)
  if (d === undefined) pathCache.set(stroke, (d = outlinePath(stroke.points, stroke.tool, stroke.size)))
  return d
}
