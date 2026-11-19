import { catalogNo, formatPrice } from '../lib/format'
import type { ShelfBook } from '../types'
import { SideSheet } from './SideSheet'

interface CatalogIndexProps {
  books: ShelfBook[]
  activeIndex: number
  specimen: boolean
  onPick: (index: number) => void
  onClosed: () => void
}

/** [CATALOG] — a plain index of the volumes on the shelf; picking one glides the arc to it. */
export function CatalogIndex({ books, activeIndex, specimen, onPick, onClosed }: CatalogIndexProps) {
  return (
    <SideSheet label="Catalogue Index" onClosed={onClosed}>
      {(close) => (
        <>
          <h2 className="sheet-title">{books.length} folios</h2>
          <p className="form-message">
            {specimen
              ? 'Built-in specimen catalogue — shown because the archive server is offline or holds no books yet.'
              : 'Live from the archive server.'}
          </p>
          <div>
            {books.map((book, i) => (
              <button
                key={book.id}
                type="button"
                className="index-row"
                aria-current={i === activeIndex}
                onClick={() => {
                  onPick(i)
                  close()
                }}
              >
                <span className="no">{book.year ?? catalogNo(i)}</span>
                <span>
                  <span className="ttl">{book.doc.title}</span>
                  <span className="by">{book.doc.author}</span>
                </span>
                <span className="amt">{book.doc.status === 'sold' ? 'Sold' : formatPrice(book.doc.dprice)}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </SideSheet>
  )
}
