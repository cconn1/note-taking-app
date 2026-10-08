import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import {
  hits,
  INK_COLORS,
  INK_WIDTH,
  inkHeight,
  outlinePath,
  roundPoints,
  simplify,
  strokePath,
  type InkColor,
  type Point,
  type Stroke,
  type Tool,
} from './lib/ink'

const SIZES: Record<Tool, number[]> = { pen: [3, 5, 9], highlighter: [16, 26, 40] }
const FILL: Record<InkColor, string> = {
  ink: 'fill-neutral-900 dark:fill-neutral-100', // black on light, near-white on dark
  blue: 'fill-blue-600 dark:fill-blue-400',
  red: 'fill-red-600 dark:fill-red-400',
  yellow: 'fill-yellow-400 dark:fill-yellow-300',
}
const DOT: Record<InkColor, string> = {
  ink: 'bg-neutral-900 dark:bg-neutral-100',
  blue: 'bg-blue-600 dark:bg-blue-400',
  red: 'bg-red-600 dark:bg-red-400',
  yellow: 'bg-yellow-400 dark:bg-yellow-300',
}
const ERASER_RADIUS = 10
const FINGER_KEY = 'sitrep-finger-draw'

type Action = { add: Stroke } | { erase: Stroke[] }
type Gesture = { id: number; erase: boolean; points: Point[]; remaining: Stroke[]; erased: Stroke[] }

// The nearest scrolling container: the page normally, the notes panel in full screen.
function scrollParent(el: Element | null): Element {
  for (let n = el?.parentElement; n; n = n.parentElement) {
    const o = getComputedStyle(n).overflowY
    if ((o === 'auto' || o === 'scroll') && n.scrollHeight > n.clientHeight) return n
  }
  return document.scrollingElement ?? document.documentElement
}

function readFinger() {
  try {
    return localStorage.getItem(FINGER_KEY) === '1'
  } catch {
    return false
  }
}

