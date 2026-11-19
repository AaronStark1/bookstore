import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

interface SideSheetProps {
  label: string
  variant?: 'index' | 'auth'
  onClosed: () => void
  children: (close: () => void) => ReactNode
}

/**
 * A paper sheet that unrolls from the right edge through a clip-path (no fade),
 * and rolls back before unmounting. Used by the catalogue index and the
 * collector sign-in form.
 */
export function SideSheet({ label, variant = 'index', onClosed, children }: SideSheetProps) {
  const [closing, setClosing] = useState(false)
  const ref = useRef<HTMLElement>(null)
  const close = useCallback(() => setClosing(true), [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) {
        e.preventDefault()
        close()
      }
    }
    window.addEventListener('keydown', onKey)
    ref.current?.querySelector<HTMLElement>('input, button')?.focus({ preventScroll: true })
    return () => window.removeEventListener('keydown', onKey)
  }, [close])

  return (
    <aside
      ref={ref}
      className={`side-sheet${variant === 'auth' ? ' is-auth' : ''}${closing ? ' is-closing' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={label}
      onAnimationEnd={(e) => {
        if (closing && e.target === e.currentTarget) onClosed()
      }}
    >
      <div className="sheet-head label">
        <span>{label}</span>
        <button type="button" className="bracket-btn" onClick={close}>
          Close
        </button>
      </div>
      <div className="sheet-body">{children(close)}</div>
    </aside>
  )
}
