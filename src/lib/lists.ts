import { createContext, useContext } from 'react'

export type List = { id: string; name: string; color: string }

// Military field colors, all dark enough for white text in light and dark mode.
export const LIST_COLORS = [
  '#4b5320', // olive drab
  '#81613c', // coyote brown
  '#2f3b4c', // navy
  '#6b2c2c', // oxblood
  '#5d6458', // field gray
  '#7a6a4f', // flat dark earth
  '#3d4a32', // ranger green
]

// The user's to-do lists, loaded once by Layout and shared with every screen and task row.
export const ListsContext = createContext<List[]>([])
export const useLists = () => useContext(ListsContext)

// The list tab last picked on Home ('all' or a list id). Quick Add defaults to it.
export const LIST_TAB_KEY = 'sitrep-list-tab'
export function readListTab() {
  try {
    return localStorage.getItem(LIST_TAB_KEY) ?? 'all'
  } catch {
    return 'all'
  }
}
