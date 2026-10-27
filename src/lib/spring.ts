// Apple-style physics for gestures (WWDC "Designing Fluid Interfaces"), framework-free.

const reduceMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Animate a number from `from` to `to` with a damped spring, starting at `velocity` (units/s).
 * response = seconds to (roughly) reach the target; damping 1 = no overshoot, ~0.8 = a little bounce
 * (use bounce only after a flick). Returns a cancel function; re-target by cancelling and starting a
 * new spring from the current value and velocity (onUpdate reports both).
 */
export function spring(
  from: number,
  to: number,
  opts: { velocity?: number; response?: number; damping?: number; onUpdate: (x: number, v: number) => void; onDone?: () => void },
) {
  const { response = 0.4, damping = 1, onUpdate, onDone } = opts
  if (reduceMotion()) {
    onUpdate(to, 0)
    onDone?.()
    return () => {}
  }
  const k = (2 * Math.PI / response) ** 2 // stiffness, mass 1
  const c = (4 * Math.PI * damping) / response // damping coefficient
  let x = from
  let v = opts.velocity ?? 0
  let last = performance.now()
  let raf = requestAnimationFrame(function tick(now) {
    // Small fixed steps keep a stiff spring stable even when a frame is late.
    let dt = Math.min(0.064, (now - last) / 1000)
    last = now
    while (dt > 0) {
      const h = Math.min(dt, 1 / 240)
      v += (-k * (x - to) - c * v) * h
      x += v * h
      dt -= h
    }
    if (Math.abs(x - to) < 0.5 && Math.abs(v) < 20) {
      onUpdate(to, 0)
      onDone?.()
      return
    }
    onUpdate(x, v)
    raf = requestAnimationFrame(tick)
  })
  return () => cancelAnimationFrame(raf)
}

/** Where a flick would come to rest (scroll-style deceleration). Add to the release position. */
export const project = (velocity: number, decelerationRate = 0.998) =>
  ((velocity / 1000) * decelerationRate) / (1 - decelerationRate)

/** Soft boundary: how far to move for `overshoot` px dragged past an edge. */
export const rubberband = (overshoot: number, dimension: number, constant = 0.55) =>
  (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot))

/** Pointer velocity (units/s) from the last ~100 ms of samples. */
export function velocityTracker() {
  const pts: [number, number][] = []
  return {
    add(x: number, t = performance.now()) {
      pts.push([x, t])
      while (pts.length > 2 && t - pts[0][1] > 100) pts.shift()
    },
    get() {
      if (pts.length < 2) return 0
      const [x0, t0] = pts[0]
      const [x1, t1] = pts[pts.length - 1]
      return t1 > t0 ? ((x1 - x0) / (t1 - t0)) * 1000 : 0
    },
  }
}
