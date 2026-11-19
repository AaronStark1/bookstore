# BIBLIOTHECA OBSCURA: Curved 3D Book Archive
> **Super-detailed prompt for Fable 5.2 (High-Effort Prompt Engineering)**  
> *Targeted for recreating an archival, tactile, physical 3D curved shelf experience connecting directly to the Bookstore Express/MongoDB backend.*

---

```
PROMPT FOR FABLE 5.2 (HIGH EFFORT)
================================================================================
You are tasked with engineering a production-grade, tactile, physical single-page
web application called "BIBLIOTHECA OBSCURA: Curved 3D Book Archive".
It must serve as the primary frontend for the provided Node.js/Express/MongoDB 
Bookstore backend.

This document contains the complete, uncompromising specification: mathematical 
foundations, exact CSS 3D perspective geometry, requestAnimationFrame spring physics, 
SVG ink-bleed displacement shaders, typography tokens, REST API integration contracts, 
and responsive behaviors.
================================================================================
```

---

## 1. What It Is & Visual Aesthetic

Build an evocative, tactile, single-screen **curved 3D archival book hero** for a rare and collectible literary archive. The aesthetic marries mid-century Japanese book design, antique European library archives, and Swiss modernist typography.

The environment sits on warm, fibrous, off-white deckled paper (`#ECE8E0`) bathed in diffuse natural light with a subtle floor shadow.

### The Key Visual Elements
1. **The Bookshelf Arc (Curved 3D Shelf):**
   Across the vertical center of the screen, collectible book spines stand upright on an **arc that recedes deeply into 3D space**. Towards both edges, spines become progressively smaller, darker, and more tightly packed in screen-space, turning slightly inward toward the camera—as though resting on an antique curved mahogany shelf bent into a shallow bowl.
2. **The Active Volume:**
   The book currently at the center of the arc is smoothly **rotated 90° in 3D**, turning its face toward the user so its illustrated front cover is displayed flat and proud. It hovers slightly pushed forward over an elliptical contact shadow on the floor.
3. **Background Halftone Monoliths:**
   Behind the receding shelf, two towering vertical columns of dot-screen halftone glyphs sit watermarked into the paper: **書物の記憶** (*"Memory of Books"*) on the left and **稀覯本録** (*"Rare Book Index"*) on the right.
4. **Typographic Caption:**
   Centered under the active book, the book's title is set large and sharp in archival cobalt ink (`#1F3FB0`), accompanied by its author, category, publication year, pricing (`$dprice` discount alongside crossed-out `$price`), and navigation chevrons.
5. **Timeline & Folio Scrubber:**
   Along the bottom edge runs an archival publication ruler. A cobalt indicator dot glides smoothly to the publication year / catalog index of the active book. Clicking any tick or scrubbing the ruler glides the shelf to that volume.
6. **The Tactile Detail Sheet (Folio Extraction):**
   Clicking the active book's cover initiates a physical animation: a crisp sheet of archival paper **grows directly out of the 3D cover's screen coordinates** via an expanding `clip-path: inset()`, blossoming into a two-column detail view. The right column's poster illustration **bleeds onto the paper like fresh printer's ink** via an SVG fractal noise displacement filter. The left column exposes the complete bibliographic metadata, abstract, ISBN, page count, and an interactive **"ACQUIRE FOLIO / CHECKOUT"** button that connects directly to the backend's Stripe payment endpoint.

Everything in the physical simulation runs on a single lockstep `requestAnimationFrame` loop combined with the Web Animations API (WAAPI). **Zero opacity cross-fades:** every reveal is a physical mask slide, an SVG clip, or a geometric scaling.

---

## 2. Design Tokens & Typography

