import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { ApiError, api } from '../api/client'
import { catalogNo, formatPrice, hasDiscount } from '../lib/format'
import { clamp, easeInk } from '../lib/math'
import type { AuthSession, ShelfBook } from '../types'

/** §6.1 — sheet expansion. */
const OPEN_MS = 1050
const CLOSE_MS = 780
const EASE_INK = 'cubic-bezier(0.76, 0, 0.18, 1)'
/** §6.2 — seven blots, radius 0 → 720 over 1250ms, staggered. */
const BLOTS: [number, number][] = [
  [150, 330],
  [340, 600],
  [250, 120],
  [90, 760],
  [400, 250],
  [260, 860],
  [230, 470],
]
const BLOT_DELAYS = [0, 120, 220, 300, 380, 460, 540]
const BLOT_MS = 1250
const BLOT_RADIUS = 720
/** The ink starts once the sheet has opened far enough to show the poster column. */
const BLOT_START_MS = 260

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** clip-path inset() that frames exactly the given viewport rect. */
function insetFor(rect: DOMRect | null): string {
  const vw = window.innerWidth
  const vh = window.innerHeight
  if (!rect || rect.width < 2 || rect.height < 2) {
    return `inset(${vh * 0.3}px ${vw * 0.4}px ${vh * 0.3}px ${vw * 0.4}px round 3px)`
  }
  const top = clamp(rect.top, 0, vh)
  const right = clamp(vw - rect.right, 0, vw)
  const bottom = clamp(vh - rect.bottom, 0, vh)
  const left = clamp(rect.left, 0, vw)
  return `inset(${top.toFixed(1)}px ${right.toFixed(1)}px ${bottom.toFixed(1)}px ${left.toFixed(1)}px round 3px)`
}

const FULL = 'inset(0px 0px 0px 0px round 0px)'

interface DetailSheetProps {
  book: ShelfBook
  /** 0-based position in the current catalogue. */
  index: number
  /** Viewport rect of the 3D cover at the moment it was clicked. */
  origin: DOMRect | null
  /** Re-measures the cover so the sheet can fold back into it. */
  getCoverRect: () => DOMRect | null
  session: AuthSession | null
  onRequireLogin: () => void
  onSessionExpired: () => void
  /** Called after the closing animation has finished. */
  onClosed: () => void
}

type Purchase = { state: 'idle' } | { state: 'busy' } | { state: 'note' | 'error'; message: string }

const rv = (i: number) => ({ '--i': i }) as CSSProperties

/**
 * §6 — the archival folio sheet. It grows out of the 3D cover's projected
 * rectangle through an expanding clip-path, the poster bleeds in through an
 * feTurbulence/feDisplacementMap ink mask, and the acquisition button hands the
 * collector to Stripe Checkout via PUT /api/makePayment.
 */
