# Torque

Offline-first PWA that tracks maintenance for a Mazda CX-5 Signature 2.5 Turbo. See [SPEC.md](SPEC.md) for the full spec.

## Develop

```sh
npm ci
npm run dev        # local dev server
npm test           # Vitest
npm run build      # typecheck + production build (set BASE_PATH=/Torque/ for Pages)
node scripts/generate-icons.mjs   # regenerate public/icons (needs Playwright)
```

## Deploy

Pushing to `main` runs `.github/workflows/deploy.yml`: `npm ci`, `npm test`, `npm run build`, then publishes `dist` to GitHub Pages. Failing tests block the deploy.

One-time repo setting: **Settings → Pages → Build and deployment → Source: GitHub Actions**.

## Install on iPhone

Open the Pages URL in Safari → Share → Add to Home Screen.