### 2.1 CSS Custom Properties
```css
:root {
  /* Archival Color Palette */
  --paper: #ECE8E0;           /* Background warm deckled paper */
  --sheet: #F4F1EA;           /* Detail overlay paper sheet */
  --ink: #141414;             /* Carbon black archival typography */
  --muted: #6E6A63;           /* Muted annotation gray */
  --cobalt: #1F3FB0;          /* Archival cobalt blue accent */
  --cobalt-soft: rgba(31, 63, 176, 0.12);
  --crimson: #8C2218;         /* Seal / stamp vermilion */
  --rule: rgba(20, 20, 20, 0.85);
  --cloth-dark: #1E232A;      /* Antique book cloth fallback */
  --gold-foil: #C8A45D;       /* Embossed spine lettering */
  
  /* Spatial & Physics Constants */
  --ease-spring: cubic-bezier(0.2, 0.8, 0.2, 1);
  --ease-ink: cubic-bezier(0.76, 0, 0.18, 1);
  --H: min(48vh, 34vw);       /* Book height (desktop) */
  --cy: 42%;                  /* Shelf horizon line (desktop) */
  --P: 1400px;                /* 3D perspective depth */
}

@media (max-width: 768px) {
  :root {
    --H: min(66vw, 42svh);    /* Book height (mobile) */
    --cy: 44%;                /* Shelf horizon line (mobile) */
  }
}
```

### 2.2 Typography Stack
- **Primary Sans Stack:** `"Inter Tight", "Noto Sans JP", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
  - Used for titles, metadata, catalog labels, prices, buttons, and navigation.
- **Editorial Serif Stack:** `"Newsreader", "Playfair Display", "Georgia", serif`
  - Used for book abstracts, literary synopses, and director/author colophons.
- **Giant Halftone Display:** `"Noto Sans JP" (Weight: 900)`
  - Used exclusively for the giant background vertical kanji glyphs (`書物の記憶`).

### 2.3 Paper Grain Overlay (Procedural SVG Tile)
Apply a fixed, non-interactive overlay across the entire viewport to give the page an authentic rag paper surface:
```html
<svg id="paper-noise" class="fixed inset-0 pointer-events-none z-40 opacity-60 mix-blend-multiply w-full h-full">
  <filter id="noiseFilter">
    <feTurbulence type="fractalNoise" baseFrequency="0.82" numOctaves="3" stitchTiles="stitch" />
    <feColorMatrix type="matrix" values="
      0 0 0 0 0.46
      0 0 0 0 0.43
      0 0 0 0 0.38
      0 0 0 0.24 0" />
  </filter>
  <rect width="100%" height="100%" filter="url(#noiseFilter)" />
</svg>
```

---

## 3. Mathematical Foundations: The Curved 3D Arc Geometry

The core visual signature is a mathematically precise 3D curved shelf where volumes recede into depth and pack together on the flanks while parting naturally around the active volume.

```
                           [ CAMERA / VIEWER ]
                                    |
                                    v (0, 0, 0)
    
     Far Left (-u)                                        Far Right (+u)
      |    |   |  | |                                    | |  |   |    |
       \    \   \  \ \                                  / /  /   /    /
        \    \   \  \ \                                / /  /   /    /
         \    \   \  \ \      [ACTIVE BOOK]           / /  /   /    /
          \    \   \  \ \        (Cover)             / /  /   /    /
           \    \   \  \ \     /---------\          / /  /   /    /
            \____\___\__\_[SP] |         | [SP]____/__/___/____/
                               \---------/
                                (Turned 90°)