export default function Ink({ strokes, onChange }: { strokes: Stroke[]; onChange: (s: Stroke[]) => void }) {
  const svg = useRef<SVGSVGElement>(null)
  const [tool, setTool] = useState<Tool | 'eraser'>('pen')
  const [color, setColor] = useState<InkColor>('ink')
  const [sizeIndex, setSizeIndex] = useState(1)
  // Per device: on for a phone, off for an iPad with a Pencil.
  const [finger, setFinger] = useState(readFinger)
  const [extra, setExtra] = useState(0) // "Add space" / auto-grow, not saved
  const [live, setLive] = useState<Point[] | null>(null)
  const gesture = useRef<Gesture | null>(null)
  // A finger dragging the canvas while finger drawing is off: we scroll by hand (see touchAction).
  const scroll = useRef<{ id: number; y: number; el: Element } | null>(null)
  const frame = useRef(0)
  const grewAt = useRef(0) // the height we last grew from, so one frame can't grow twice
  const [history, setHistory] = useState<{ undo: Action[]; redo: Action[] }>({ undo: [], redo: [] })

  const drawTool: Tool = tool === 'eraser' ? 'pen' : tool
  const size = SIZES[drawTool][sizeIndex]
  const height = inkHeight(strokes) + extra

  function toggleFinger() {
    setFinger(!finger)
    try {
      localStorage.setItem(FINGER_KEY, finger ? '0' : '1')
    } catch {
      // Private mode: the setting just won't stick.
    }
  }

  // Screen position → page units.
  function toPoint(e: PointerEvent): Point {
    const r = svg.current!.getBoundingClientRect()
    const k = INK_WIDTH / r.width
    return [(e.clientX - r.left) * k, (e.clientY - r.top) * k, e.pointerType === 'pen' && e.pressure ? e.pressure : 0.5]
  }

  function record(action: Action) {
    setHistory((h) => ({ undo: [...h.undo, action], redo: [] }))
  }

  function eraseAt([x, y]: Point) {
    const g = gesture.current!
    const hit = g.remaining.filter((s) => hits(s, x, y, ERASER_RADIUS))
    if (!hit.length) return
    g.remaining = g.remaining.filter((s) => !hit.includes(s))
    g.erased.push(...hit)
    onChange(g.remaining)
  }

  function down(e: ReactPointerEvent<SVGSVGElement>) {
    if (gesture.current) return // a second pointer (e.g. a palm) while drawing
    if (e.pointerType === 'touch' && !finger) {
      scroll.current = { id: e.pointerId, y: e.clientY, el: scrollParent(e.currentTarget) }
      return
    }
    const allowed =
      e.pointerType === 'pen' || (e.pointerType === 'mouse' && e.button === 0) || (e.pointerType === 'touch' && finger)
    if (!allowed) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    scroll.current = null // the Pencil wins over a resting palm
    // A Windows pen's eraser end reports button 32.
    const erase = tool === 'eraser' || (e.buttons & 32) !== 0
    gesture.current = { id: e.pointerId, erase, points: [toPoint(e.nativeEvent)], remaining: strokes, erased: [] }
    if (erase) eraseAt(gesture.current.points[0])
    else setLive(gesture.current.points.slice())
  }

  function move(e: ReactPointerEvent<SVGSVGElement>) {
    const sc = scroll.current
    if (sc && e.pointerId === sc.id && !gesture.current) {
      sc.el.scrollBy(0, sc.y - e.clientY)
      sc.y = e.clientY
      return
    }
    const g = gesture.current
    if (!g || e.pointerId !== g.id) return
    // Coalesced events carry every Pencil sample between frames, for smoother strokes.
    const samples = e.nativeEvent.getCoalescedEvents?.()
    for (const ev of samples?.length ? samples : [e.nativeEvent]) {
      const p = toPoint(ev)
      g.points.push(p)
      if (g.erase) eraseAt(p)
    }
    if (g.erase) return
    // Writing near the bottom grows the page.
    if (g.points[g.points.length - 1][1] > height - 200 && grewAt.current !== height) {
      grewAt.current = height
      setExtra((x) => x + 400)
    }
    if (!frame.current)
      frame.current = requestAnimationFrame(() => {
        frame.current = 0
        setLive(gesture.current && !gesture.current.erase ? gesture.current.points.slice() : null)
      })
  }

  function up(e: ReactPointerEvent<SVGSVGElement>) {
    if (scroll.current?.id === e.pointerId) scroll.current = null
    const g = gesture.current
    if (!g || e.pointerId !== g.id) return
    gesture.current = null
    setLive(null)
    if (g.erase) {
      if (g.erased.length) record({ erase: g.erased })
      return
    }
    const stroke: Stroke = {
      id: crypto.randomUUID(),
      tool: drawTool,
      color,
      size,
      points: roundPoints(simplify(g.points)),
    }
    record({ add: stroke })
    onChange([...strokes, stroke])
  }

  function undo() {
    const action = history.undo.at(-1)
    if (!action) return
    onChange('add' in action ? strokes.filter((s) => s.id !== action.add.id) : [...strokes, ...action.erase])
    setHistory((h) => ({ undo: h.undo.slice(0, -1), redo: [...h.redo, action] }))
  }

  function redo() {
    const action = history.redo.at(-1)
    if (!action) return
    const ids = 'erase' in action ? new Set(action.erase.map((s) => s.id)) : null
    onChange('add' in action ? [...strokes, action.add] : strokes.filter((s) => !ids!.has(s.id)))
    setHistory((h) => ({ undo: [...h.undo, action], redo: h.redo.slice(0, -1) }))
  }

  function pickTool(t: Tool | 'eraser') {
    setTool(t)
    if (t === 'highlighter' && color === 'ink') setColor('yellow')
    if (t === 'pen' && color === 'yellow') setColor('ink')
  }

  // Highlighter strokes sit under the pen.
  const ordered = [...strokes.filter((s) => s.tool === 'highlighter'), ...strokes.filter((s) => s.tool === 'pen')]
  const btn = (on: boolean) =>
    `grid h-10 min-w-10 place-items-center rounded-lg px-2 text-sm font-medium ${on ? 'bg-accent text-white' : 'text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-900'}`

  return (
    <div>
      {/* Toolbar stays in view while you scroll the page. */}
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-1 border-b border-neutral-200 bg-white/95 py-1 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/95">
        <button onClick={() => pickTool('pen')} className={btn(tool === 'pen')}>
          Pen
        </button>
        <button onClick={() => pickTool('highlighter')} className={btn(tool === 'highlighter')}>
          Highlight
        </button>
        <button onClick={() => pickTool('eraser')} className={btn(tool === 'eraser')}>
          Erase
        </button>
        <span className="mx-1 h-6 w-px bg-neutral-200 dark:bg-neutral-800" />
        {INK_COLORS.map((c) => (
          <button
            key={c}
            onClick={() => {
              setColor(c)
              if (tool === 'eraser') setTool('pen')
            }}
            aria-label={`Color ${c}`}
            aria-pressed={color === c}
            className="grid size-10 place-items-center"
          >
            <span className={`size-6 rounded-full ${DOT[c]} ${color === c ? 'ring-2 ring-accent ring-offset-2 ring-offset-white dark:ring-offset-neutral-950' : ''}`} />
          </button>
        ))}
        <span className="mx-1 h-6 w-px bg-neutral-200 dark:bg-neutral-800" />
        {SIZES.pen.map((_, i) => (
          <button key={i} onClick={() => setSizeIndex(i)} aria-label={`Width ${i + 1}`} aria-pressed={sizeIndex === i} className={btn(sizeIndex === i)}>
            <span className="rounded-full bg-current" style={{ width: 4 + i * 4, height: 4 + i * 4 }} />
          </button>
        ))}
        <span className="mx-1 h-6 w-px bg-neutral-200 dark:bg-neutral-800" />
        <button onClick={undo} disabled={!history.undo.length} aria-label="Undo" className={`${btn(false)} text-lg disabled:opacity-30`}>
          ↶
        </button>
        <button onClick={redo} disabled={!history.redo.length} aria-label="Redo" className={`${btn(false)} text-lg disabled:opacity-30`}>
          ↷
        </button>
        <button onClick={toggleFinger} aria-pressed={finger} className={`ml-auto ${btn(finger)}`} title="Draw with your finger (phones)">
          Finger
        </button>
      </div>

      <svg
        ref={svg}
        viewBox={`0 0 ${INK_WIDTH} ${height}`}
        // touch-action none: Safari delivers every Pencil sample immediately instead of holding
        // events back while it decides whether a gesture is a scroll. Finger scrolling is done above.
        style={{ aspectRatio: `${INK_WIDTH} / ${height}`, touchAction: 'none' }}
        shapeRendering="geometricPrecision"
        className={`block w-full select-none [-webkit-touch-callout:none] ${tool === 'eraser' ? 'cursor-cell' : 'cursor-crosshair'}`}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
      >
        <defs>
          <pattern id="ink-lines" width={INK_WIDTH} height="48" patternUnits="userSpaceOnUse">
            <path d={`M0 47.5H${INK_WIDTH}`} className="stroke-neutral-200 dark:stroke-neutral-800" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width={INK_WIDTH} height={height} fill="url(#ink-lines)" />
        {ordered.map((s) => (
          <path key={s.id} d={strokePath(s)} className={`${FILL[s.color]} ${s.tool === 'highlighter' ? 'opacity-35' : ''}`} />
        ))}
        {live && (
          <path d={outlinePath(live, drawTool, size, false)} className={`${FILL[color]} ${drawTool === 'highlighter' ? 'opacity-35' : ''}`} />
        )}
      </svg>

      <button onClick={() => setExtra((x) => x + 600)} className="mt-2 h-10 w-full rounded-lg text-sm text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-900">
        + Add space
      </button>
    </div>
  )
}
