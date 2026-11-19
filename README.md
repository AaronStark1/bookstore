# Bookstore

A bookstore in two parts:

| Folder | What it is |
| --- | --- |
| [`backend/`](backend/) | Node.js / Express / MongoDB REST API: books, collector accounts, uploads, Stripe checkout |
| [`frontend/`](frontend/) | "Bibliotheca Obscura", a curved 3D book archive built with Vite, React 19, TypeScript and Tailwind CSS |

`FRONTEND_PROMPT.md` is the design specification the frontend was built from.

## Setup

Requires Node.js 20+ and a MongoDB instance (local or Atlas).

```bash
npm run install:all                      # installs backend and frontend dependencies
cp backend/.env.example backend/.env     # then set MONGODB_URI, JWT_KEY and paymentKey
```

## Run

```bash
npm run dev            # backend on :3000 and frontend on :5173 together (macOS / Linux)
```

Or separately, in two terminals:

```bash
npm run dev:backend    # http://localhost:3000
npm run dev:frontend   # http://localhost:5173
```

The frontend proxies `/api` and `/uploads` to the backend. If the backend is
not running or has no books yet, the shelf shows a built-in specimen catalogue.

Other scripts: `npm run build` and `npm run lint` (both for the frontend).
See [`frontend/README.md`](frontend/README.md) for the frontend's architecture.