```

### 3.1 Book Dimension Proportions
Given book height $H$ measured dynamically from `--H`:
- **Spine Width:** $w_s = H \cdot \frac{148}{840} \approx 0.176 H$
- **Cover Depth/Width:** $d = H \cdot \frac{474}{900} \approx 0.526 H$
- **Inter-book Gap:** $\text{gap} = H \cdot 0.038$
- **Depth Falloff Constant:** $U = H \cdot 1.32$ (desktop), $H \cdot 1.05$ (mobile)
- **Perspective Constant:** $P = 1400$

### 3.2 Cyclic Virtual Indexing
To allow infinite, buttery-smooth cyclic scrubbing across the library, render 3 complete repetitions of the $N$ books ($3N$ virtual books total).
- The current virtual cursor is $s$ (float), targeting discrete integer target $T$.
- Relative index $r$ for virtual book $v \in [0, 3N - 1]$:
  $$\text{rel}(v, s) = ((v - s + 1.5N) \bmod 3N) - 1.5N$$

### 3.3 Active Book Expansion Arc Length $F(r)$
When a book rotates 90° to present its broad cover, its physical footprint on the shelf expands from spine width $w_s$ to cover width $d$. Its neighbors must part smoothly:
$$B(r) = \begin{cases} 
\frac{r + \frac{\sin(\pi r)}{\pi}}{2} & \text{if } |r| < 1 \\
\text{sign}(r) \cdot 0.5 & \text{if } |r| \ge 1 
\end{cases}$$
The physical arc length $u$ from the shelf center is:
$$F(r) = r \cdot (w_s + \text{gap}) + (d - w_s + 1.4 \cdot \text{gap}) \cdot B(r)$$

### 3.4 Depth Compression & Screen Space Mapping
Spines located far down the curve recede into depth and pack more tightly:
- Scale at distance $u$:
  $$\text{scl}(u) = \frac{1}{1 + \left(\frac{|u|}{U}\right)^{1.6}}$$
- Screen coordinate $x_{\text{sc}}(u)$:
  Precompute lookup table $XS$ by integrating from $0$ to $3U$ in steps of 2px:
  $$XS[u] = \sum_{i=0}^{u/2} \frac{2}{1 + (2i / U)^{1.6}}$$
  $$x_{\text{sc}}(u) = \text{sign}(u) \cdot XS[|u| / 2]$$

### 3.5 Per-Frame 3D Coordinate Calculation
For every volume on the shelf at each frame:
1. $r = \text{rel}(v, s)$. If $|u| > 1.95 U$, set `display: none` (cull off-screen volumes).
2. Open transition scalar: $o = \text{smoothstep}(\max(0, 1 - |r|))$, where $o \in [0, 1]$.
3. Apparent scale: $\text{sc} = \text{scl}(u)$, inverted depth factor: $k = \frac{1}{\text{sc}}$.
4. **3D Translation:**
   $$z = P \cdot (1 - k) + o \cdot (H \cdot 0.12)$$
   $$x = x_{\text{sc}}(u) \cdot k$$
   $$y = \left(H \cdot 0.5 \cdot (1 - \text{sc}) \cdot 0.44 + o \cdot (H \cdot 0.015) - \text{lift} \cdot (H \cdot 0.06)\right) \cdot k$$
   *(Note: The $y$ formula causes distant volumes to sink slightly downward, forming the curved bowl).*
5. **3D Rotation:**
   $$\text{rotY} = \text{sign}(u) \cdot \min\left(1, \frac{|u|}{U}\right) \cdot 26^\circ \cdot (1 - o) - 90^\circ \cdot o + (\text{tiltY} \cdot o)$$
   $$\text{rotX} = \text{tiltX} \cdot o$$
6. **CSS Transform String:**
   `transform: translate3d(${x}px, ${y}px, ${z}px) rotateX(${rotX}deg) rotateY(${rotY}deg);`
   `z-index: ${Math.round(3000 + z)};`

### 3.6 Lighting, Shading & Hover Dynamics
- **Spine Face Shading (`--shade`):**
  $$\text{shade}_{\text{spine}} = \min(0.65, o \cdot 0.55 + (1 - \text{sc}) \cdot 0.35)$$
  Spines far from the center sink into deeper shadow; the active spine darkens as its front cover rotates into primary view.
- **Cover Face Shading:**
  $$\text{shade}_{\text{cover}} = (1 - o) \cdot 0.85$$
- **Hover Lift:**
  Hovering over an inactive spine ($|r| > 0.5$) elevates its target lift to $1.0$, smoothly easing at $1 - e^{-12 \, dt}$, making the book rise gently out of the shelf.

---

## 4. Physics Engine & Interaction Mechanics

### 4.1 Spring Dynamics
All shelf motion obeys an exponential relaxation spring:
$$s \leftarrow s + (T - s) \cdot (1 - e^{-k_{\text{spring}} \cdot dt})$$
- Idle gliding: $k_{\text{spring}} = 5.2$
- Active touch/mouse dragging: $k_{\text{spring}} = 18.0$
- Delta time ($dt$) clamped at maximum $0.050\text{s}$ to prevent tunneling after tab refocusing.
- Virtual wrap: when $s$ exceeds $\pm N$ offset, shift both $s$ and $T$ by whole multiples of $N$ to guarantee infinite scrolling with no floating-point precision loss.

### 4.2 Interactive Mouse Tilt Tracking
When the active book has settled ($|T - s| < 0.25$) and the detail sheet is closed:
- Within target area of the cover:
  $$\text{tiltY}_{\text{target}} = \frac{m_x - W/2}{0.55 d} \cdot 9^\circ$$
  $$\text{tiltX}_{\text{target}} = -\frac{m_y - \text{cy}}{H/2} \cdot 6^\circ$$
- Easing rate: $\text{tilt} \leftarrow \text{tilt} + (\text{tilt}_{\text{target}} - \text{tilt}) \cdot (1 - e^{-7 \, dt})$.

### 4.3 Input Modalities
- **Direct Book Click:** Clicking the active volume opens the detail sheet. Clicking any non-active spine glides the shelf directly to that book ($T = \text{round}(T + r)$).
- **Drag & Flick:** Dragging horizontally scrubs the shelf proportionally to $(w_s + \text{gap})$. On release, snap $T$ to the nearest integer volume.
- **Trackpad / Wheel:** Horizontal or vertical wheel deltas increment $T$. On idle timeout ($150\text{ms}$), smoothly snap $T$ to the nearest integer.
- **Keyboard Navigation:** `←` / `→` step $\pm 1$. `Enter` opens the active book. `Escape` closes the detail sheet.
- **Timeline Ruler Scrubbing:** Clicking or scrubbing along the bottom timeline translates the position directly into the nearest book publication year.

---

## 5. UI Structure & Components

```
+-----------------------------------------------------------------------------------+
|  BIBLIOTHECA OBSCURA — COLLECTOR ARCHIVE               [SEARCH] [CATALOG] [LOGIN] |
+-----------------------------------------------------------------------------------+
|                                                                                   |
|  書                                                                            稀 |
|  物         [========= CURVED 3D REPOSING BOOKSHELF =========]                 覯 |
|  の                                                                            本 |
|  記                              /-----------\                                 録 |
|  憶               |||||||||||||| |   BOOK    | ||||||||||||||                  |
|                                  |   COVER   |                                    |
|                                  \-----------/                                    |
|                               (Contact Shadow)                                    |
|                                                                                   |
|                                  NOON IN ASHES                                    |
|                            CORMAC MCCARTHY / 灰の正午                             |
|                                 --------------                                    |
|                             1971 — FIRST EDITION                                  |
|                             $48.00  (Reg. $65.00)                                 |
|                                                                                   |
|   < [PREV]                                                              [NEXT] >  |
|                                                                                   |
+-----------------------------------------------------------------------------------+
|   1955 ----|---- 1960 ----|---- 1965 ----|---- 1970 --*-- 1975 ----|---- 1980     |
+-----------------------------------------------------------------------------------+
|  © BIBLIOTHECA OBSCURA. ALL RIGHTS RESERVED.               REST API: ONLINE       |
+-----------------------------------------------------------------------------------+
```

### 5.1 The Book Element Anatomy (Pure CSS 3D Box)
Each book is represented by an ultra-lightweight DOM node containing two textured faces:
```html
<div class="book-box" data-index="0">
  <!-- Spine Face: visible when resting on shelf -->
  <div class="face sp">
    <div class="spine-texture"></div>
    <div class="spine-emboss">
      <span class="spine-title">THE SILENT VALLEY</span>
      <span class="spine-author">K. ISHIGURO</span>
      <span class="spine-badge">FOLIO</span>
    </div>
    <div class="shade-overlay"></div>
  </div>
  
  <!-- Cover Face: visible when rotated 90deg -->
  <div class="face cv">
    <div class="cover-artwork" style="background-image: url(...)"></div>
    <div class="cover-frame"></div>
    <div class="shade-overlay"></div>
  </div>
