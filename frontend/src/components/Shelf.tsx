import { memo, useImperativeHandle, useLayoutEffect, useMemo, useRef, type CSSProperties, type Ref } from 'react'
import { ShelfEngine, type TimelineLink } from '../shelf/engine'
import { virtualCount } from '../shelf/geometry'
import type { ShelfBook } from '../types'

/** Imperative surface the rest of the app uses to drive the RAF engine. */
export interface ShelfHandle {
  step(delta: number): void
  goTo(index: number): void
  setFrozen(frozen: boolean): void
  /** Sink the current volumes before a new catalogue is mounted. */
  spoolOut(): Promise<void>
  getActiveCover(): HTMLElement | null
  setTimeline(link: TimelineLink | null): void
}

interface ShelfProps {
  ref?: Ref<ShelfHandle>
  books: ShelfBook[]
  /** Real-book index to centre whenever `books` changes. */
  startIndex: number
  onActive: (index: number) => void
  onOpen: (index: number) => void
  onStep: () => void
}

const cssUrl = (url: string) => `url("${url.replace(/["\\\n\r]/g, (c) => encodeURIComponent(c))}")`

/** "Haruo Minase" → "H. MINASE", the way a binder abbreviates a spine. */
function spineAuthor(author: string): string {
  const parts = author.trim().split(/\s+/).filter(Boolean)
  if (parts.length < 2) return author.trim()
  const last = parts[parts.length - 1]
  return last.length > 9 ? last : `${parts[0][0]}. ${last}`
}

/*
 * Spine lettering is sized as fractions of H (applied through CSS calc), so it
 * survives resizes without re-rendering. The lettering panel is ~0.62 H tall;
 * the title gets ~0.38 H of it and the author ~0.17 H. An uppercase bold glyph
 * advances roughly 0.71em including tracking.
 */
const TITLE_RUN = 0.38
const AUTHOR_RUN = 0.165
const ADVANCE = 0.71

function titleFit(title: string): { fs: number; wrapped: boolean } {
  const len = Math.max(1, title.length)
  if (len <= 13) return { fs: Math.min(0.058, TITLE_RUN / (len * ADVANCE)), wrapped: false }
  // Longer titles break into two (occasionally three) vertical columns.
  const longestWord = Math.max(...title.split(/\s+/).map((w) => w.length))
  const column = Math.max(len / 2 + 3.5, longestWord + 0.5)
  return { fs: Math.max(0.017, Math.min(0.046, TITLE_RUN / (column * ADVANCE))), wrapped: true }
}

const authorFit = (author: string) => Math.max(0.014, Math.min(0.0235, AUTHOR_RUN / (Math.max(1, author.length) * 0.74)))

const BookBox = memo(function BookBox({ book, v }: { book: ShelfBook; v: number }) {
  const { spine, doc } = book
  const fit = titleFit(doc.title)
  const author = spineAuthor(doc.author)
  const style = {
    '--cloth': spine.cloth,
    '--cloth-deep': spine.clothDeep,
    '--foil': spine.foil,
    '--foil-hi': spine.foilHi,
    '--bands': spine.bands,
    '--title-fs': fit.fs,
    '--author-fs': authorFit(author),
  } as CSSProperties
  const artwork =
    book.cover === book.coverFallback ? cssUrl(book.cover) : `${cssUrl(book.cover)}, ${cssUrl(book.coverFallback)}`

  return (
    <div className={`book-box cloth-${spine.kind} foil-${spine.foilKind}`} data-v={v} style={style}>
      {/* Spine face: visible while the volume rests on the shelf */}
      <div className="face sp">
        <div className="spine-texture" />
        <div className="spine-emboss">
          <span className={fit.wrapped ? 'spine-title is-wrapped' : 'spine-title'}>{doc.title}</span>
          <span className="spine-author">{author}</span>
          <span className="spine-badge">{book.year ?? 'FOLIO'}</span>
        </div>
        <div className="shade-overlay" />
      </div>
      {/* Cover face: visible once the volume has turned 90° */}
      <div className="face cv">
        <div className="cover-artwork" style={{ backgroundImage: artwork }} />
        <div className="cover-frame" />
        <div className="shade-overlay" />
      </div>
    </div>
  )
})

/**
 * The curved 3D shelf. React renders the (virtual) book nodes once per
 * catalogue; ShelfEngine then owns their transforms on its own RAF loop, so no
 * React work happens while the shelf is moving.
 */
export const Shelf = memo(function Shelf({ ref, books, startIndex, onActive, onOpen, onStep }: ShelfProps) {
  const stageRef = useRef<HTMLDivElement>(null)
  const engineRef = useRef<ShelfEngine | null>(null)
  const timelineRef = useRef<TimelineLink | null>(null)
  const callbacks = useRef({ onActive, onOpen, onStep })
  const startRef = useRef(startIndex)

  useLayoutEffect(() => {
    callbacks.current = { onActive, onOpen, onStep }
    startRef.current = startIndex
  })

  useImperativeHandle(
    ref,
    () => ({
      step: (delta) => engineRef.current?.step(delta),
      goTo: (index) => engineRef.current?.goTo(index),
      setFrozen: (frozen) => engineRef.current?.setFrozen(frozen),
      spoolOut: () => engineRef.current?.spoolOut() ?? Promise.resolve(),
      getActiveCover: () => engineRef.current?.getActiveCover() ?? null,
      setTimeline: (link) => {
        timelineRef.current = link
        engineRef.current?.setTimeline(link)
      },
    }),
    [],
  )

  useLayoutEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const engine = new ShelfEngine(stage, {
      onActive: (index) => callbacks.current.onActive(index),
      onOpen: (index) => callbacks.current.onOpen(index),
      onStep: () => callbacks.current.onStep(),
    })
    engine.setTimeline(timelineRef.current)
    engineRef.current = engine
    return () => {
      engine.destroy()
      engineRef.current = null
    }
  }, [])

  // Re-spool: bind the engine to the freshly rendered nodes of a new catalogue.
  useLayoutEffect(() => {
    engineRef.current?.bind(books.length, startRef.current)
  }, [books])

  // §3.2 — three repetitions of the N books (or one, for a short finite shelf).
  const nodes = useMemo(() => {
    const total = virtualCount(books.length)
    return Array.from({ length: total }, (_, v) => {
      const book = books[v % books.length]
      return <BookBox key={`${v}:${book.id}`} book={book} v={v} />
    })
  }, [books])

  return (
    <div ref={stageRef} className="shelf-stage" role="group" aria-roledescription="carousel" aria-label="Curved shelf of folios">
      <div className="shelf-probe" aria-hidden="true" />
      <div className="floor-shadow" aria-hidden="true" />
      <div className="contact-anchor" aria-hidden="true">
        <div className="contact-shadow" />
      </div>
      <div className="shelf-arc">{nodes}</div>
    </div>
  )
})
