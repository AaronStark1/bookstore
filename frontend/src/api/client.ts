/**
 * REST client for the Bookstore Express backend — FRONTEND_PROMPT.md §7.
 *
 * Requests use same-origin relative URLs: vite.config.ts proxies /api and
 * /uploads to the backend (default http://localhost:3000). Set VITE_API_BASE to
 * call a backend on another origin directly instead.
 */
import { hash32 } from '../lib/math'
import { CLOTHS, FOILS, isMotif, makeCoverSvg, makeSpineStyle, proceduralCover, svgToDataUri } from '../lib/procedural'
import type { AuthUser, BookDocument, FoilKind, ShelfBook } from '../types'

const API_BASE = ((import.meta.env.VITE_API_BASE as string | undefined) ?? '').replace(/\/+$/, '')

export class ApiError extends Error {
  readonly status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT'
  body?: unknown
  token?: string
  signal?: AbortSignal
  timeoutMs?: number
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const controller = new AbortController()
  const onAbort = () => controller.abort()
  opts.signal?.addEventListener('abort', onAbort)
  if (opts.signal?.aborted) controller.abort()
  let timedOut = false
  const timer = window.setTimeout(() => {
    timedOut = true
    controller.abort()
  }, opts.timeoutMs ?? 12000)

  try {
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json'
    if (opts.token) headers.Authorization = `Bearer ${opts.token}`
    const res = await fetch(`${API_BASE}${path}`, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal,
    })
    const text = await res.text()
    let data: unknown = null
    try {
      data = text ? JSON.parse(text) : null
    } catch {
      data = null
    }
    if (!res.ok) {
      // The backend reports errors as bare JSON strings ("Password Mismatch!") or { message }.
      let message = ''
      if (typeof data === 'string') message = data
      else if (data && typeof data === 'object' && typeof (data as { message?: unknown }).message === 'string') {
        message = (data as { message: string }).message
      }
      // 502–504 come from the dev proxy (or a gateway) when the backend itself is down.
      const gateway = res.status >= 502 && res.status <= 504
      throw new ApiError(
        message || (gateway ? 'The archive server is unreachable.' : `The archive server answered with an error (${res.status}).`),
        res.status,
      )
    }
    return data as T
  } catch (err) {
    if (err instanceof ApiError) throw err
    if (timedOut) throw new ApiError('The archive server did not answer in time.', 0)
    if (opts.signal?.aborted) throw err
    throw new ApiError('The archive server is unreachable.', 0)
  } finally {
    window.clearTimeout(timer)
    opts.signal?.removeEventListener('abort', onAbort)
  }
}

/** The backend feeds `search` straight into a Mongo $regex — escape it so input is matched literally. */
const escapeRegex = (q: string) => q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export interface LoginResponse {
  message: string
  existingUser: AuthUser
  token: string
}

export interface PaymentResponse {
  message: string
  session: { id: string; url?: string | null }
  sessionID: string
}

export const api = {
  /** GET /api/getBooks[?search=] — public. */
  async getBooks(search?: string, signal?: AbortSignal, timeoutMs?: number): Promise<BookDocument[]> {
    const q = search?.trim()
    const path = q ? `/api/getBooks?search=${encodeURIComponent(escapeRegex(q))}` : '/api/getBooks'
    const data = await request<unknown>(path, { signal, timeoutMs })
    if (!Array.isArray(data)) throw new ApiError('The archive returned an unexpected catalogue.', 0)
    return data.filter((d): d is BookDocument => !!d && typeof d === 'object' && typeof d._id === 'string' && typeof d.title === 'string')
  },

  /** POST /api/login — public. */
  login(email: string, password: string) {
    return request<LoginResponse>('/api/login', { method: 'POST', body: { email, password } })
  },

  /** POST /api/register — public. */
  register(username: string, email: string, password: string) {
    return request<{ message: string }>('/api/register', { method: 'POST', body: { username, email, password } })
  },

  /**
   * PUT /api/makePayment — bearer token. The backend marks the book sold and
   * answers with a Stripe Checkout session; the caller redirects to session.url.
   * The stored document is sent back unchanged (no frontend-derived fields).
   */
  makePayment(book: BookDocument, token: string) {
    return request<PaymentResponse>('/api/makePayment', {
      method: 'PUT',
      token,
      body: { bookDetails: book },
      timeoutMs: 20000,
    })
  },
}

/** §7.3.1 — complete URLs pass through; bare filenames live in the backend's /uploads folder. */
export function assetUrl(name: string): string {
  if (/^(https?:|data:|blob:)/i.test(name)) return name
  if (name.startsWith('/')) return `${API_BASE}${name}`
  return `${API_BASE}/uploads/${encodeURIComponent(name)}`
}

/** §7.2 — map a backend document onto the 3D shelf. */
export function toShelfBook(doc: BookDocument): ShelfBook {
  const rawYear = (doc as { year?: unknown }).year
  const year = typeof rawYear === 'number' && Number.isFinite(rawYear) ? rawYear : undefined
  const edition = typeof doc.edition === 'string' && doc.edition.trim() ? doc.edition : undefined
  const design = storedDesign(doc)
  const coverFallback = design
    ? svgToDataUri(
        makeCoverSvg({
          title: doc.title,
          author: doc.author ?? '',
          year,
          no: design.no,
          palette: design.palette,
          motif: design.motif,
          seed: hash32(doc.title),
        }),
      )
    : proceduralCover(doc.title, doc.author ?? '')
  const images = Array.isArray(doc.UploadedImages) ? doc.UploadedImages : []
  return {
    id: doc._id,
    doc,
    live: true,
    cover: doc.imageUrl ? assetUrl(doc.imageUrl) : coverFallback,
    coverFallback,
    gallery: images.filter((name): name is string => typeof name === 'string' && name.length > 0).map(assetUrl),
    year,
    edition,
    spine: makeSpineStyle(doc.title, design ? { cloth: design.cloth, foil: design.foil } : undefined),
  }
}

/** A document's stored cover/spine design, or null when it is missing or malformed (then the title decides). */
function storedDesign(doc: BookDocument) {
  const d = doc.design
  if (!d || typeof d !== 'object' || !isMotif(d.motif)) return null
  const p = d.palette
  if (!p || ![p.bg, p.ink, p.accent, p.accent2].every((c) => typeof c === 'string')) return null
  return {
    motif: d.motif,
    palette: p,
    no: typeof d.no === 'number' ? d.no : undefined,
    cloth: Number.isInteger(d.cloth) && d.cloth! >= 0 && d.cloth! < CLOTHS.length ? d.cloth : undefined,
    foil: typeof d.foil === 'string' && d.foil in FOILS ? (d.foil as FoilKind) : undefined,
  }
}