</div>
```

### 5.2 Dynamic Caption (Mask Slide Animation)
Under the shelf, the caption container masks vertical typography transitions:
- When the active index changes, the outgoing text slides upward: `translateY(-105%)` over 600ms.
- The incoming text slides upward from below: `translateY(105%)` to `translateY(0)` over 600ms.
- Timing: `cubic-bezier(0.2, 0.8, 0.2, 1)`, zero cross-fade opacity flickering.

---

## 6. The Archival Detail Sheet (Physical Paper Blooming)

When the user clicks the active book's cover, an archival folio sheet unfolds through a physical geometric expansion:

### 6.1 Spatial Projection (`getBoundingClientRect`)
1. Read the bounding rectangle of the active `.cv` cover face directly in viewport coordinates:
   $$\text{rect} = \text{coverEl.getBoundingClientRect()}$$
2. Initialize the `.detail` sheet overlay:
   `clip-path: inset(${rect.top}px ${viewportWidth - rect.right}px ${viewportHeight - rect.bottom}px ${rect.left}px round 3px)`
3. Display the sheet container and execute WAAPI animation over **1050ms** (`cubic-bezier(0.76, 0, 0.18, 1)`) expanding to:
   `clip-path: inset(0px 0px 0px 0px round 0px)`
   *(This gives the exact visual impression that the book cover physically blossoms into the full-screen paper sheet).*

### 6.2 Ink Bleed Poster Illustration Shader
The right column of the detail sheet contains the full-bleed cover artwork masked by an SVG displacement ink blot:
```html
<svg class="poster-svg" viewBox="0 0 474 900">
  <defs>
    <filter id="ink-bleed-filter">
      <feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="3" seed="7" result="noise" />
      <feDisplacementMap in="SourceGraphic" in2="noise" scale="120" xChannelSelector="R" yChannelSelector="G" />
    </filter>
    <mask id="ink-mask">
      <g filter="url(#ink-bleed-filter)">
        <!-- 7 Expanding Blot Circles -->
        <circle class="ink-blot" cx="150" cy="330" r="0" />
        <circle class="ink-blot" cx="340" cy="600" r="0" />
        <circle class="ink-blot" cx="250" cy="120" r="0" />
        <circle class="ink-blot" cx="90"  cy="760" r="0" />
        <circle class="ink-blot" cx="400" cy="250" r="0" />
        <circle class="ink-blot" cx="260" cy="860" r="0" />
        <circle class="ink-blot" cx="230" cy="470" r="0" />
      </g>
    </mask>
  </defs>
  <image href="..." width="474" height="900" mask="url(#ink-mask)" preserveAspectRatio="xMidYMid slice" />
