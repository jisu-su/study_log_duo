# studuo / duoingsu

Two-person study log web app.

## Monorepo Layout

- `apps/web`: Cloudflare Pages (React + Vite + TypeScript)
- `apps/worker`: Cloudflare Workers (Hono) + D1 + R2
- `shared`: shared utilities (logical date, etc.)

## Privacy / Secrets

Do NOT commit real emails or secrets.

- `ALLOWED_EMAILS`: set via Cloudflare secret or local dev vars
  - Example placeholder: `a@gmail.com,b@gmail.com`
- `CORS_ORIGIN` (Worker var): set to your Pages origin
  - Example: `https://duoingsu.pages.dev`
- Firebase project id (not secret): `studuo-fa42b`

## Local Dev

### 1) Install

```powershell
npm install
```

### 2) Web env

Copy `apps/web/.env.example` to `apps/web/.env.local` and fill your Firebase Web App config.

### 3) Worker env (recommended)

Create `apps/worker/.dev.vars` (ignored by git):

```env
FIREBASE_PROJECT_ID=studuo-fa42b
ALLOWED_EMAILS=your_email_1,your_email_2
```

### 4) Run worker

```powershell
cd apps/worker
npm run dev
```

### 5) Run web

```powershell
cd apps/web
npm run dev
```

The web dev server proxies `/api` to the worker dev server at `http://127.0.0.1:8787`.

