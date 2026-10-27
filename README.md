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

## Cloud sync (optional)

Torque can keep your data in a private GitHub repository you own, so losing the phone loses nothing.

1. Create a **private** repository, e.g. `torque-data`, with a README so it has a `main` branch.
2. Create a fine-grained personal access token limited to that one repository with **Contents: read and write**. Set an expiry and save the token in your password manager.
3. In the app: Settings → Cloud sync → username, repository, token → Test connection → Connect.

On a new phone: install from Safari → Restore from GitHub → same username, repository and token.

The token is stored only in this device's IndexedDB. It is never written to either repository, never included in exports, and never logged.

## Tests

```sh
npm test                          # unit tests, including sync against a mocked GitHub
npm run build && npx vite preview --port 4173 &
node tests/e2e/smoke.mjs          # browser: onboarding, logging, history, costs, backup/restore
node tests/e2e/sync.mjs           # browser: cloud sync against a simulated GitHub
node tests/e2e/seasons.mjs        # browser: winter tire swap reminder and warranty card
```