</svg>
```
- Each `.ink-blot` circle has its radius animated from `0` to `720px` with staggered delays ($0\text{ms}, 120\text{ms}, 220\text{ms}, 300\text{ms}, \dots$) over $1250\text{ms}$.
- The displacement filter distorts the boundary of the circles into organic, feathered ink plumes bleeding through paper fiber.

### 6.3 Left Column: Archival Data & Acquisition
- **Bibliographic Metadata:**
  - Japanese romanised calligraphy subtitle
  - Big condensed serif title (`clamp(42px, 5vw, 76px)`)
  - Meta tags: `YEAR` / `CATEGORY` / `NO. OF PAGES` / `LANGUAGE` / `ISBN`
  - Longform editorial abstract/synopsis set in Newsreader serif
  - Publisher imprint badge
  - Pricing badge: discounted price (`dprice`) in bold cobalt, original retail (`price`) struck through
  - Uploaded gallery previews (`UploadedImages` array)
- **Direct Acquisition Action:**
  - An interactive button: **"ACQUIRE VOLUME — $dprice / 購入する"**
  - Clicking calls `PUT /api/makePayment`, initializes Stripe Checkout, and redirects the collector seamlessly.

---

## 7. Backend API Integration Specification

The frontend connects directly to the Node.js / Express backend running on `http://localhost:3000` (or configured via environment variables).

