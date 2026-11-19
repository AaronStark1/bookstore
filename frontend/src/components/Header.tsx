import { memo, useEffect, useRef } from 'react'
import type { AuthSession } from '../types'

interface HeaderProps {
  query: string
  onQuery: (value: string) => void
  searchOpen: boolean
  onSearchOpen: (open: boolean) => void
  /** Short status shown beside the field: match count, "searching", "no match". */
  searchStatus: string
  searchMiss: boolean
  catalogOpen: boolean
  onCatalog: () => void
  session: AuthSession | null
  onLogin: () => void
  onLogout: () => void
}

export const Header = memo(function Header({
  query,
  onQuery,
  searchOpen,
  onSearchOpen,
  searchStatus,
  searchMiss,
  catalogOpen,
  onCatalog,
  session,
  onLogin,
  onLogout,
}: HeaderProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (searchOpen) inputRef.current?.focus({ preventScroll: true })
  }, [searchOpen])

  return (
    <header className="site-header label">
      <div className="brand">
        <span>Bibliotheca Obscura</span>
        <span className="brand-sub">— Collector Archive</span>
      </div>

      <nav className="site-nav" aria-label="Archive">
        <div className="search-wrap" role="search">
          <div className={searchOpen ? 'search-field is-open' : 'search-field'}>
            <input
              ref={inputRef}
              type="search"
              value={query}
              placeholder="Title…"
              aria-label="Search the archive by title"
              tabIndex={searchOpen ? 0 : -1}
              autoComplete="off"
              spellCheck={false}
              enterKeyHint="search"
              onChange={(e) => onQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault()
                  onQuery('')
                  onSearchOpen(false)
                } else if (e.key === 'Enter') {
                  e.currentTarget.blur()
                }
              }}
            />
            <span className={searchMiss ? 'search-status is-miss' : 'search-status'} aria-live="polite">
              {searchStatus}
            </span>
          </div>
          <button
            type="button"
            className="bracket-btn"
            aria-expanded={searchOpen}
            onClick={() => {
              if (searchOpen) onQuery('')
              onSearchOpen(!searchOpen)
            }}
          >
            {searchOpen ? 'Clear' : 'Search'}
          </button>
        </div>
        <button type="button" className="bracket-btn" aria-expanded={catalogOpen} onClick={onCatalog}>
          Catalog
        </button>
        {session ? (
          <button type="button" className="bracket-btn" onClick={onLogout} title={`Signed in as ${session.user.username}`}>
            Logout
          </button>
        ) : (
          <button type="button" className="bracket-btn" onClick={onLogin}>
            Login
          </button>
        )}
      </nav>
    </header>
  )
})
