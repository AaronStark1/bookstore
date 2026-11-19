import { useEffect, useState } from 'react'
import { api, toShelfBook } from '../api/client'
import { FALLBACK_CATALOG } from '../data/fallbackCatalog'
import type { ApiStatus, ShelfBook } from '../types'

/** How long the boot screen waits for the backend before showing the specimen shelf. */
const BOOT_GRACE_MS = 1500
const SEARCH_DEBOUNCE_MS = 280

export interface Catalog {
  /** Books to put on the shelf (empty only while booting). */
  books: ShelfBook[]
  status: ApiStatus
  /** True when the shelf shows the built-in specimen folios rather than backend data. */
  specimen: boolean
  /** The current search matched nothing; `books` still holds the previous shelf. */
  noMatch: boolean
  searching: boolean
}

interface Source {
  full: ShelfBook[] | null
  status: ApiStatus
}

/** A chronological shelf when every volume has a year; otherwise backend order. */
function order(list: ShelfBook[]): ShelfBook[] {
  if (list.length === 0 || list.some((b) => b.year === undefined)) return list
  return [...list].sort((a, b) => a.year! - b.year!)
}

function localFilter(list: ShelfBook[], q: string): ShelfBook[] {
  const needle = q.toLowerCase()
  return list.filter((b) =>
    [b.doc.title, b.doc.author, b.doc.category, b.edition].some((field) => field?.toLowerCase().includes(needle)),
  )
}

/**
 * Loads the catalogue from GET /api/getBooks and keeps it searchable.
 *
 * - Backend reachable and seeded  → live books; search hits /api/getBooks?search=
 * - Backend reachable but empty   → specimen folios ("unseeded")
 * - Backend unreachable / too slow → specimen folios ("offline"), re-probed when
 *   the window regains focus so the shelf re-spools once the server is up.
 */
export function useCatalog(query: string): Catalog {
  const [source, setSource] = useState<Source>({ full: null, status: 'checking' })
  const [view, setView] = useState<{ books: ShelfBook[]; noMatch: boolean }>({ books: [], noMatch: false })
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    let alive = true
    let inFlight = false
    let latest: ApiStatus = 'checking'

    const load = async () => {
      if (inFlight) return
      inFlight = true
      try {
        const docs = await api.getBooks(undefined, undefined, 11000)
        if (!alive) return
        latest = docs.length > 0 ? 'online' : 'unseeded'
        if (docs.length > 0) setSource({ full: order(docs.map(toShelfBook)), status: 'online' })
        else setSource({ full: FALLBACK_CATALOG, status: 'unseeded' })
      } catch {
        if (!alive) return
        latest = 'offline'
        setSource((prev) => ({ full: prev.full ?? FALLBACK_CATALOG, status: 'offline' }))
      } finally {
        inFlight = false
      }
    }

    void load()
    // Do not hold the boot screen for a slow or half-configured backend.
    const grace = window.setTimeout(() => {
      if (alive) setSource((prev) => (prev.full ? prev : { ...prev, full: FALLBACK_CATALOG }))
    }, BOOT_GRACE_MS)

    const onFocus = () => {
      if (latest === 'offline' || latest === 'unseeded') void load()
    }
    window.addEventListener('focus', onFocus)
    return () => {
      alive = false
      window.clearTimeout(grace)
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  const { full, status } = source

  useEffect(() => {
    if (!full) return
    const q = query.trim()
    const controller = new AbortController()
    let cancelled = false

    const run = async () => {
      if (!q) {
        setView({ books: full, noMatch: false })
        setSearching(false)
        return
      }
      setSearching(true)
      let matches: ShelfBook[]
      if (status === 'online') {
        try {
          matches = order((await api.getBooks(q, controller.signal)).map(toShelfBook))
        } catch {
          if (cancelled) return
          matches = localFilter(full, q)
        }
      } else {
        matches = localFilter(full, q)
      }
      if (cancelled) return
      setSearching(false)
      setView((prev) =>
        matches.length > 0 ? { books: matches, noMatch: false } : { books: prev.books.length ? prev.books : full, noMatch: true },
      )
    }

    const timer = window.setTimeout(() => void run(), q ? SEARCH_DEBOUNCE_MS : 0)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [query, full, status])

  return {
    books: view.books,
    status,
    specimen: full === FALLBACK_CATALOG,
    noMatch: view.noMatch,
    searching,
  }
}
