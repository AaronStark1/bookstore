/** Mirrors models/bookModel.js on the Express/MongoDB backend. */
export interface BookDocument {
  _id: string
  title: string
  author: string
  noofpages: number
  /** Complete URL, or a filename served from the backend's /uploads folder. */
  imageUrl: string
  /** Standard retail price. */
  price: number
  /** Archival collector (discounted) price. */
  dprice: number
  abstract: string
  publisher: string
  language: string
  isbn: string
  category: string
  /** Supplementary image filenames in /uploads. */
  UploadedImages: string[]
  status: 'pending' | 'sold' | (string & {})
  userMail: string
  brought?: string
}

export type ClothKind = 'buckram' | 'morocco' | 'washi'
export type FoilKind = 'gold' | 'cobalt' | 'blind' | 'white'

/** Output of the procedural spine generator (lib/procedural.ts). */
export interface SpineStyle {
  cloth: string
  clothDeep: string
  foil: string
  foilHi: string
  foilKind: FoilKind
  kind: ClothKind
  /** Number of raised bands at each end of the spine. */
  bands: number
}

/** A book prepared for the 3D shelf: backend document + derived presentation. */
export interface ShelfBook {
  id: string
  doc: BookDocument
  /** True when the document came from the backend (and can be purchased). */
  live: boolean
  /** Resolved primary cover URL (absolute, /uploads/…, or a data URI). */
  cover: string
  /** Procedurally generated cover, layered underneath `cover` as a load-failure fallback. */
  coverFallback: string
  gallery: string[]
  /** Publication year. Not part of the backend schema — only specimen folios (or a future field) carry it. */
  year?: number
  edition?: string
  /** Japanese title + romanisation, shown as the calligraphic subtitle. */
  jp?: string
  romaji?: string
  spine: SpineStyle
}

export interface AuthUser {
  username: string
  email: string
  role?: string
  profile?: string
  bio?: string
}

export interface AuthSession {
  token: string
  user: AuthUser
}

export type ApiStatus = 'checking' | 'online' | 'unseeded' | 'offline'
