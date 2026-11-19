import { useCallback, useEffect, useRef, useState } from 'react'
import { PaperGrain, Monoliths } from './components/Atmosphere'
import { AuthSheet } from './components/AuthSheet'
import { BootCurtain } from './components/BootCurtain'
import { Caption } from './components/Caption'
import { CatalogIndex } from './components/CatalogIndex'
import { DetailSheet } from './components/DetailSheet'
import { Header } from './components/Header'
import { PaymentNotice } from './components/PaymentNotice'
import { Shelf, type ShelfHandle } from './components/Shelf'
import { Timeline } from './components/Timeline'
import { useAuth } from './hooks/useAuth'
import { useCatalog } from './hooks/useCatalog'
import { tactileAudio } from './lib/audio'
import type { ApiStatus, ShelfBook } from './types'

const API_LABEL: Record<ApiStatus, string> = {
  checking: 'REST API: Checking',
  online: 'REST API: Online',
  unseeded: 'REST API: Online · No books yet — Specimen catalogue',
  offline: 'REST API: Offline — Specimen catalogue',
}

interface OpenFolio {
  book: ShelfBook
  index: number
  origin: DOMRect | null
}

/**
 * State machine (FRONTEND_PROMPT.md §8):
 *   BOOT → IDLE SHELF ⇄ SCRUBBING (engine) / FILTERING (re-spool) → DETAIL OPEN
 * React owns the catalogue, overlays and auth; the shelf engine owns every frame.
 */
export default function App() {
  const shelfRef = useRef<ShelfHandle>(null)
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const catalog = useCatalog(query)
  const { session, login, register, logout } = useAuth()

  // The catalogue actually standing on the shelf (lags `catalog.books` during a re-spool).
  const [shelf, setShelf] = useState<{ books: ShelfBook[]; start: number }>({ books: [], start: 0 })
  const [activeIndex, setActiveIndex] = useState(0)
  const [folio, setFolio] = useState<OpenFolio | null>(null)
  const [catalogOpen, setCatalogOpen] = useState(false)
  const [authOpen, setAuthOpen] = useState(false)
  const [sound, setSound] = useState(tactileAudio.enabled)

  // FILTERING — sink the old volumes, then mount the new arc around the same book if it survived.
  useEffect(() => {
    if (folio || catalog.books.length === 0 || catalog.books === shelf.books) return
    let cancelled = false
    const next = catalog.books
    const activeId = shelf.books[activeIndex]?.id
    void (shelfRef.current?.spoolOut() ?? Promise.resolve()).then(() => {
      if (cancelled) return
      const keep = Math.max(0, next.findIndex((b) => b.id === activeId))
      setShelf({ books: next, start: keep })
      setActiveIndex(keep)
    })
    return () => {
      cancelled = true
    }
  }, [catalog.books, shelf.books, activeIndex, folio])

  // DETAIL OPEN (and the side sheets) freeze the shelf.
  const overlayOpen = !!folio || catalogOpen || authOpen
  useEffect(() => {
    shelfRef.current?.setFrozen(overlayOpen)
  }, [overlayOpen])

  // Web Audio may only start from a user gesture.
  useEffect(() => {
    window.addEventListener('pointerdown', tactileAudio.unlock)
    window.addEventListener('keydown', tactileAudio.unlock)
    return () => {
      window.removeEventListener('pointerdown', tactileAudio.unlock)
      window.removeEventListener('keydown', tactileAudio.unlock)
    }
  }, [])

  const onStep = useCallback(() => tactileAudio.tick(), [])

  const openFolio = useCallback(
    (index: number) => {
      const book = shelf.books[index]
      if (!book) return
      // §6.1 — the sheet grows out of the cover's projected screen rectangle.
      const origin = shelfRef.current?.getActiveCover()?.getBoundingClientRect() ?? null
      tactileAudio.flutter()
      setFolio({ book, index, origin })
    },
    [shelf.books],
  )

  const getCoverRect = useCallback(() => shelfRef.current?.getActiveCover()?.getBoundingClientRect() ?? null, [])
  const closeFolio = useCallback(() => setFolio(null), [])
  const prev = useCallback(() => shelfRef.current?.step(-1), [])
  const next = useCallback(() => shelfRef.current?.step(1), [])
  const openAuth = useCallback(() => setAuthOpen(true), [])
  const toggleCatalog = useCallback(() => setCatalogOpen((open) => !open), [])

  const toggleSound = () => {
    const on = !sound
    tactileAudio.setEnabled(on)
    if (on) tactileAudio.unlock()
    setSound(on)
  }

  const count = shelf.books.length
  const activeBook = shelf.books[Math.min(activeIndex, Math.max(0, count - 1))]
  const searching = query.trim().length > 0
  const searchStatus = !searching ? '' : catalog.searching ? 'Searching…' : catalog.noMatch ? 'No match' : `${count} found`

  return (
    <div className="app">
      <Monoliths />

      {count > 0 && (
        <>
          <Shelf
            ref={shelfRef}
            books={shelf.books}
            startIndex={shelf.start}
            onActive={setActiveIndex}
            onOpen={openFolio}
            onStep={onStep}
          />
          <Caption book={activeBook} no={activeIndex + 1} onPrev={prev} onNext={next} />
          <Timeline books={shelf.books} shelf={shelfRef} />
        </>
      )}

      <Header
        query={query}
        onQuery={setQuery}
        searchOpen={searchOpen}
        onSearchOpen={setSearchOpen}
        searchStatus={searchStatus}
        searchMiss={searching && catalog.noMatch && !catalog.searching}
        catalogOpen={catalogOpen}
        onCatalog={toggleCatalog}
        session={session}
        onLogin={openAuth}
        onLogout={logout}
      />

      <footer className="site-footer">
        <span className="footer-copy">© Bibliotheca Obscura. All rights reserved.</span>
        <span className="api-status" data-status={catalog.status}>
          {API_LABEL[catalog.status]}
        </span>
        <button type="button" onClick={toggleSound} aria-pressed={sound}>
          Sound: {sound ? 'On' : 'Off'}
        </button>
      </footer>

      {catalogOpen && (
        <CatalogIndex
          books={shelf.books}
          activeIndex={activeIndex}
          specimen={catalog.specimen}
          onPick={(index) => shelfRef.current?.goTo(index)}
          onClosed={() => setCatalogOpen(false)}
        />
      )}

      {folio && (
        <DetailSheet
          key={folio.book.id}
          book={folio.book}
          index={folio.index}
          origin={folio.origin}
          getCoverRect={getCoverRect}
          session={session}
          onRequireLogin={openAuth}
          onSessionExpired={logout}
          onClosed={closeFolio}
        />
      )}

      {authOpen && <AuthSheet onLogin={login} onRegister={register} onClosed={() => setAuthOpen(false)} />}

      <PaymentNotice />
      <BootCurtain ready={count > 0} />
      <PaperGrain />
    </div>
  )
}
