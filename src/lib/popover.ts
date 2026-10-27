// Show a popover menu anchored to its trigger: below if it fits, otherwise above, kept on screen,
// and growing out of the trigger (transform-origin). Measured right after showing, before paint.
export function showAnchored(menu: HTMLElement, trigger: HTMLElement) {
  const r = trigger.getBoundingClientRect()
  menu.showPopover()
  const below = innerHeight - r.bottom > menu.offsetHeight + 8
  menu.style.left = `${Math.max(8, Math.min(r.left, innerWidth - menu.offsetWidth - 8))}px`
  menu.style.top = `${below ? r.bottom + 6 : Math.max(8, r.top - menu.offsetHeight - 6)}px`
  menu.style.transformOrigin = `${r.left + r.width / 2 - menu.offsetLeft}px ${below ? 'top' : 'bottom'}`
}

// Glass menu that grows in and out of its trigger (pair with popover="auto" and showAnchored).
export const menuClass =
  'glass fixed inset-auto m-0 overflow-y-auto rounded-2xl p-1 text-inherit opacity-0 scale-90 transition-[opacity,scale,display,overlay] transition-discrete duration-200 ease-[var(--ease-spring)] open:opacity-100 open:scale-100 starting:open:opacity-0 starting:open:scale-90 motion-reduce:scale-100'

export const itemClass =
  'press flex h-11 w-full items-center gap-3 rounded-xl px-3 text-left font-medium outline-none hover:bg-black/5 focus-visible:bg-black/5 dark:hover:bg-white/8 dark:focus-visible:bg-white/8'
