# Prompt: the Bibliotheca Obscura reel (60 s, filmed from the running app)

You are a senior motion designer and a pipeline engineer working in the **bookstore** repo (`/Users/aaron.correya/Development/bookstore`). Build a **60-second reel** that is both a showcase and a **walkthrough** of the real app: the curved 3D shelf, the folio, search, the catalogue, sign-in, the hand-off to Stripe Checkout and the "In your collection" state, told in **six numbered plates**. Every transition and every drawn element comes from **books, paper and the library**: spines, ink, a paper curtain, catalogue slips, a turning page. Ship three cuts: a **16:9 master**, a **README web cut** and a **9:16 vertical cut** for social. Hold it to the production standard of the Cook With Me reel (shipped, in the sibling repo) and reuse its pipeline, adapting it where this app needs something different.

The reel must be **filmed from the running app**: real UI, real motion, real data. Nothing in it may be mocked up as UI. Animated graphics drawn by the reel itself (title, captions, cursor, transitions, end card) must be plainly reel graphics, never fake app screens. **Stripe's own checkout page is never filmed, recreated or imitated**; the reel cuts away from the app's "Opening Stripe Checkout…" state and returns to the app's own "Acquisition Recorded" slip.

**This is a one-shot run.** The user starts it and expects the finished reel at the end, with no check-ins. Never stop to ask for confirmation, wait for approval between steps, or end with a plan instead of outputs.
- Work through §12 in order, verifying each step yourself.
- When a check fails, fix it and re-check. If it still can't be made to work, take the fallback named in this brief and carry on.
- If there is no named fallback, choose the simplest honest alternative that keeps the brand rules, and record it in the final report.
- Stop early only for something outside your control (for example no Chrome, no disk space, no network for the one-time font download). Even then, finish everything that doesn't depend on it.

Do not commit or push. **Do not change any app code** (`frontend/src`, `frontend/index.html`, `frontend/public`, `backend/`). If a shot seems to need an app change, work around it in `tools/showreel/` (film it differently, or cut the moment) and note it in the final report. Never add a hook to the app. Observers you inject into the page from the capture tool are fine; edits to the app are not.

> **Do not disturb the user's dev server.** While this brief was written, port 5173 was already held by the user's own `vite` dev server for this project. A *second* `vite` on the same project starts the dependency optimiser, wipes the shared `frontend/node_modules/.vite/deps` cache, then dies on the port conflict, leaving the first server answering `504 Outdated Optimize Dep` until it restarts. So: run `lsof -nP -iTCP:5173 -sTCP:LISTEN` first; never kill a process you didn't start; never start a second dev server for this project; and film a **production build served by `vite preview` on another port** (§4.1), which never touches the user's server.

---

## 1. Read first