### 7.1 Backend Endpoints Matrix
| Method | Endpoint | Auth | Purpose | Response Payload |
|---|---|---|---|---|
| `GET` | `/api/getBooks` | Public | Full library catalog with optional search query (`?search=query`) | Array of Book objects |
| `GET` | `/api/getHomeBooks` | Public | Featured archival books (latest 4) | Array of Book objects |
| `GET` | `/api/viewBook/:id` | Public | Single book details | Book object |
| `POST` | `/api/login` | Public | User authentication | `{ message, existingUser, token }` |
| `POST` | `/api/register` | Public | New collector registration | `{ message, newUser }` |
| `POST` | `/api/google-login` | Public | Google SSO login/register | `{ message, existingUser, token }` |
| `POST` | `/api/addBook` | Bearer Token | Add new volume (Multipart form data: fields + `UploadedImages`) | `"Book added successfully..."` |
| `PUT` | `/api/makePayment` | Bearer Token | Purchase book & generate Stripe checkout session | `{ message, session, sessionID }` |
| `PUT` | `/api/update-user` | Bearer Token | Update collector profile & avatar | `{ message, updateUser }` |

### 7.2 Book Data Model Mapping
Map the backend MongoDB schema directly into the 3D shelf:
```typescript
interface BookDocument {
  _id: string;
  title: string;              // e.g. "Noon in Ashes"
  author: string;             // e.g. "Cormac McCarthy"
  noofpages: number;          // e.g. 384
  imageUrl: string;           // Primary front cover artwork URL
  price: number;              // Standard retail price (e.g. 35)
  dprice: number;             // Archival collector price (e.g. 28)
  abstract: string;           // Synopsis / curatorial note
  publisher: string;          // e.g. "Tokyo Book Arts / 恒星社"
  language: string;           // e.g. "English / Japanese Notes"
  isbn: string;               // e.g. "978-4-87654-321-0"
  category: string;           // e.g. "Rare Folio / Fiction"
  UploadedImages: string[];   // Array of supplementary image filenames in /uploads
  status: "pending" | "sold"; // Availability state
  userMail: string;           // Curating user / owner email
  brought?: string;           // Buyer email if purchased
}
```

### 7.3 Cover & Spine Asset Handling
1. **Live Backend Covers:**
   If `book.imageUrl` is a complete URL (`http...`), use it directly. If it is a filename from `/uploads/`, prefix with `http://localhost:3000/uploads/${book.imageUrl}`.
2. **Procedural Spine Texture Synthesis:**
   When custom books are added via the backend, spine artwork may not exist as a separate cropped image. Implement a dynamic procedural spine generator:
   - Deep tactile cloth/leather background colors generated deterministically from the book's title hash.
   - Embossed foil typography (`gold-foil` or `cobalt`) oriented vertically: `writing-mode: vertical-rl`.
   - Raised horizontal spine bands (decorative ribbing) rendered via linear gradient shadows.
3. **Resilience & Fallback Mock Collection:**
   If the backend is not yet seeded or is unreachable, the frontend must smoothly fall back to a built-in collection of 12 classic literary folios (The Silent Valley, The Blue Hour, River of Salt, Noon in Ashes, etc.) with verified Higgsfield artwork crops, ensuring the 3D shelf is immediately playable out of the box.

---

## 8. State Machine & Event Architecture

```
                      +-------------------+
                      |   BOOT / SEED     |
                      | Preload Textures  |
                      +---------+---------+
                                |
                                v
               +---------------------------------+
               |         IDLE SHELF              |
               | - RAF spring physics active     |
               | - Mouse tilt tracking           |
               | - Timeline dot interpolation    |
               +---+-------------+-----------+---+
                   |             |           |
          Drag/Keys|        Click Active     | Search Input
                   v             |           v
           +---------------+     |    +---------------+
           | SCRUBBING     |     |    | FILTERING     |
           | High spring k |     |    | Re-spool 3D   |
           +-------+-------+     |    +-------+-------+
                   | Snap        |            |
                   +-------->----+            |
                                 |            v
                                 v    +---------------+
                     +----------------+ DETAIL OPEN   |
                     | 1. Freeze T    | - clip-path   |
                     | 2. Rect expand | - ink shader  |
                     | 3. WAAPI play  | - Stripe CTA  |
                     +----------------+---------------+
```