export function DetailSheet({
  book,
  index,
  origin,
  getCoverRect,
  session,
  onRequireLogin,
  onSessionExpired,
  onClosed,
}: DetailSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null)
  const closeBtnRef = useRef<HTMLButtonElement>(null)
  const closing = useRef(false)
  const [purchase, setPurchase] = useState<Purchase>({ state: 'idle' })
  // Chrome paints its broken-image icon for a failed SVG <image>, so a cover
  // that cannot be loaded is dropped and the procedural one underneath shows.
  const [coverFailed, setCoverFailed] = useState(false)
  const { doc } = book

  // --- Open: clip-path blooms from the cover rect; ink blots spread --------
  useLayoutEffect(() => {
    const sheet = sheetRef.current
    if (!sheet) return
    const reduce = reducedMotion()

    const grow = sheet.animate([{ clipPath: insetFor(origin) }, { clipPath: FULL }], {
      duration: reduce ? 1 : OPEN_MS,
      easing: EASE_INK,
      fill: 'forwards',
    })
    sheet.classList.add('is-open')

    const circles = Array.from(sheet.querySelectorAll<SVGCircleElement>('.ink-blot'))
    const start = performance.now() + (reduce ? 0 : BLOT_START_MS)
    let raf = 0
    const spread = (now: number) => {
      let done = true
      circles.forEach((circle, i) => {
        const t = reduce ? 1 : clamp((now - start - BLOT_DELAYS[i]) / BLOT_MS, 0, 1)
        if (t < 1) done = false
        circle.setAttribute('r', (BLOT_RADIUS * easeInk(t)).toFixed(1))
      })
      if (!done) raf = requestAnimationFrame(spread)
    }
    raf = requestAnimationFrame(spread)

    return () => {
      cancelAnimationFrame(raf)
      grow.cancel()
      sheet.classList.remove('is-open')
    }
    // `origin` is captured once per opening, so this runs exactly once per mount.
  }, [origin])

  // --- Close: fold back into wherever the cover is now ----------------------
  const requestClose = useCallback(() => {
    const sheet = sheetRef.current
    if (closing.current) return
    closing.current = true
    if (!sheet) {
      onClosed()
      return
    }
    const fold = sheet.animate([{ clipPath: FULL }, { clipPath: insetFor(getCoverRect()) }], {
      duration: reducedMotion() ? 1 : CLOSE_MS,
      easing: EASE_INK,
      fill: 'forwards',
    })
    fold.onfinish = onClosed
    fold.oncancel = onClosed
  }, [getCoverRect, onClosed])

  useEffect(() => {
    closeBtnRef.current?.focus({ preventScroll: true })
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) {
        e.preventDefault()
        requestClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [requestClose])

  // --- Acquisition -----------------------------------------------------------
  const sold = doc.status === 'sold'
  const mine = sold && !!session && doc.brought === session.user.email

  const acquire = async () => {
    if (purchase.state === 'busy' || sold) return
    if (!book.live) {
      setPurchase({
        state: 'note',
        message:
          'This is a specimen folio from the built-in demonstration catalogue, so it cannot be purchased. Start the backend and add volumes to MongoDB to acquire real ones.',
      })
      return
    }
    if (!session) {
      setPurchase({ state: 'note', message: 'Sign in to your collector account to acquire this volume.' })
      onRequireLogin()
      return
    }
    setPurchase({ state: 'busy' })
    try {
      const res = await api.makePayment(doc, session.token)
      const url = res.session?.url
      if (!url) throw new ApiError('Stripe did not return a checkout address for this session.', 0)
      window.location.assign(url)
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onSessionExpired()
        setPurchase({ state: 'error', message: 'Your session has expired. Sign in again to continue.' })
        onRequireLogin()
        return
      }
      setPurchase({
        state: 'error',
        message: err instanceof Error ? err.message : 'The acquisition could not be started.',
      })
    }
  }

  let cta = (
    <>
      Acquire Volume — {formatPrice(doc.dprice)}
    </>
  )
  if (mine) cta = <>In your collection — Ex Libris</>
  else if (sold) cta = <>Sold</>
  else if (purchase.state === 'busy') cta = <>Opening Stripe Checkout…</>

  const titleId = `detail-title-${book.id}`

  return (
    <div ref={sheetRef} className="detail" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <button ref={closeBtnRef} type="button" className="detail-close bracket-btn label" onClick={requestClose}>
        Close
      </button>

      <div className="detail-grid">
        <section className="detail-text">
          <div className="detail-inner">
            <span className="rv" style={rv(0)}>
              <span className="detail-kicker label">
                <span>Archive Folio No. {catalogNo(index)}</span>
                <span className={sold ? 'is-sold' : undefined}>{sold ? 'Sold' : 'Available'}</span>
              </span>
            </span>

            <span className="rv" style={rv(1)}>
              <span className="detail-jp block">
                <span className="kanji">EX LIBRIS</span>
                {book.edition ?? 'Rare Edition'}
              </span>
            </span>

            <span className="rv" style={rv(2)}>
              <h1 id={titleId} className="detail-title">
                {doc.title}
              </h1>
            </span>

            <span className="rv" style={rv(3)}>
              <span className="detail-author label block">{doc.author}</span>
            </span>

            <span className="rv" style={rv(4)}>
              <dl className="meta-grid">
                <div>
                  <dt>Year</dt>
                  <dd>{book.year ?? 'n.d.'}</dd>
                </div>
                <div>
                  <dt>Category</dt>
                  <dd>{doc.category}</dd>
                </div>
                <div>
                  <dt>No. of Pages</dt>
                  <dd>{doc.noofpages}</dd>
                </div>
                <div>
                  <dt>Language</dt>
                  <dd>{doc.language}</dd>
                </div>
                <div>
                  <dt>ISBN</dt>
                  <dd>{doc.isbn}</dd>
                </div>
              </dl>
            </span>

            <span className="rv" style={rv(5)}>
              <p className="detail-abstract">{doc.abstract}</p>
            </span>

            <span className="rv" style={rv(6)}>
              <span className="block">
                <span className="imprint">
                  <span className="imprint-seal" aria-hidden="true">
                    ED
                  </span>
                  <span>
                    <small>Publisher imprint{book.edition ? ` · ${book.edition}` : ''}</small>
                    <strong>{doc.publisher}</strong>
                  </span>
                </span>
              </span>
            </span>

            {book.gallery.length > 0 && (
              <span className="rv" style={rv(7)}>
                <span className="gallery">
                  {book.gallery.map((src) => (
                    <img
                      key={src}
                      src={src}
                      alt=""
                      loading="lazy"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none'
                      }}
                    />
                  ))}
                </span>
              </span>
            )}

            <span className="rv" style={rv(8)}>
              <span className="acquire">
                <span className="price-badge">
                  <b>{formatPrice(doc.dprice)}</b>
                  {hasDiscount(doc) && <s>{formatPrice(doc.price)}</s>}
                </span>
                <button type="button" className="btn-acquire" onClick={acquire} disabled={sold || purchase.state === 'busy'}>
                  {cta}
                </button>
              </span>
            </span>

            <p
              className={purchase.state === 'error' ? 'acquire-note is-error' : 'acquire-note'}
              role={purchase.state === 'error' ? 'alert' : 'status'}
            >
              {purchase.state === 'note' || purchase.state === 'error' ? purchase.message : ''}
            </p>
          </div>
        </section>

        <section className="detail-poster" aria-hidden="true">
          <svg className="poster-svg" viewBox="0 0 474 900" preserveAspectRatio="xMidYMid slice">
            <defs>
              <filter id="ink-bleed-filter" x="-30%" y="-30%" width="160%" height="160%">
                <feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="3" seed="7" result="noise" />
                <feDisplacementMap in="SourceGraphic" in2="noise" scale="120" xChannelSelector="R" yChannelSelector="G" />
              </filter>
              <mask id="ink-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="474" height="900">
                <g filter="url(#ink-bleed-filter)">
                  {BLOTS.map(([cx, cy]) => (
                    <circle key={`${cx}-${cy}`} className="ink-blot" cx={cx} cy={cy} r="0" />
                  ))}
                </g>
              </mask>
            </defs>
            <g mask="url(#ink-mask)">
              {/* The procedural cover sits underneath in case the real artwork cannot be loaded. */}
              <image href={book.coverFallback} width="474" height="900" preserveAspectRatio="xMidYMid slice" />
              {book.cover !== book.coverFallback && !coverFailed && (
                <image
                  href={book.cover}
                  width="474"
                  height="900"
                  preserveAspectRatio="xMidYMid slice"
                  onError={() => setCoverFailed(true)}
                />
              )}
            </g>
          </svg>
        </section>
      </div>
    </div>
  )
}