**The closest prior art: the shipped Cook With Me reel** (`/Users/aaron.correya/Development/cook-with-me/`). It is a finished, verified pipeline for exactly this job. Read all of it before writing code, and **copy** what fits into `tools/showreel/`:
- `docs/prompts/reel.md`: the brief this one is modelled on. Its structure, its one-shot rules and its acceptance checks carry over; its app facts, palette, timeline and sound design do not.
- `tools/showreel/lib/vclock.js`: virtual time, with the gaps the SpecShield original had already closed (app-controlled animations, `finish()` at the end of every animation, `playbackRate`, a seeded `Math.random`, real-time image settling). Start from this, not from SpecShield's.
- `tools/showreel/capture.mjs`, `shots.mjs` and `lib/shot-helpers.mjs` (its `lib/data.mjs` and `lib/cover.js` are the app-specific halves of the pattern: here they become §4's fixtures and `lib/ease.js`): filming shots at 180 subframes/s under virtual time; cursor keys with eased, bowed paths; clicks; drags; scroll; anchors recorded into `meta.json`; failing on stray hosts.
- `tools/showreel/reel.html`: the WebGL2 compositor: `SEGMENTS` / `CUTS` / `CAMERA`, the 3-subframe × 4-camera-sample motion blur, transition shader modes, 2D overlays, the monotone-cubic camera, `renderFrame(k)`, `renderAudio()`.
- `tools/showreel/lib/score.js`: the OfflineAudioContext score, placed on picture events, with sidechain, normalisation and the WAV encoder.
- `tools/showreel/render.mjs`: parallel frame rendering, the review modes (`--beats`, `--at`, `--range`, `--audio`, `--encode`), the BT.601 → BT.709 encode, and the two-pass web cut sized to a byte budget.
- `tools/showreel/smoke.mjs` and `verify.mjs`: the clock's smoke gate and the acceptance checker.
- `tools/showreel/timeline.mjs`: the edit decision list pattern (one source of truth, imported by shots, compositor and score).
- Its outputs in `docs/reel/` (extract a contact sheet with its `ffmpeg-static` and look at it): that is the bar for polish. The original SpecShield pipeline (`/Users/aaron.correya/Development/HacktoberFest/specshield-qa/showreel/`) and its write-up (`cook-with-me/docs/prompts/reel-specshield-analysis.md`) are background only. Where any of them disagree with source, the source is the authority.

**Do not modify anything in the sibling repo.** Copy what you need and say so in your report.

**This app.** Read these files:
- `README.md`, `frontend/README.md` (see its "Deviations from the spec" and "Extension points": **the extension points are not built**), and `FRONTEND_PROMPT.md` (the design spec the frontend was built from; where it and the code disagree, trust the code);
- `frontend/src/index.css` (every token, every animation, every breakpoint);
- `frontend/src/App.tsx` (the state machine), `shelf/engine.ts` and `shelf/geometry.ts` (the single rAF loop and the arc maths), `lib/{math,audio,procedural,format}.ts`;
- components: `Shelf`, `Caption`, `Timeline`, `Header`, `DetailSheet`, `SideSheet`, `CatalogIndex`, `AuthSheet`, `PaymentNotice`, `BootCurtain`, `Atmosphere`;
- `hooks/{useCatalog,useAuth}.ts`, `api/client.ts`, `data/fallbackCatalog.ts`, `types.ts`, `frontend/public/favicon.svg` (three spines: the brand mark);
- the backend contract, **read-only**: `backend/router/route.js`, `backend/models/bookModel.js`, `backend/controllers/bookController.js` (`getBooks`, `buyBook`) and the `userLogin` response shape in `userController.js`. **`backend/.env` exists locally and holds secrets (MongoDB, JWT, Stripe). Never open, print, load or copy it. Never start `backend/`.**

---

## 2. Facts about the app the reel depends on (verified 2026-11-26 by reading the code and by a read-only Playwright run; re-check them)

**Stack and run.**
- Vite 8 + React 19 + TypeScript + Tailwind v4, no router, one page. `frontend/vite.config.ts` pins dev and preview to port **5173** with `strictPort`, and proxies `/api` and `/uploads` to `:3000`. The app calls **same-origin relative URLs** (`/api/getBooks`), so there is no CORS to handle; intercept them in the browser and the backend is never reached.
- `main.tsx` wraps the app in `StrictMode`: in **dev**, effects run twice (the engine is built, destroyed, built; `GET /api/getBooks` fires twice). A **production build** does neither. Film the production build.
- Fonts are **not** bundled: `index.html` loads **Inter Tight** (400–900) and **Newsreader** (roman 400/500, italic 400, optical size 6–72) from `fonts.googleapis.com` / `fonts.gstatic.com`. That is the only external host the app ever contacts. The stylesheet is 44 `@font-face` blocks over only **11 distinct variable woff2 files** (Inter Tight: 7 unicode subsets; Newsreader: roman and italic × vietnamese/latin-ext/latin). The specimen text needs latin-ext (for example "Kōseisha").
- **Traps in the dev server:** the glob `**/api/**` also matches the app's own module `/src/api/client.ts`, so an `/api` route written as a glob aborts the app's source; match on `new URL(u).pathname.startsWith('/api/')`. And the three header buttons have accessible names that include their CSS brackets (`[ Catalog ]`), so select them by `.bracket-btn` text, not by an anchored `getByRole` name.

**Two data modes, both real.** The reel films the app in one of two states, and which one is a per-shot choice.

| | **Mode S: specimen** (default) | **Mode L: live fixtures** |
|---|---|---|
| How | every `/api/*` and `/uploads/*` request is **aborted** (connection refused) | `GET /api/getBooks`, `POST /api/login` and `PUT /api/makePayment` are **fulfilled from fixtures**; anything else is a hard error |
| The app then | falls back to its own **12 built-in specimen folios** and says so | behaves as it does against a seeded backend |
| Footer | `REST API: OFFLINE — SPECIMEN CATALOGUE` (crimson dot) | `REST API: ONLINE` (green dot) |
| Shelf | hand-picked cloth and foil per book, **a chronological year ruler 1955…1980**, captions like `1955 — FIRST EDITION` | cloth and foil picked by title hash, an **index ruler 001…**, captions like `NO. 001 — ENGLISH EDITION`, "Rare Edition" in the folio |
| Acquire | always answers with the **specimen note** (it checks `book.live` first), so never click it in this mode | works: needs a session, calls `PUT /api/makePayment` |
| Used for | Plates I, II, III, VI and the end card | Plates IV and V |

Do not hide the footer or retouch it; the camera will usually crop it. The README and the reel say plainly that the folios are specimens.

**The twelve specimens** (invented titles, procedurally drawn covers; `frontend/src/data/fallbackCatalog.ts`), in shelf order: 0 The Silent Valley (1955) · 1 An Atlas of Lost Weather · 2 The Blue Hour · 3 **Cartographer of Moths** (1961) · 4 River of Salt · 5 The Glass Orchard · 6 Winter Arithmetic · 7 Noon in Ashes · 8 **Night Ferry to Otaru** · 9 Thirteen Quiet Rooms · 10 The Paper Tide · 11 A Lantern for the Drowned (1980). Prices are in ₹ (`en-IN`), for example `₹1,450` with `Reg. ₹1,950` struck through. `The Silent Valley` is the active volume on first load; it is the app's face in the README.

**Verified outputs** (re-check each in your smoke run):
- Mode S: 36 `.book-box` nodes (12 × 3 repetitions); caption `THE SILENT VALLEY` / `1955 — FIRST EDITION`; ruler labels `1955 1960 … 1980`; footer button `SOUND: ON`. Typing `the` into search gives **`6 FOUND`**, a finite shelf of 6 nodes, and the catalogue sheet then reads `6 folios` (matches: The Silent Valley, An Atlas of Lost Weather, The Blue Hour, The Glass Orchard, The Paper Tide, A Lantern for the Drowned).
- Reading the app's own specimen data needs no TypeScript tooling: against a **dev** server, `await import('/src/data/fallbackCatalog.ts')` inside the page returns `FALLBACK_CATALOG` (12 `ShelfBook`s whose `doc` has exactly the keys `_id title author noofpages imageUrl price dprice abstract publisher language isbn category UploadedImages status userMail brought`, and whose `cover` is a `data:image/svg+xml` URI).
- Mode L (with the fixtures of §4.2): footer `REST API: ONLINE`; the real form signs in and the header becomes `SEARCH · CATALOG · LOGOUT` (session stored in `localStorage['bo:session']`); after two `ArrowRight` the active book is `THE BLUE HOUR`, and its folio button reads `ACQUIRE VOLUME — ₹1,300`. A click sends `PUT /api/makePayment` with an `Authorization` header and the page then runs `window.location.assign(session.url)`. With `session.url = http://localhost:<port>/#stripe-checkout` that is a **same-document navigation: the page stays put**, the folio stays open and the button stays on its busy label.
- A fresh load of `/payment-success?session_id=cs_test_reel` (verified on the dev server, which falls back to `index.html`; `vite preview` does the same by default, so re-check it) shows the slip `✓ ACQUISITION RECORDED · You have returned from Stripe Checkout. The volume is marked as sold in the archive. · DISMISS`. With the post-purchase fixture the sold book's caption reads `₹1,300 Reg. ₹1,750 SOLD` (crimson), and its folio shows the kicker `ARCHIVE FOLIO NO. 003 SOLD` and a disabled button `IN YOUR COLLECTION — EX LIBRIS`.

**Behaviour the shots rely on** (all real, all in code; durations in ms):

| What | Behaviour |
|---|---|
| **Boot** | `BootCurtain`: a `--paper` sheet reading `BIBLIOTHECA OBSCURA / OPENING THE ARCHIVE` over a pulsing 160 px rule (`boot-rule`, 1400 infinite alternate). It lifts with `clip-out-up` **950 ms** `--ease-ink` once a catalogue is mounted. **The catalogue is mounted at the latest 1500 ms after load**, whatever the API does (`BOOT_GRACE_MS`, a virtual-time timer), so the curtain cannot be held longer than 1.5 s. The shelf **spools in** for 0.95 s at the same moment: each volume rises out of the floor (`translateY` + `scaleY`, centre first, never an opacity fade). Under the lift the caption lines mask-slide in. |
| **The shelf** (`shelf/engine.ts`) | One rAF loop owns every volume. A float cursor `s` chases target `T` with an exponential spring (`K_IDLE` 5.2/s, `K_DRAG` 18/s), so it is frame-rate independent. The volume at the centre turns 90° from spine to cover (`rotY = −90·o`), its neighbours part and recede along the arc (perspective 1400 px), and a contact shadow widens beneath it. A cobalt dot on the ruler glides with `s`. The active volume changes → `onStep` → the acoustic knock. |
| **Geometry at the two viewports** | 1600 × 900: book height `H` = 432 px, **one volume per 92.5 px** of drag. 432 × 768 (mobile rules, `U` = 1.05 H): `H` = 285 px, **one volume per 61.1 px**. 12 books is cyclic (≥ 8 is needed); a search result under 8 is shown once as a finite shelf. |
| **Input** | **Wheel:** `T += clamp(delta × 0.0065, ±1.5)`; 150 ms after the last notch it snaps to the nearest volume, and a single 100 px notch always advances exactly one. **Drag:** `T = T0 − dx/(ws + gap)`, slop 6 px; on release a **fling** adds `clamp(velocity × 0.2, ±6)` volumes **only if the pointer moved within the last 60 ms**, so hold still ≥ 80 ms before releasing or the shelf jumps ahead. **Keys:** `←` `→` step one; `Enter` opens (and leaves a focus ring on Close: don't open with the keyboard); `Esc` closes. Arrow keys are ignored while an `<input>` has focus. **Click** the active cover to open it (only if settled, `|T − s| < 0.25`); click any other spine to glide it to the centre; the cover is hit-tested analytically. **Hover** a spine (mouse only) and it lifts `0.06 H`; hover the settled cover and it **tilts toward the pointer** (±9° around Y, ±6° around X, `K_TILT` 7). |
| **Caption** (`Caption.tsx`) | Five lines (title in cobalt, `AUTHOR / EDITION`, a rule, `YEAR — EDITION`, price with `Reg.` struck and a crimson `Sold`) mask-slide: out `translateY(−105%)`, in from `105%`, **600 ms** `--ease-spring`, staggered 45 ms. The outgoing layer is removed by the `animationend` of its **last line**. |
| **Folio open** (`DetailSheet`) | `clip-path` blooms from the cover's projected rect to full screen, **1050 ms**, `--ease-ink`. Seven **ink blots** (an SVG `feTurbulence` + `feDisplacementMap` mask, `scale` 120) spread over the poster column: 0 → r 720, **1250 ms** each, delays `0,120,220,300,380,460,540`, starting at +260 ms; they are driven by rAF. Nine text blocks mask-rise, **820 ms** `--ease-spring`, delay `380 + 65·i` ms: kicker `ARCHIVE FOLIO NO. 004 · AVAILABLE`, `EX LIBRIS` + the edition in italic, the Newsreader title, the author in cobalt, a `YEAR / CATEGORY / NO. OF PAGES / LANGUAGE / ISBN` grid, the abstract, a `PUBLISHER IMPRINT` box with a crimson `ED` seal, the price (cobalt, 34 px, `Reg.` struck) and the button. Hovering the button floods it with ink from below (**420 ms**, `--ease-ink`). The flutter sound plays on open. |
| **Folio close** | `[ CLOSE ]` (top-left) folds the sheet back into wherever the cover now is: **780 ms** `--ease-ink`; then it unmounts. |
| **Search** | `[ SEARCH ]` unrolls a field (`max-width` **520 ms** `--ease-spring`) with a live status (`6 FOUND`, `NO MATCH` in crimson). Typing is debounced **280 ms**, then the shelf **sinks** (spool-out 0.42 s), the new arc mounts around the same book if it survived (else index 0) and **spools in** (0.95 s). The button becomes `[ CLEAR ]`, which empties and closes the field and re-spools the full shelf. The input is upper-cased by CSS. |
| **Catalogue** | `[ CATALOG ]` unrolls a paper sheet from the right (`clip-in-right` **720 ms** `--ease-ink`; **520 ms** to roll back): `N folios`, a note (`Built-in specimen catalogue — …` or `Live from the archive server.`), and one row per book on the shelf (`001 · title · author · ₹ price`, or the year in mode S). It lists **what is on the shelf now**. Clicking a row closes the sheet and `goTo`s that book, the shorter way round the cycle. |
| **Sign-in** | `[ LOGIN ]` unrolls the same kind of sheet (460 px wide, over the catalogue's z-index). `SideSheet` focuses the **first** `input, button` in DOM order, which is the sheet's own `[ CLOSE ]`, so the email field is not focused until clicked. `Sign in` / `New collector` tabs; the submit button is cobalt (`SIGN IN`). On success the sheet rolls back and the header shows `[ LOGOUT ]`. |
| **Acquire** | Mode L + a session: the button shows `OPENING STRIPE CHECKOUT…` while `PUT /api/makePayment` is pending (20 s timeout), then the page navigates to `session.url`. The real backend marks the book **sold and `brought` = the buyer's email before it creates the Stripe session**, which is why the returning page shows it sold. |
| **Return slip** (`PaymentNotice`) | On a load whose path ends `/payment-success`: a `--sheet` slip, 6 px 6 px hard cobalt-soft shadow, a crimson `✓` seal turned −8°, `clip-in-down` **620 ms**; it sits **under** the boot curtain (z 37 < 38). `[ DISMISS ]` removes it instantly. |
| **Atmosphere** | A full-viewport `feTurbulence` grain multiplied over **everything** (z 40) and two halftone monoliths, `ARCHIVE` (left) and `FOLIOS` (right). The grain is static, so it is the paper the reel must match (§8). |
| **Mobile** (≤ 768 px) | Header wraps with `[ SEARCH ]` on its own row; chevrons sit beside the price; the shelf is smaller and tighter; sheets are full-width; the folio becomes a column with the cover first (64 svh) and a scrolling text sheet below. Hover lift and tilt do not exist on touch. |
| **Sound** | The app synthesises a woody **knock** per volume passed and a low **paper flutter** on folio open (`lib/audio.ts`; recipes reused in §9). The audio context only starts after a gesture; `SOUND: ON/OFF` is a footer toggle. The reel's audio is its own score; never record the app's. |

**The only randomness** is `Math.random()` in the audio knock's pitch jitter. Visuals are deterministic.

**Do not show or imply anything the app does not have:**
- a page-flip or "look inside" (§9.4 of the spec is **not built**; the reel's own page-turn transition is a graphic, never a caption);
- an add-book form, admin screens, profile editing, a foil/ribbing customiser or ex-libris bookplate artwork (all spec extension points, not built; backend `/api/addBook` has no UI);
- Google sign-in, wishlists, carts, ratings, reviews, quantities, a reading preview, multiple gallery photos (specimens have none), dark mode;
- a search shortcut key (there isn't one), a timer, anything that says "AI";
- Stripe's page, logo or card form. The **word** "Stripe" is fine, because the app genuinely hands off to Stripe Checkout; do not claim "test mode", "paid" or "secure" beyond what the slip says;
- a native or app-store app: the vertical cut shows the **responsive web app**.

---

## 3. Deliverables and file layout

```
tools/showreel/                      # new; mirrors cook-with-me/tools/showreel/
  package.json                       # playwright-core 1.64.1, ffmpeg-static 5.3.0 (same pins as the sibling)
  .gitignore                         # node_modules/  out/
  timeline.mjs                       # THE edit decision list: beat times, segments, cuts, click/key/type/drag/wheel times, caption cues
                                     # imported by shots, the compositor page and the score; one source of truth
  fixtures.mjs                       # (1) reads the app's own specimen module and writes fixtures/books.json
                                     # (2) records the Google Fonts CSS + 11 woff2 files into out/cache/fonts/
  fixtures/books.json                # 12 documents shaped exactly like models/bookModel.js; no tokens, no real emails
  fixtures/session.json              # the fake session (§4.3), login and makePayment responses
  lib/vclock.js                      # copied from cook-with-me/tools/showreel/lib/vclock.js, adapted (see §5.1)
  lib/score.js                       # the score (see §9)
  lib/ease.js                        # cubic-bezier solver + easeInk / easeSpring ported from frontend/src/lib/math.ts
  shots.mjs                          # 16:9 shot list
  shots-vertical.mjs                 # 9:16 shot list (same beat times)
  capture.mjs                        # --aspect 16x9|9x16, --only <ids>, --sheet, --workers
  smoke.mjs                          # the clock gate (§5.1); verify.mjs: the acceptance checker (§11)
  reel.html                          # WebGL2 compositor; ?aspect=16x9|9x16
  render.mjs                         # --aspect, --beats, --at, --range, --audio, --encode, --crf
docs/reel/
  bibliotheca-obscura-reel.mp4            # master 16:9, 1920×1080, 60 fps
  bibliotheca-obscura-reel-web.mp4        # README cut (≤ 9.4 MB)
  bibliotheca-obscura-reel-vertical.mp4   # 9:16 social cut, 1080×1920, 30 fps
  bibliotheca-obscura-reel-thumb.jpg      # 1920×1080 poster
  bibliotheca-obscura-reel-vertical-cover.jpg   # 1080×1920 cover
```

`npm` scripts: `fixtures`, `smoke`, `capture`, `render`, `beats`, `audio`, each taking `-- --aspect 9x16` where it applies.

Update `README.md` (the only existing file you may edit):
- Add a "▶ Watch the 60-second reel" link near the top, pointing at the web cut, with the thumbnail, inside the existing centred header block, without removing `docs/preview/preview.gif`.
- Add a short **Reel** section (after "Theme", before "Under the hood") covering the files, how to re-render, and the honesty line: *"Filmed from the running app. The shelf shows the app's built-in specimen catalogue: invented titles with covers the app draws itself. The sign-in, the hand-off to Stripe Checkout and the sold state (Plates IV–V) use API responses served from local fixtures shaped like the backend's, and Stripe's own page is never shown. Fonts: Inter Tight and Newsreader (SIL OFL)."*
- Leave the rest of the README alone.

---

## 4. Data: real specimens, no backend, no writes

### 4.1 What to serve and film
1. **Never start `backend/`, never open `backend/.env`, never contact MongoDB or Stripe.** Mode S aborts `/api/*`; mode L is fully mocked.
2. **Film a production build, not the dev server.**
   - Build once, **from inside `frontend/`** (Vite takes its root from the working directory): `cd frontend && npx vite build --outDir ../tools/showreel/out/app-dist --emptyOutDir` (call `vite build` directly rather than `npm run build`, to skip `tsc -b`; `--emptyOutDir` is required because the output is outside the root).
   - Serve it, again from `frontend/`: `npx vite preview --outDir ../tools/showreel/out/app-dist --port 5180 --strictPort` (the CLI flags override the config's port 5173). Your tool owns this process and stops it at the end.
   - A production build has no HMR socket, no StrictMode double effects and no dev overlay, so filming is quiet and deterministic.
3. **`fixtures.mjs` is the only step that wants the dev server**, because it uses `import('/src/data/fallbackCatalog.ts')`. If a bookstore dev server is already on 5173, only GET from it (the HTML and that one module). If the port is free you may start `npm --prefix frontend run dev` yourself and stop it afterwards. Never both. **Fallback** if the import trick fails: open each of the 12 folios in mode S in the preview build and scrape the fields.

### 4.2 Fixtures
- **`fixtures/books.json`:** the 12 specimens as backend documents. Take every field from the app's own data: `_id` a deterministic 24-hex string, `imageUrl` = the specimen's **`data:` cover URI** (`assetUrl()` passes `data:` URLs through, so there is no `/uploads` fetch and no cover-load race), `UploadedImages: []`, `status: 'pending'`, `brought: ''`, `userMail` as in the source (`archive@bibliotheca-obscura.example`). **No extra fields** (no `year`, no `edition`: the real schema has neither, which is why mode L shows the index ruler). Assert the key set equals `models/bookModel.js` plus `_id`.
- **The post-purchase variant:** the same list with **The Blue Hour** (`index 2`) `status: 'sold'`, `brought: 'collector@example.com'`. That is exactly what the real `makePayment` writes before it creates the Stripe session (`controllers/bookController.js`).
- **Handlers** (mode L), each logging its call:
  - `GET /api/getBooks[?search=q]`: the list (case-insensitive substring match on `title` when `search` is present, as the Mongo `$regex` does for the app's escaped input); the post-purchase variant after `makePayment`, or whenever the shot says so.
  - `POST /api/login`: `200 {"message":"Login Success","existingUser":{"username":"Demo Collector","email":"collector@example.com","role":"User"},"token":"reel-demo-token"}`.
  - `PUT /api/makePayment`: requires `Authorization: Bearer reel-demo-token` (else `401 "Authorization Error: No token provided"`, the real `jwtMiddleware`'s body for a missing header) and a `bookDetails._id` (else `400 "Book details are required"`, as the real `buyBook`); **held until the shot releases it** (a deferred, so the `OPENING STRIPE CHECKOUT…` state can be filmed for exactly as long as the edit wants), then `200 {"message":"Success","session":{"id":"cs_test_reel","url":"http://localhost:<port>/#stripe-checkout"},"sessionID":"cs_test_reel"}`.
  - **Any other request to `/api/` or `/uploads/` in mode L, and any `PUT/POST/DELETE` anywhere, throws.** Prove in a smoke run that an authorised `PUT` succeeds and an unauthorised one is refused.
- **Mode S:** `context.route(u => u.pathname.startsWith('/api/') || u.pathname.startsWith('/uploads/'), r => r.abort('connectionrefused'))`. The app's `focus` listener re-probes while offline, so abort **every** attempt, not just the first.

### 4.3 Session, storage and the stray-host guard
- **Signed-out shots** leave `localStorage` empty. **Signed-in shots** (the Plate V page load) seed, in `addInitScript`, `localStorage['bo:session'] = {"token":"reel-demo-token","user":{"username":"Demo Collector","email":"collector@example.com","role":"User"}}`. The app never decodes the token. Never register or log in against the real API.
- Leave `bo:sound` unset (the footer keeps its default `SOUND: ON`).
- **Fonts: record once, replay forever.**
  - `fixtures.mjs --fonts` requests the exact stylesheet URL from `index.html` once, with a Chrome user-agent and nothing else identifying, saves the CSS and **all 11 woff2 files** under `out/cache/fonts/` with a URL → file manifest, and prints their licence (OFL).
  - Every capture and the compositor then serve them from disk: `context.route` fulfils `fonts.googleapis.com` / `fonts.gstatic.com` from the cache. **A cache miss is a hard error.**
  - Inter Tight and Newsreader are the only typefaces in the reel (§8). **Fallback** if the one-time download fails: `npm i` `@fontsource-variable/inter-tight` and `@fontsource-variable/newsreader` **inside `tools/showreel`** (not the app), and fulfil the font URLs from those files.
- **Stray-host guard:** fail a shot if the page reaches any host except the preview origin (`localhost:5180`). The font hosts count as local only because they are fulfilled from the cache, never forwarded. The `/api` handlers count as local because they are mocks.
- `DATA=live` is **not** supported: there is no live data to look at.

---

## 5. Capture

### 5.1 The virtual clock: start from the sibling's, then prove it on this app

Copy **`cook-with-me/tools/showreel/lib/vclock.js`**. Keep its epoch handling and its seeded `Math.random`, but note its two Angular-specific features (scroll-driven `animation-timeline`, app-scrubbed WAAPI) are mostly irrelevant here. This app's animations are plain CSS animations, CSS transitions, two WAAPI `clip-path` animations on the folio, rAF loops (the shelf engine, the ink blots) and `setTimeout` debounces.

**The clock must also handle these, specific to this app:**
1. **`animationend` / `onfinish` must fire.** `Caption` removes its outgoing layer on the `animationend` of the **last line**; `BootCurtain` unmounts on `animationend`; `SideSheet` unmounts on `animationend` while closing (and checks `e.target === e.currentTarget`); `DetailSheet` unmounts on the close animation's `onfinish`. If a leaving layer never goes, you will film two captions stacked or a dead sheet.
2. **`animation-iteration-count: infinite`** (`boot-rule`, alternate) must be pinned deterministically (never `finish()`ed).
3. **The engine's `dt`** is `clamp((now − last)/1000, 0, 0.05)` from rAF timestamps. At 180 subframes/s it is 5.6 ms; it must receive the **virtual** `now`.
4. **`fetch` is real time.** `useCatalog` also runs a 1500 ms **virtual** grace timer. If virtual time steps before a fixture response lands, the specimen shelf mounts first and then re-spools to the live one on screen. In mode L, poll in **real time**, without stepping virtual time, until the catalogue is mounted (`.book-box` count = 36) before filming or pre-rolling.
5. **Text-caret blink** is a real-time UA timer the clock cannot pin, so a typed-into field would flicker between runs. Hide it with `caret-color: transparent` in the shot's injected `css` (a capture-side style, not an app change) and say so in the report.
6. **Real-time readiness:** in each `prepare`, poll in **real time** until `document.fonts.status === 'loaded'` **and** `document.fonts.check` is true for each face the shot uses (`600 11px "Inter Tight"`, `500 40px Newsreader`, `italic 400 20px Newsreader`), every `data:` cover is decoded (`new Image()` + `decode()`), and the expected number of `.book-box` nodes exists. Treat any frame that shows the hash-generated fallback cover (mode L) or a fallback font as a failed take.

**Prove the clock before filming the real shots.** This is an internal gate, not a stopping point. `smoke.mjs` films 3 s of each case and prints a `--sheet`; view the sheets yourself. Fix and re-run until each case passes, or take its fallback.
- (a) **Shelf step:** one `ArrowRight`; 1 s later exactly one `.caption-body` is in the DOM and the shelf is settled.
- (b) **Boot:** the curtain lifts, `.boot` is gone 2.5 s later, the shelf has finished spooling, and the footer reads the right mode.
- (c) **Folio:** click the settled cover; the sheet reaches full screen, the ink blots reach r 720, all nine text blocks are up; `[ CLOSE ]` folds it back and `.detail` is gone.
- (d) **Sheets:** `[ CATALOG ]` opens, a row click closes it and the shelf lands on that book; `.side-sheet` is gone.
- (e) **Search:** typing `the` gives `6 FOUND`, exactly 6 nodes and a settled finite shelf; `[ CLEAR ]` restores 36 nodes and the year ruler.
- (f) **Determinism:** film the same 2-second shot twice; the JPEGs of 6 chosen subframes are byte-identical.
- (g) **Touch (9:16):** a CDP `Input.dispatchTouchEvent` drag moves the shelf, and a tap on the cover opens the folio.

Fallbacks: (a)–(d), if a leaving layer won't clear, `finish()` CSS transitions as well as animations; (c), if the blots stall, check that rAF receives virtual time; (g), if touch pointer events don't drive the shelf, dispatch `pointerdown/move/up` with `pointerType: 'touch'` from the page context.

**Capture fallback if virtual time can't drive a case at 180 fps:** capture at 60 fps (one still per frame) and drop the motion-blur averaging for that shot. A clean shot without blur beats a broken one with it.

### 5.2 Browser and viewport
- **Browser:** the same flags as the sibling (`--force-color-profile=srgb --hide-scrollbars`, the GPU flags, plus `--mute-audio`), `reducedMotion: 'no-preference'`, `channel: 'chrome'` (system Chrome is installed). The page has a full-viewport SVG filter and 3D transforms, so keep the GPU flags.
- **16:9:** viewport **1600 × 900 at DSF 1.5**, so stills are 2400 × 1350. Zoom headroom is 1.25: never zoom past it. Check that at 900 px tall the caption, the ruler and the footer don't collide (they fit with a little room).
- **9:16:** viewport **432 × 768 at DSF 3** (stills 1296 × 2304), `isMobile: true, hasTouch: true`: the app's real mobile composition. Zoom headroom is 1.2.
- **Subframes:** 16:9 runs `SUB_FPS = 180` (three per 60 fps frame); 9:16 runs `SUB_FPS = 90` (three per 30 fps frame). Segment `from` values are multiples of 1/90 s so both cuts land on captured subframes. At 80 BPM a beat is 135 subframes at 180/s but 67.5 at 90/s: round click times to the nearest subframe (±5.6 ms, imperceptible).
- **Disk:** expect roughly 4 GB of 16:9 JPEGs and 2–2.5 GB of 9:16 under `tools/showreel/out/` (gitignored). Check free space first.

### 5.3 Shot API additions
Keep the sibling's shot fields (`path`, `duration`, `css`, `prepare`, `cursor`, `clicks`, `events`, `scroll`, `anchors`, `drags`, `init`) and add:
- **`wheels: [{ at, dx, dy }]`** (`page.mouse.wheel`).
- **`keys: [{ at, key }]`** and **`type: [{ at, text, every }]`**: real key events, one per subframe step. Every key press goes into `meta.json` as a press so the score can click it.
- **`taps` and `swipes`** (9:16 and the phone plate): CDP touch events with eased moves, and a visible touch indicator in the compositor.
- **`gates: [{ at, release }]`:** release a held response (`getBooks` before the boot, `makePayment`) at a virtual time.
- **`active`:** a `MutationObserver` injected by the capture tool records, in virtual time, every change of `.caption-body:not(.is-out) .cap-title` (an active-volume change: the score's knocks), the moment `.boot` gets `is-lifting`, and the moment `.side-sheet` / `.detail` / `.notice` mount or unmount. These go into `meta.json` **events**; the score and the compositor read them. This is how sound and transitions sync to the real app, rather than to guesses.
- **Anchors** (CSS selectors recorded every 3rd subframe): the active cover (the `.book-box .cv` whose rect is nearest the viewport centre), `.caption-body:not(.is-out)`, `.timeline`, `.site-header`, `.search-field`, each header `.bracket-btn`, `.side-sheet`, `.detail`, `.detail-title`, `.btn-acquire`, `.detail-poster`, `.notice`, `.boot`.
- **Click, key and event times are imported from `timeline.mjs`.** Never type the same number twice.

### 5.4 The shot list (16:9; the 9:16 list re-films these at the phone viewport)

| Id | Mode | What is filmed | Reel time |
|---|---|---|---|
| **H** | S | One page load: the held curtain with its text hidden by injected CSS; the lift; the shelf (wheel, drag, hover, tilt); the folio open, read and closed; the cursor leaving `[ CLOSE ]` and **resting on `[ SEARCH ]` by 21.45**. `GET /api/getBooks` is left **unanswered** and aborted at shot t = 1.6 s, after the grace timer has mounted the specimens, so the footer settles on OFFLINE while the curtain is still lifting. | 0 – 21.55 |
| **S** | S | Search, clear, catalogue, a row click. `prepare` parks the shelf on Cartographer of Moths with the cursor resting on `[ SEARCH ]`, so its first frame **matches H's last frame** (a match cut at 21.55, where nothing moves). If the match cut shows, film H and S as one shot. | 21.55 – 30 |
| **A** | L | Pre-rolled past the boot to a settled shelf. Sign in through the real form, step to The Blue Hour, open the folio, hover and click **Acquire**, hold the busy state; `makePayment` is released at the edit's time. | 30 – 42.3 |
| **P** | L, post-purchase, signed in | A fresh load of `/payment-success?session_id=cs_test_reel` (the real return from Stripe): `getBooks` is answered at shot t = 1.0 s so the curtain is held, then lifts; the slip; `[ DISMISS ]`; the shelf; the sold caption; the folio's `IN YOUR COLLECTION — EX LIBRIS`. | 40.5 – 51 |
| **M** | S, **phone viewport, touch** | Pre-rolled; swipe the shelf, tap the cover, scroll the folio. **Used by both cuts**, so film it at 180 subframes/s in the 9:16 run and film it **first** (the 16:9 master needs it). | 51 – 54 |
| **E** | S, UI hidden | Pre-rolled shelf with the header, caption, chevrons, ruler and footer hidden by injected CSS (keep the shelf and both monoliths); `ArrowRight` at the edit's times. | 54 – 60 |

Segments may clamp to a shot's first or last frame, so a drawn title can sit on a still of the filmed paper.

---

## 6. The edit: 60.0 s at 80 BPM

The grid is **80 BPM, 4/4: a beat is 0.75 s and a bar is 3.0 s**, so 60 s is exactly 20 bars and downbeats fall on multiples of 3 s. Unhurried: this is a reading room, not a kitchen.

**Timing rule: land the rush on the beat.** Each easing curve is slow, rushes, then lands. The point where coverage reaches 0.55 is `RUSH_INK = 0.488` of the run for `--ease-ink` (`cubic-bezier(0.76,0,0.18,1)`) and `RUSH_SPRING = 0.146` for `--ease-spring` (`cubic-bezier(0.2,0.8,0.2,1)`); re-derive them with your solver. So an in-app motion that should hit a beat is started at `beat − RUSH × duration`:

| Motion | Duration (ms) | Rush after it starts (a click: after the release) |
|---|---|---|
| Folio open | 1050 | +0.513 s |
| Folio close | 780 | +0.381 s |
| Catalogue / sign-in sheet in | 720 | +0.352 s |
| Sheet out | 520 | +0.254 s |
| Boot curtain lift | 950 | +0.464 s |

A **click** is a press, then a release 0.06 s later; the app acts on the release, and the score ticks on the press. Segments overlap their cuts so both sides are already moving. A hit lands on every cut.

### 6.1 Timeline (16:9 master; 9:16 uses the same times, see §6.3)
All times are reel seconds and **release** times for clicks. `timeline.mjs` derives presses.

| Reel time | Segment / cut | What happens on screen | Camera (zoom 1 = whole viewport) | Sound |
|---|---|---|---|---|
| 0.00–2.54 | **TITLE** (drawn, on H's still paper plate) | Flat paper with the app's own grain (the curtain, text hidden). 0.00: the **three spines** of the brand mark (ink, cobalt, crimson, from `favicon.svg`) rise one after another, 90 ms apart, each masked (`translateY 105% → 0`, 820 ms `--ease-spring`). 0.15: `BIBLIOTHECA OBSCURA` and `— COLLECTOR ARCHIVE` (muted) mask-rise beside it. 0.45 / 0.62: the headline **"The shelf turns / to face you."** (Newsreader 500, two lines, words staggered 70 ms). 1.60: a 1 px rule draws left to right under it. 1.75: `[ A WALKTHROUGH IN SIX PLATES ]` rises. | locked, 1.00 → 1.03 | felt-piano motif, paper rustle at 0.15, a soft knock as each spine lands, a reversed swell 1.5 → 3.0 |
| 2.54–3.50 | **T0 curtain lift** (filmed) | H's real `.boot` lifts (950 ms, rush at 3.00). **The drawn title is clipped by the same inset, so it is printed on the curtain and leaves with it.** The shelf spools in beneath. | | **downbeat hit at 3.00** (felt kick + low string); the groove starts |
| 2.54–12.0 | **H**: **PLATE I · THE SHELF** | The shelf settles on The Silent Valley (1955); the caption lines mask in; the ruler dot sits at 1955. Slip **I · SCROLL, DRAG, ARROW KEYS** at 3.75. **4.50 and 5.25: two wheel notches** (one volume each → The Blue Hour). **6.00–7.55: press and drag right across ≈ 11 volumes** (≈ 1,017 px; eased in and out, **held still 0.15 s before release**), so the shelf **wraps past the first volume** and settles on **Cartographer of Moths** (≈ 8.4; assert the caption and adjust the distance). 8.4–11.4: the cursor drifts over neighbouring spines (they lift), then onto the cover (it tilts toward the pointer). Slip **I · CLICK THE COVER** at 9.0. | 1.00 → 1.06 on the shelf; follow the drag; 8.4 → 11.4 push to 1.15 on the cover and caption | a knock per volume passed (from `active` events), pitched per the app's recipe; a whoosh of air under the drag; a soft tick per press |
| 11.43 / 11.49 | | press / release on the settled cover. **The rush lands on 12.00.** | | paper flutter (the app's recipe) at the release |
| 11.49–21.0 | **H**: **PLATE II · THE FOLIO** | The clip bloom grows from the cover's rect to full screen (rush 12.00); the ink blots bleed across the poster (≈ 11.75 → 13.5); the text column rises block by block. Slip **II · THE FULL ARCHIVAL RECORD** at 12.75. 13.5–15.5 read the title, author and facts grid; 15.5–17.4 the abstract and the imprint seal; 17.4–19.4 the price and the `ACQUIRE VOLUME` button: **the cursor hovers it at 17.6 and the ink floods up (420 ms). Do not click it in mode S.** **20.56 / 20.62: press / release `[ CLOSE ]`**; the sheet folds back into the cover (rush 21.00) while the cursor leaves for `[ SEARCH ]`, resting there by 21.45. | 1.00 on the bloom; 13.5 → 19.4 a slow descent along the text column at 1.20; ease out to 1.00 for the fold | the flutter, soft page-rustle under the ink, a swell on the hover flood, the fold's whoosh from `easeInk'` |
| 21.0–30.0 | **S**: **PLATE III · FIND IT** | The cursor crosses to `[ SEARCH ]`. **21.75 click:** the field unrolls. **22.50, 22.75, 23.00: type `the`.** At ≈ 23.28 the status turns `6 FOUND`, the shelf sinks and re-spools around the six matches (settled ≈ 24.65). Slip **III · SEARCH BY TITLE** at 21.75. Hold on the six. **26.00 click `[ CLEAR ]`** (the shelf re-spools to all twelve). **26.65 click `[ CATALOG ]`:** the sheet unrolls (rush 27.00); the cursor passes over rows (they turn cobalt). **28.50 click the row `Night Ferry to Otaru`:** the sheet rolls back and the shelf **glides four volumes the short way round** (settled ≈ 29.4). Slip **III · THE CATALOGUE** at 26.65. | 21.7 → 23.3 on the header (status), → 25.5 down to the shelf at 1.0; 27.0 → 28.4 right onto the sheet at 1.25; 28.5 back to the shelf | key clacks per letter, a soft knock as the field unrolls, six knocks and a sinking thud on the re-spool, the sheet whoosh (`easeInk'`) in and out, a knock per volume on the glide |
| 29.15–30.55 | **T1 spine rise** (full coverage at **30.00**) | A row of cloth-bound spines rises from the floor to cover the frame, centre first, in the app's own spool order; the scene swaps under them; they sink away edges first (§7.2). | | rolling knocks as each spine lands, a **thud at 30.00** |
| 30.0–42.3 | **A**: **PLATE IV · COLLECT** (mode L) | The shelf in mode L (index ruler, `REST API: ONLINE`). **31.15 click `[ LOGIN ]`** (rush **31.50**). 32.00 click the email field; **32.20–33.40 type `collector@example.com`**; 33.50 click the password field; **33.70–34.40 type** a password (dots show); **35.00 click `SIGN IN`**: the sheet rolls back (until 35.52) and the header turns `[ LOGOUT ]`. 35.70 and 36.20: `ArrowRight` ×2 → The Blue Hour (settled by ≈ 36.9). **37.00 click the settled cover** (rush 37.50). Read; **hover `ACQUIRE VOLUME` at 39.0** (ink floods). **40.50 click Acquire:** the button reads `OPENING STRIPE CHECKOUT…`; `makePayment` is released at 41.25; the page stays. Slips **IV · SIGN IN** at 31.3 and **IV · THEN ACQUIRE VIA STRIPE** at 35.6. | 1.00 → 1.15 onto the sheet and the form; ease out; 37.5 → 40.5 push to 1.22 on the text column and the button | clacks per key; sheet whoosh; knocks for the two steps; the flutter at 37.00; the ink swell on the hover; a soft tick on the click |
| 40.50–42.30 | **T2 ink bleed** (swap ≈ **42.00**), origin = the Acquire button | Seven noise-displaced ink blots (the app's own `BLOTS` and timings) spread from the button and from around the frame; B appears through them (§7.3). B is P's held curtain: **the real `BIBLIOTHECA OBSCURA / OPENING THE ARCHIVE` sheet, the page reloading after checkout.** | | a low ink swell, a faint crackle, paper under it |
| 40.54–51.0 | **P**: **PLATE V · BACK FROM CHECKOUT** | The curtain lifts (rush **42.00**), the shelf rises (and glides to The Blue Hour; two `ArrowRight` just after the lift), and the slip **✓ ACQUISITION RECORDED** shows at the top. Slip **V · BACK FROM CHECKOUT** at 42.6. The camera moves from the slip down to the caption: **`₹1,300 Reg. ₹1,750 SOLD`**. **44.25 click `[ DISMISS ]`.** **46.00 click the cover** (rush 46.50): the folio opens to the kicker `… NO. 003 · SOLD` and the disabled **`IN YOUR COLLECTION — EX LIBRIS`**. Slip **V · IN YOUR COLLECTION** at 47.9. | 42.0 → 43.8 on the slip at 1.25; down to the caption at 44.0; 47.7 → 49.5 on the price and button | **downbeat at 42.00: a small brass shop-bell and a stamp thump**, and the harmony brightens from D minor to D major; knocks; the flutter at 46.00 |
| 50.56–51.46 | **T3 sheet wipe**, forward, 900 ms (rush **51.00**) | A paper sheet slides in from the right behind a 1 px ink rule (§7.1). | | the sheet whoosh |
| 51.0–54.0 | **M**: **PLATE VI · ON A PHONE** | 16:9: a single phone-viewport card (a real filmed 432 × 768 capture, hairline ink border, 3 px corners) on paper, with the type "**The same shelf, / in your hand.**" and three bracket labels `[ SWIPE ] [ TAP ] [ SCROLL ]`. In the card: swipe the shelf two volumes, tap the cover, the folio rises and scrolls. 9:16: the same footage full-bleed. Slip **VI · SWIPE, TAP, SCROLL** at 51.2. | locked | stripped to piano and shaker; touch knocks |
| 53.37–54.67 | **T4 page turn** (rush **54.00**) | A page of paper turns from the right edge to the left, its back printed with the previous scene's type showing through (§7.4). | | page rustle following the curl, a soft thump at the lay-down |
| 54.0–60.0 | **E**: end card | The shelf, UI hidden, on The Silent Valley. 54.75: the three-spine mark + `BIBLIOTHECA OBSCURA` + `— COLLECTOR ARCHIVE —`. **55.50 "Scroll the spines."**, **56.25 "Pull a volume."**, **57.00 "Acquire it."** (Newsreader 500, one line each, mask-rising **where the app's caption sits, beneath the shelf**), each landing as the shelf steps one volume (`ArrowRight` at 55.50, 56.25, 57.00). 57.75: `github.com/AaronStark1/bookstore`. The audio rings out; the picture holds to 60.00. | 1.00 → 1.04 | the groove thins; the three steps are knocks on the beat; **final chord and hit at 57.00**; reverb tail; silence by 60.00 (it loops clean) |

If an in-app animation or a measured `active` / `is-lifting` time disagrees with this table, **the measured time wins**: re-derive the segment's `from` so the rush still lands on its beat, and record the deviation.

### 6.2 Captions
Captions are **on in both cuts** (it is a walkthrough; the 9:16 plays muted). Each is a **catalogue slip**: one line, a roman numeral cell and an instruction cell (§8), **≤ 4 words in the instruction, all true**. At most one is on screen; they slide in and out with the app's own caption motion (mask-slide, never a fade).

Default position: **top centre**, y ≈ 28 px (16:9), which is clear of the brand (left) and the nav (right) on the shelf, and of the folio's text column and the cover (it is empty paper). Check every cue against the recorded anchors: if it would cover an essential UI rect (the return slip sits there in Plate V), move it to the **bottom left above the ruler** for that cue. In 9:16 the slip goes in the free band above the shelf, inside the safe zone.

### 6.3 The 9:16 cut
**Same `timeline.mjs`, same WAV.** Only the framing differs.
- **Shots:** re-film H, S, A, P and E at the phone viewport with `shots-vertical.mjs`, using **touch**. Beats that need a mouse change: the wheel notches (4.50, 5.25) become short swipes; the hover/tilt beat (8.4–11.4) becomes one more swipe and a settle; `ArrowRight` steps become swipes; the Acquire hover flood does not happen (on touch, the ink floods on press). Typing stays real key events (no on-screen keyboard is rendered; say so).
- **M** is the same capture used full-bleed. It repeats the touch gestures the other plates already showed; that redundancy is accepted to keep the timeline and the score identical.
- **Layout:** title: the mark and label in the top third, the headline below it. End card: the wordmark at the top, the shelf below, the three lines beneath it. Slips: Inter Tight 600 at 30 px.
- **Safe zones:** keep all drawn type and the key action inside **x 64–1016 and y 220–1540** (1080 × 1920). Platform UI covers the top bar, the bottom 380 px and a right-hand rail. The app's own header and ruler sit outside this; let the camera crop them where it can, and never put a caption over them.
- **Touch indicator:** no arrow. A 36 px `--sheet` disc with a 1.5 px ink keyline; it presses to 0.85 scale and throws the same cobalt ring (§8) on a tap; a swipe shows the disc travelling.

---

## 7. Transition vocabulary (compositor shader modes)

Every drawn transition is a paper or book idea that the app already uses. The app's own rule is **"every reveal is a mask slide, a clip or a scale, never a fade"**: so none of these dissolve, blur or glow. Port `cubicBezier`, `easeInk` and `easeSpring` from `frontend/src/lib/math.ts` into `lib/ease.js` and evaluate eased values in JS per camera sample, passed as uniforms.

The best transitions in the reel are the **filmed** ones: the boot curtain lift, the folio's bloom and ink bleed, the fold-back, the catalogue and sign-in sheets, the search re-spool, the shelf glide and the caption mask-slides. Let them play at full length.

- **§7.0 Curtain print-on (T0).** Not a shader mode. The drawn title is clipped with the same `inset(0 0 X% 0)` the filmed curtain uses, computed from `easeInk(u)` over 950 ms from the recorded `is-lifting` time, so the type is printed on the paper and leaves with it.
- **§7.1 Sheet wipe (T3).** Run `u` from 0 to 1 over D = 900 ms, `c = easeInk(u)`. Forward: B shows for `x > W(1 − c)` (the app's `clip-in-right`); A drifts against travel by `0.12·W·c`; B arrives with parallax 0.15 (`cubic-bezier(0.5,1,0.89,1)` over `u ∈ [0.5, 0.92]`). A **1 px ink rule** (scaled by the output scale, never less than 2 output px) rides the boundary on B's side: the sheet's hairline. Where a parallax sample leaves the frame, fill with B's flat paper colour, never by clamping.
- **§7.2 Spine rise (T1).** `N = round(W / (ws·k + gap·k))` vertical strips (`ws`, `gap` from the app's geometry at the capture viewport, `k` = output scale), full frame height. Each strip is a **book spine** drawn flat: a cloth colour from `CLOTHS` in `procedural.ts` (cycled in the specimens' own order), a foil colour (`FOILS`), two foil bands at 7.5 % and 92.5 % of the height, a flat lighter edge on the left 12 % and a flat darker edge on the right 12 % (precomputed tints, no gradient), and optionally the specimen's **title lettered vertically** in foil (Inter Tight 700, uppercase). Timing is the app's own spool: **rise** with a per-strip delay `0.45·min(1, |i − i_c| / 11)` and `1 − (1 − t)³`; **swap** A → B at verified full coverage; **sink** in the reverse order (outer strips first). D = 1.40 s: rise 0 → 0.80, hold 0.80 → 0.90, sink 0.90 → 1.40. Strips overlap by 1 px so there are no gaps.
- **§7.3 Ink bleed (T2).** The app's folio poster reveal, at frame scale: seven blots at the app's `BLOTS` positions (scaled from its 474 × 900 box to the frame, with one more centred on the clicked anchor) grow to cover the frame using the app's delays `0, 120, 220, 300, 380, 460, 540` ms, 1250 ms each, `easeInk`; the edge is displaced by 3-octave value noise at the app's scale (≈ 25 % of the width) so it **bleeds like ink on paper**. No outline. D = 1.80 s. The noise is hash-based and seeded: deterministic.
- **§7.4 Page turn (T4).** A cylinder curl: A is the page, turned from the right edge about an axis 12° off vertical, radius ≈ 0.09 W; the back of the page shows A mirrored, tinted with `--sheet` so its print ghosts through; B is the page beneath. Ease `easeInk`, D = 1.30 s. **The fold shading is the one soft gradient permitted in the reel's drawn layers** (a mathematically derived shade of `--ink` at ≤ 18 %, like the app's contact shadow); comment it as the single exception.

**Motion blur.** Keep the sibling's 3 subframes × 4 camera samples (about a 240° shutter). Check each transition's crispest moment in a `--range` sheet (the 1 px sheet rule, the spine edges, the blot edge); if a stepped triple edge reads soft, narrow the shutter for transition frames. **Do not** add bloom, vignette, glow, grain or any gradient pass. The app already has its own static paper grain in the footage; the compositor must not add another.

---

## 8. Type, colour and drawn elements

- **Colour: only the app's tokens** (`index.css`):
  - `--paper #ECE8E0`, `--sheet #F4F1EA`, `--ink #141414`, `--muted #6E6A63`, `--cobalt #1F3FB0` (whatever is in focus), `--crimson #8C2218` (seals, status), `--cloth-dark #1E232A`, `--gold-foil #C8A45D` (hi `#F1DFA9`);
  - `--rule` (`rgba(20,20,20,.85)`) and `--cobalt-soft` (`rgba(31,63,176,.12)`) as **precomputed flat mixes** over the surface they sit on (`--cobalt-soft` over paper ≈ `#D3D4DA`, over sheet ≈ `#DADCE3`; compute them);
  - the cloth and foil palettes of `lib/procedural.ts` for the spine strips only. The 12 cloths: `#5B1F1A #1F3A2E #1B2A4A #4A3423 #2B3138 #3B2440 #6A4B1E #1E4347 #1E232A #70291F #D8D0BC #C9C2B2`. The 4 foils (foil / hi): gold `#C8A45D / #F1DFA9`, cobalt `#1F3FB0 / #4D6EE6`, blind `#141414 / #3A3A3A`, white `#E9E4D8 / #FFFFFF`.
  - Pairings: `--ink` on paper or sheet; `--cobalt` for the one thing in focus; `--crimson` only for seals and `SOLD`; foil gold only on cloth.
- **Type: exactly two families**, loaded from the cached files of §4.3. Abort the render if `document.fonts.check` fails for any face; never render with a fallback.
  - **Newsreader** (500, with optical size at its maximum, tracking `−0.028em`, line-height ≈ 0.96) for the title, the end card and the phone plate's headline; italic 400 for an edition or an aside.
  - **Inter Tight** for labels, slips, numerals and the URL: 600, `0.16em` tracking, uppercase, like `.label`; bracketed (`[ SWIPE ]`) like `.bracket-btn`; tabular numerals.
  - Sizes at 1080p: headlines ≥ 120 px (Newsreader), labels ≥ 22 px, slip text ≈ 26 px (so they read in the 720p web cut). 9:16: headlines ≈ 100 px, slips 30 px.
- **Reveals:** words and lines **mask-rise** (`translateY 105% → 0` inside a clip, 820 ms `--ease-spring`, staggered 70 ms), or a rule draws by clip. Never a plain fade of type, never letter-by-letter typing, no `globalAlpha` on text.
- **The paper:** drawn plates (the title, the phone plate, the end-card type) sit on **filmed paper** (the curtain plate or the live shelf's paper). Multiply the drawn pixels, and only them, by the app's grain so type doesn't look pasted: take one frame of the empty curtain plate, divide it by `--paper` to get a static grain factor, and apply it under the overlay's alpha mask.
- **Shape language:** square corners (3 px at most, like the folio's `round 3px`), 1 px rules, bracketed labels, tabular numbers, hard offset shadows only in `--cobalt-soft` (`6px 6px 0`, as `.notice`). **Circles only for the app's own motifs**: seals, the ruler dot, the touch disc, the thumbnail's play glyph. **Forbidden:** gradients (except §7.4's fold), glows, glass, `backdrop-filter`, blur, rounded pills or cards, soft drop shadows, bloom, vignette, lens effects. Grep `reel.html` for `createLinearGradient|createRadialGradient|shadowBlur|filter|roundRect|globalAlpha` before you finish and justify each hit.
- **Catalogue slip (captions):** a `--sheet` rectangle with a 1 px `--rule` outline and a `6px 6px 0` `--cobalt-soft` shadow (the app's `.notice`), two cells split by a 1 px rule: a roman numeral in cobalt (Inter Tight 900) and the instruction in `--ink`. It slides in with the app's caption motion and leaves by sliding up out of its mask.
- **Cursor (16:9):** a classic arrow, `--sheet` fill, 1.5 px `--ink` keyline, **no shadow**. It appears by scaling in (120 ms, `--ease-spring`, no overshoot; never by fading). On press it dips (+1.5, +1.5) and a **1.5 px cobalt ring** expands from 8 to 28 px over 420 ms (its thickness constant), then is gone: the reel's acknowledgement of a press.
- **Thumbnail and cover:**
  - 16:9: the end-card frame at about 57.2 s with a play glyph centred on the active cover: a `--sheet` disc, a 1.5 px `--ink` ring and a `--cobalt` triangle.
  - 9:16: the title frame at about 2.0 s (the mark, the headline), no glyph.

---

## 9. The score (`lib/score.js`)

Same approach as the sibling: an OfflineAudioContext at 48 kHz stereo, a fixed seed, a base64 16-bit WAV returned through `renderAudio()`, and **every event time imported from `timeline.mjs` or read from `meta.json`** (the `active`, press and mount events), so sound follows what the app actually did. Only the sound design is new: warm, quiet, paper and wood.

- **Music:** 80 BPM, **D minor**, one chord per bar (an i–♭VI–iv–V colour such as **Dm9 – B♭maj7 – Gm7 – A7sus4**), 20 bars. It **brightens to D major at 42.00** when the book arrives home, and resolves on a D major (add 9) chord with its final hit at **57.00**; the tail rings out and is silent by 60.00.
  - Instruments: felt piano, a soft sine kick (felt, not a club), brushed shaker with swung 8ths, pizzicato bass (root and fifth), celesta or marimba plucks for the shelf and the search, long cello and string pads under the folio and the return, a harp glissando at the ink bleed's end. No lead synth, no sub drop, no risers that sound like a trailer.
- **Arrangement:** bar 1 piano and room tone only; 3.00 the groove enters; 12–21 strings and piano, drums thin to shaker; 21–30 plucks and key clacks; 30–42 a building cello pulse; 42–51 warm and full; 51–54 stripped (piano and shaker); 54–60 resolve.
- **Sound design, all synthesised, all placed on picture events:**
  - **Spine knock: the app's own recipe** (`lib/audio.ts` `tick()`): a triangle sweeping 1500 → 420 Hz over 28 ms (gain .11, 2 ms attack, 45 ms decay) plus a sine body 190 → 95 Hz over 60 ms (gain .09, 80 ms decay), pitch jitter ±8 % from the seeded generator, never two within 35 ms. One at every `active` change.
  - **Paper flutter: the app's own recipe** (`flutter()`): three triangles at 86, 131 and 197 Hz gliding from ×1.25 to ×1 over 0.5 s, low-passed 900 → 240 Hz, an LFO tremolo 31 → 11 Hz, a 60 ms attack to gain .09. On each folio open.
  - **Sheet whoosh:** band-passed noise whose gain follows the *derivative* of `easeInk(u)`, so it swells exactly in the rush; the pan follows the edge. For the catalogue and sign-in sheets (in and out), the fold-back and T3.
  - **Key clack:** a 2.4 kHz click plus a 180 Hz thock, 20 ms, one per key press (slightly deeper for Enter).
  - **Spine rise:** a knock per strip as it lands, pitched by its x and rolling across, and a low thud at full coverage; the sink is the same in reverse and quieter.
  - **Ink:** low-passed noise swelling over the 420 ms hover flood; a longer swell with a faint crackle under the bleed (T2).
  - **Page turn:** band-passed noise (2–7 kHz) following the curl, and a soft thump when the page lays down.
  - **Stamp thump:** a sine drop from 90 Hz plus a low-passed slap, at the return slip and the `IN YOUR COLLECTION` caption.
  - **Shop bell:** inharmonic sine partials (≈ 1, 2.4, 3.9, 5.7 × 2.6 kHz, decays 1.2 / 0.6 / 0.35 / 0.2 s) at 42.00. **No cash-register, coin or payment sounds.**
  - **Clicks:** a soft tick on every press in `meta.json`.
- **Mix:** the music bus ducks under kicks and dips 4 dB for 120 ms under each effect; a small room reverb (≈ 1.0 s IR); master `tanh` soft clip. **Level: −14 LUFS integrated, true peak ≤ −1.0 dBTP after AAC.** Normalise to about −5 dBFS sample peak in `score.js`, then verify with `ffmpeg -af ebur128=peak=true` on each encoded file; if it misses, run a two-pass `loudnorm` (linear) on the WAV before muxing.

---

## 10. Render and encode (`render.mjs`)
Use the sibling's structure: a tiny static server (`tools/showreel`, the font cache and nothing else), N pages, `renderFrame(k)` → JPEG at quality 97, `renderAudio()`, then ffmpeg. Keep the BT.601-full → BT.709-tv conversion and tags, and `-movflags +faststart`.

| Output | Spec | Encode | Budget |
|---|---|---|---|
| `bibliotheca-obscura-reel.mp4` | 1920×1080, 60 fps, 60.00 s | libx264 `-preset slow -crf 22 -profile:v high -level 4.2 -g 120`, yuv420p, AAC 192k 48 kHz | **≤ 45 MB**. Raise CRF before cutting content. |
| `bibliotheca-obscura-reel-web.mp4` | 1280×720, 30 fps | two-pass ABR from frames: `fps=30,scale=1280:720:flags=lanczos`; video ≈ `(9.4 MiB×8/60) − 96 − 40` kb/s ≈ **1.18 Mb/s**; AAC 96k | **≤ 9.4 MB** (the README drag-and-drop limit is 10 MB) |
| `bibliotheca-obscura-reel-vertical.mp4` | 1080×1920, 30 fps | libx264 `-crf 20 -maxrate 10M -bufsize 20M -profile:v high -level 4.2 -g 60`, AAC 192k | about 15–35 MB |
| `…-thumb.jpg` | 1920×1080 | the 16:9 end-card frame + play glyph | |
| `…-vertical-cover.jpg` | 1080×1920 | the 9:16 title frame | |

Review modes (use them constantly): `--beats` (120 frames, one every 0.5 s, on a contact sheet), `--at`, `--range a,b,step`, `--audio`, `--encode`. `capture --sheet` gives one frame per 0.25 s per shot. **Moiré check:** the spines carry a 3 px weave; after the 2400 → 1920 resample, look at a still of the shelf at full size and, if it moirés, resample with a better filter or raise the capture DSF.

---

## 11. Acceptance checks (all must pass; report the numbers)
1. **Durations:** every MP4 is 60.00 s ± 1 frame, and video and audio are the same length (`ffmpeg -i`).
2. **Specs:** each output matches §10 exactly: resolution, fps, H.264 High, yuv420p, BT.709 tags, AAC 48 kHz stereo. Master ≤ 45 MB; web cut ≤ 9.4 MB.
3. **Determinism:** rendering the same 6 frames (2.95, 12.00, 13.00, 27.00, 42.80, 54.00) twice gives identical JPEGs. Re-capturing shot H gives identical `meta.json` anchors and `active` events.
4. **Offline and read-only:** no capture contacted a host other than the preview origin, with the fonts fulfilled from the cache. **No request reached `:3000`, MongoDB or Stripe**; `backend/.env` was never opened or printed; the backend was never started; the fixtures contain no token except `reel-demo-token` and no email except `collector@example.com` and the app's own `archive@bibliotheca-obscura.example`. Any non-GET without an explicit mock threw. The user's dev server was not touched (same PID before and after, `git status` clean of `node_modules` noise).
5. **Real content only:** every title, author, price, edition, abstract and cover on screen comes from the app's specimen data. No feature in the §2 "do not show" list appears, and no caption says "flip", "preview", "look inside" or implies a bookplate.
6. **Fonts:** Inter Tight and Newsreader were confirmed loaded in every capture and in the compositor. No fallback face in any frame.
7. **House rules in the drawn layers:** no gradient (except §7.4's commented fold), glow, bloom, vignette, blur, rounded rect or soft shadow in `reel.html` (by grep, and by sampling overlay pixels to check they are token colours or exact alpha blends). Every circle is a seal, the ruler dot, the touch disc or the play glyph. No type fades.
8. **The frames that matter:** inspect and save single frames at each of these moments, for **both** aspects (in 9:16 nothing important may sit outside the safe zones):
   - 2.95: the curtain lift, the title printed on its edge;
   - 3.50: the shelf rising out of the floor;
   - 7.00: mid-drag, with the motion blur and the knock cascade;
   - 11.90: the folio's bloom at its rush;
   - 13.00: the ink blots mid-bleed;
   - 18.50: the Acquire button flooding with ink;
   - 23.90: the shelf re-spooling to the six matches, `6 FOUND` readable;
   - 27.00: the catalogue sheet at its rush;
   - 30.00: the spine rise at full coverage, **no gaps**;
   - 33.50: the sign-in form typed;
   - 40.90: `OPENING STRIPE CHECKOUT…` as the ink begins to bleed;
   - 41.50: the ink bleed mid-way;
   - 42.80: the `ACQUISITION RECORDED` slip over the rising shelf;
   - 48.50: `IN YOUR COLLECTION — EX LIBRIS`;
   - 51.00: the sheet wipe at its rush, the 1 px rule crisp;
   - 52.50: the phone plate;
   - 54.00: the page turn mid-way;
   - 57.20: the end-card lockup.
9. **Sync:** every press in `meta.json` has its tick within ±1 frame; every knock lines up with the caption change it came from (±1 frame); every transition's whoosh or thud peaks within ±2 frames of its rush or coverage; the `IN YOUR COLLECTION`/slip thump and the shop bell land on 42.00 and the folio flutter on 46.00 ± 2 frames.
10. **Loudness:** each file measures −14 ± 1 LUFS integrated and ≤ −1.0 dBTP true peak.
11. **Contact sheets:** the `--beats` sheet for each aspect has been viewed. There are no dead frames, no half-loaded pages, no stacked captions, no leftover sheets, no frame that shows a fallback cover or font, and every match cut is invisible.
12. **Hygiene:** compare against the snapshot you took at the start (step 1 of §12). The only new changes are `tools/showreel/` (without `out/` or `node_modules/`), `docs/reel/` and the README edit. `frontend/` and `backend/` have **no changes of yours**: the diff of those folders is identical to the snapshot. Nothing in the sibling repo was modified. The app's production build went to `tools/showreel/out/app-dist`, not `frontend/dist`. **Uncommitted changes that were already there at the start (the user may be mid-work, for example on `backend/`) are not yours: never revert, stash, reformat or commit them, and say in the report that you left them alone.**

---

## 12. Order of work (one continuous run, no stops)
Do these in order, in a single run. Each step ends when its own checks pass, not when the user replies.

**Priority:** finish the 16:9 master and web cut completely, with checks and the README note, before the vertical cut. A run that ends early should still leave a finished, verified 16:9 reel. The one exception is shot **M**, which both cuts use: film it first.

1. **Environment and clock spike:** first snapshot `git status --porcelain` and `git diff --stat` (the baseline for check 12; the working tree may already hold the user's uncommitted work); check port 5173 and leave it alone; `npm install` in `tools/showreel`; build the app into `out/app-dist` and serve it with `vite preview` on 5180; copy and adapt the clock; run the §5.1 smoke cases (a)–(f) and fix until they pass or take the fallbacks.
2. **Fixtures:** `npm run fixtures`: the 12 documents, the post-purchase variant, the font cache; prove the authorised and unauthorised `PUT`.
3. **Shot M** (phone viewport), then the **16:9 shots** H, S, A, P, E. View each `--sheet`; re-take any shot with dead frames, half-loaded images, a wrong landing (assert the caption after the drag and the glide), a stacked caption or a leftover layer.
4. **Compositor:** segments, cameras, the four transition modes, the curtain print-on and the overlays (title, slips, cursor, end card). View the `--beats` sheet and a `--range` sheet around every cut; fix what's wrong.
5. **Score:** `npm run audio`. You can't listen, so verify with numbers: render a quick low-res mux, check sync (check 9) and loudness (check 10).
6. **Master and web encodes,** with checks 1–3 and 8–10 on 16:9. Update the README now, so the 16:9 deliverable is complete.
7. **Vertical:** the 9:16 shots (touch), layout, encode and cover, then every check on 9:16.
8. **Final checks and report:** checks 4–7, 11 and 12 across everything, then the §13 report.

## 13. Final report
Report:
- what shipped, with the paths and sizes of every output;
- the final timeline as built, with any deviations from §6 and why (including every measured time that moved a segment);
- whether the H → S match cut was used or the two were filmed as one shot, and how mode S → mode L was bridged;
- every fallback you took (which check failed, what you tried, and what you shipped instead), plus anything from §6 that was cut;
- the vclock changes and anything that still needed a workaround; what you injected into the page (the caret style, the UI-hiding CSS, the observers);
- the measured numbers: durations, bitrates, sizes, LUFS, true peak, render and capture times, free disk used;
- what you could not verify (for example the audio by ear);
- anything in the app you noticed that would make a better shot but would need an app change (for example: a way to hold the boot curtain longer than its 1.5 s grace, or a visible state for the first-focused sheet field). Don't make that change.