---

## 9. Capabilities, Suggested Enhancements & Improvements

*(Document these explicit capabilities in the codebase for future extension)*

1. **Acoustic Tactile Feedback (Web Audio API Synthesizer):**
   - Synthesize subtle, organic clicks during shelf scrubbing (mimicking book spines sliding against polished oak).
   - A soft, low-frequency paper flutter when the detail sheet opens.
   - Built entirely with native `AudioContext` oscillators (zero external audio file dependencies).
2. **Procedural Foil & Ribbing Customizer:**
   - Allow users adding books via `/api/addBook` to pick book-cloth textures (Buckram, Moroccan Leather, Japanese Washi Paper) and spine stamping foil (Gold Leaf, Blind Deboss, White Pigment).
3. **Curated Virtual Bookplates (Ex Libris):**
   - When a user logs in via `/api/login`, books they have purchased (`status === 'sold' && brought === user.email`) render an authentic engraved *Ex Libris* bookplate pasted onto the inside front flyleaf.
4. **Interactive 3D Page Flip Specimen:**
   - Inside the detail sheet, allow clicking "SAMPLE FOLIO" to reveal a 3D dual-page flip preview of the first chapter or curatorial plates.
5. **Dynamic Search Re-spooling:**
   - Typing into the search bar debounces a call to `/api/getBooks?search=...`, gracefully dissolving unmatching books and rebuilding the 3D arc around the matching results without interrupting the animation loop.

---

## 10. Frontend Framework & Implementation Recommendations

### Recommended Stack: **Vite + React 19 + TypeScript + Tailwind CSS**
*(With an Isolated DOM `requestAnimationFrame` Controller)*

#### Why This Architecture?
| Architectural Concern | Recommendation | Rationale |
|---|---|---|
| **60-120 FPS Physics** | Pure DOM RAF Loop (Vanilla Ref) | React's VDOM diffing overhead must NOT run at 60Hz. The 3D arc transforms and spring mathematics should directly mutate DOM element `style.transform` properties inside a single `requestAnimationFrame` callback. |
| **State & Modals** | React 19 Component Tree | React excels at managing authentication modals (Login/Register/Google SSO), Stripe checkout transitions, cart drawers, and form validation for adding books. |
| **Styling & Polish** | Tailwind CSS + Custom CSS Variables | Rapid layout development with instant access to responsive tokens, custom fonts, and hardware-accelerated CSS 3D classes. |
| **API Management** | TanStack Query (React Query) | Handles caching for `/api/getBooks`, automatic refetching on window focus, optimistic updates for Stripe checkout, and search query debouncing. |

#### Alternative: Plain Vanilla JS Single-File Implementation
If absolute zero external dependencies is desired (matching the exact Leon Vasari format), the entire application can be authored in a single `index.html` file containing embedded CSS, inline SVG filters, vanilla JavaScript ES modules, and native `fetch()` calls to the backend endpoints.

---

## 11. Verification Checklist & Acceptance Criteria

When Fable 5.2 generates the solution, it must satisfy:
- [ ] **Curved Arc Depth:** Books sink into a true 3D bowl ($P=1400\text{px}$) with realistic perspective scaling and darkening shadows on the flanks.
- [ ] **Active Book 90° Turn:** The center volume smoothly rotates $90^\circ$ around its Y-axis to present its front cover flat to the camera.
- [ ] **Physical Paper Expansion:** Clicking the cover triggers a seamless `clip-path: inset()` expansion of the detail sheet originating precisely from the 3D projected cover rect.
- [ ] **Ink Bleed SVG Shader:** The detail poster reveals itself through organic fractal ink blots driven by `feTurbulence` and `feDisplacementMap`.
- [ ] **Backend Integration:** Successfully consumes `/api/getBooks`, handles search queries, and initiates Stripe checkout with `/api/makePayment`.
- [ ] **Responsive Fluidity:** Flawless touch-drag scrubbing and layout adaptation on mobile devices ($\le 768\text{px}$).
- [ ] **Zero Jank:** Stable 60fps frame rate with zero layout thrashing or opacity fade shortcuts.
