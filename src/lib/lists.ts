import { createContext, useContext } from 'react'

export type List = { id: string; name: string }

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
