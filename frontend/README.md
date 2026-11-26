# Bibliotheca Obscura — frontend

Curved 3D book archive for the Bookstore Express/MongoDB backend in
[`../backend`](../backend). Built from `../FRONTEND_PROMPT.md` with Vite,
React 19, TypeScript and Tailwind CSS v4.

## Run

```bash
# terminal 1 — backend (needs MongoDB and backend/.env)
cd backend
npm install
npm run dev          # http://localhost:3000

# terminal 2 — frontend
cd frontend
npm install
npm run dev          # http://localhost:5173
```

Or run `npm run dev` from the repository root to start both.

The dev server proxies `/api` and `/uploads` to `http://localhost:3000`
(override with `VITE_BACKEND_URL`, see `.env.example`). The backend's
`CLIENT_URL` must stay `http://localhost:5173` so Stripe returns to this app.

On Vercel, `vercel.json` does the same job: it forwards `/api` and `/uploads`
to the backend deployment (`backend-6jdj.vercel.app`) and serves `index.html`
for every other path, so Stripe's `/payment-success` and `/payment-error`
returns load the app. Change the backend address there if it moves.

`npm run build` type-checks and bundles; `npm run lint` runs oxlint.

If the backend is unreachable or has no books, the shelf shows twelve built-in
specimen folios (`src/data/fallbackCatalog.ts`). They are invented demo data
with procedurally drawn covers and cannot be purchased.

## Layout

| Path | Role |
| --- | --- |
| `src/shelf/geometry.ts` | §3 maths: dimensions, `B(r)`, `F(r)`, `scl(u)`, the `XS` screen-space table, `rel()` |
| `src/shelf/engine.ts` | The single `requestAnimationFrame` loop: spring, wrap, culling, transforms, shading, hover lift, tilt, contact shadow, timeline dot, and all pointer/wheel/keyboard input |
| `src/components/Shelf.tsx` | Renders the 3N book nodes once per catalogue and hands them to the engine |
| `src/components/DetailSheet.tsx` | §6 folio sheet: clip-path bloom, ink-bleed mask, Stripe checkout |
| `src/components/Caption.tsx`, `Timeline.tsx` | §5.2 mask-slide caption, §1.5 ruler |
| `src/lib/procedural.ts` | §7.3 spine generator (cloth, foil, bands) and SVG cover generator |
| `src/lib/audio.ts` | §9.1 Web Audio click and paper flutter |
| `src/api/client.ts`, `src/hooks/` | REST client, catalogue + search, collector session |
| `src/index.css` | Design tokens (§2) and every component style |

React never runs during a frame: the engine writes `style.transform`,
`z-index` and shade opacity directly, and only calls back into React when the
active volume changes.

## Deviations from the spec worth knowing

- **`XS` table** starts at 0 and is read with linear interpolation. Taken
  literally, the spec's sum gives `XS[0] = 2`, a 4px jump under the active book.
- **Fewer than 8 books** (a narrow search result) are shown once as a finite
  shelf. Three repetitions only hide the wrap seam when N ≥ 8.
- **The active cover is hit-tested analytically** (`overCover` in the engine).
  Browsers do not hit-test through a preserve-3d box that is rotated exactly
  edge-on, which is the state of the active volume.
- **No publication year in the backend schema.** Live books get a catalogue
  index ruler; the chronological ruler appears when every book has a `year`
  (the specimens do; a numeric `year` field on backend documents is picked up
  automatically).

## Extension points (§9)

Implemented: acoustic feedback (§9.1), search re-spooling (§9.5).

Not built yet — where each would attach:

- **Foil & ribbing customiser (§9.2):** `CLOTHS` / `FOILS` in
  `lib/procedural.ts` are the palettes; `makeSpineStyle()` already accepts an
  explicit `{ cloth, foil, bands }` pick. Needs an add-book form posting
  multipart data to `POST /api/addBook` and a place to store the choice.
- **Ex Libris bookplates (§9.3):** `DetailSheet` already knows when
  `status === 'sold' && brought === session.user.email` (the `mine` flag).
- **3D page-flip specimen (§9.4):** a second action beside the acquire button in
  `DetailSheet`, fed by `book.gallery`.
- **Google sign-in:** `POST /api/google-login` exists on the backend;
  `AuthSheet` would need a Google client ID and button.
