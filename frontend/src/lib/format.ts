import type { BookDocument } from '../types'

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
})

export const formatPrice = (value: number) => (Number.isFinite(Number(value)) ? inr.format(Number(value)) : '—')

/** The struck-through retail price is only shown when it is actually higher. */
export const hasDiscount = (doc: BookDocument) => Number(doc.price) > Number(doc.dprice)

export const catalogNo = (index: number) => String(index + 1).padStart(3, '0')
