# Decisions

Where the spec was ambiguous, the simplest option that keeps data safe was chosen.

## Phase 1

- **Router:** a ~20-line hash router in `src/router.ts` instead of a library; routes are a closed union type.
- **Vite `base`:** read from the `BASE_PATH` env var (set by the workflow from the repo name), defaulting to `/` locally, so renaming the repo needs no code change.
- **Service worker update:** `registerType: 'prompt'` so the user taps to refresh instead of the app reloading mid-entry.
- **Icons:** generated from inline SVG by `scripts/generate-icons.mjs` and committed, so CI does not need a browser.
- **FAB and bottom sheet:** deferred to Phase 3, when there are forms to open. Phase 1 ships only the tab bar, update toast and install hint.
- **Pinned toolchain:** versions are whatever `npm install` resolved; `package-lock.json` is committed.
