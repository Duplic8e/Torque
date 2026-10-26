# CX-5 Maintenance Tracker — Build Spec

Oct 26, 2026 · @ab3

## Summary and constraints

Build an offline-first Progressive Web App (PWA) called **Torque** that tells me, in one glance, what my Mazda CX-5 Signature 2.5 Turbo needs next and when. It runs entirely in the browser, is hosted free on GitHub Pages, and installs to my iPhone home screen with no Xcode and no server.

**Hard constraints**

- Single user, no accounts, no login. Data lives on the device (IndexedDB) and syncs automatically to a private GitHub repo I own, so losing the app or phone loses nothing.
- Static hosting only: GitHub Pages, deployed by GitHub Actions on push to `main`.
- Must work fully offline after first load, including adding and editing records.
- iPhone first: designed for a 390 px wide screen, installed via Safari's Add to Home Screen, running in standalone mode.
- Function before polish: every feature below must work and be tested before visual refinement. The UI uses design tokens so it can be restyled later without touching logic.
- Data must never be lost silently: automatic backup reminders plus one-tap JSON export and import.

**What it does**

1. Tracks every service with date, odometer, cost, shop, parts and notes.
2. Knows the CX-5 Turbo's maintenance schedule (editable) and computes what is due by miles **or** months, whichever comes first.
3. Estimates today's mileage from my driving pace, so reminders stay accurate between odometer updates.
4. Shows costs over time and cost per mile.
5. Exports due dates to my iPhone Calendar (.ics) so I get real native reminders.
6. Leaves room for the other apps in the suite (fuel log, document vault) to plug in later.

**Out of scope for v1:** multiple users, third-party cloud accounts, push notifications from a server, OBD-II/Bluetooth, VIN decoding APIs.

## Overall flow

The app runs one loop: **update odometer → see what is due → log the service → schedule recalculates**. Everything else supports that loop.

&#91;embedded content: core loop · 4 steps\]

The due engine is the centre of the app; every screen either feeds it data or shows its results.

### First run (onboarding, under 60 seconds)

1. Welcome screen with an "Install to Home Screen" hint (shown only in Safari, hidden in standalone mode).
2. Vehicle: year (picker 2019 to 2025), nickname (default "CX-5"), trim prefilled as Signature 2.5 Turbo, optional VIN and plate. Units: miles or km.
3. Current odometer reading (required).
4. Driving style: Normal or Severe (towing, short trips, extreme heat or cold, dusty roads). Severe shortens the intervals marked severe-sensitive.
5. Last known service for each core item (oil, rotation, filters, brake fluid, coolant, plugs). Each has three choices: enter date and mileage, "Not sure" (treated as due now, flagged amber), or "Never, car is new" (baseline = purchase date and odometer).
6. Connect cloud sync (paste the GitHub token) or skip for now, then land on the Dashboard with the schedule computed. The welcome screen also offers "Restore from GitHub", which skips all of these steps.

### Daily and weekly use

1. Open app → Dashboard shows the car's status and the next 3 items.
2. Tap the odometer → number pad sheet → save. Takes 3 seconds. The app nudges for this if the last reading is older than 14 days.
3. Glance at status: green (fine), amber (due soon), red (overdue).

### Logging a service visit

1. Tap the big **+** button (always visible) → "Log service".
2. Date defaults to today; odometer defaults to the estimated current mileage.
3. Pick one or more services done in this visit (multi-select chips: Oil + filter, Tire rotation, Cabin filter…). One visit can cover several items.
4. Optional: total cost (or cost per item), shop name (autocompletes from past shops), DIY toggle, parts used (e.g. oil brand and weight, filter part number), notes, receipt photo.
5. Save → haptic-feel animation, the affected items reset to green, and the toast offers "Add next due date to Calendar".

### Reminders

- In-app: status on the Dashboard, plus an app icon badge with the count of overdue and due-soon items (Badging API, available to home-screen web apps on iOS 16.4+ after notification permission).
- Native: an "Export to Calendar" action creates an .ics file with an all-day event and alert for each due item; iOS opens it in Calendar. Re-export after logging updates the dates (stable event UIDs so events update instead of duplicating).

### Backup

- Settings shows "Last backup: N days ago". With cloud sync on, every change reaches GitHub within seconds and a banner appears only if sync has failed for 24 hours. Without sync, a banner appears after 30 days or 5 new records.
- Export creates `torque-backup-YYYY-MM-DD.json` via the iOS share sheet (save to Files or iCloud Drive). Import validates the file, shows a preview of counts, then replaces or merges.

### Edge cases the flow must handle

- Odometer entered lower than a previous reading → warning with "Fix" or "Save anyway (correction)".
- Editing or deleting a past service → schedule recalculates instantly.
- A service logged out of order (older date) → only the most recent instance of each item drives the next due date.
- No odometer updates for a long time → mileage estimate is labelled "est." and the confidence drops (see due engine).

## Front end

A small, fast, single-page app: five screens behind a bottom tab bar, one floating add button, and bottom sheets for every form so everything is reachable with one thumb.

### Stack

| Piece | Choice | Why |
| --- | --- | --- |
| Build tool | Vite | Fast, simple GitHub Pages output |
| Language | TypeScript (strict) | Catches date and mileage math bugs |
| UI | Preact + hooks | React-like, about 4 KB |
| Routing | Hash router (`#/history`) | Works on GitHub Pages with no 404 tricks |
| Styling | Plain CSS with custom properties (design tokens) | Easy to restyle later |
| Charts | Hand-rolled SVG | No heavy library; only 2 charts needed |
| Icons | Inline SVG set (Lucide icons, copied in) | Offline, no font loading |
| PWA | `vite-plugin-pwa` (Workbox) | Precaches everything for offline |

### Screens

**1. Dashboard (home)**

- Hero card: car nickname, year and trim, a large odometer that rolls digits up when changed, "est." tag when estimated, and "Updated 3 days ago".
- Health ring: one circular score 0 to 100 (100 = nothing due within 30 days; each due-soon item −10, overdue −25, floor 0). Colour follows the worst item.
- "Up next": the 3 most urgent items as cards. Each card shows the service name, a linear progress bar of interval used (whichever of miles or time is further along), "in 1,240 mi or 47 days", and a projected date ("around Dec 12").
- Quick actions row: Update odometer, Log service, Export to Calendar.
- Backup banner when needed.

**2. Schedule**

- Every maintenance item, sorted by urgency, grouped into Overdue / Due soon / Upcoming / Inspect-only.
- Tap an item → detail sheet: interval rules, last done, next due (miles and date), history of that item, and a "Mark done" shortcut that opens Log service prefilled.
- Edit mode: change intervals, toggle severe-sensitive, disable an item, add a custom item (e.g. "Ceramic coating top-up, every 6 months").

**3. History**

- Reverse-chronological timeline of visits, grouped by month. Each row: date, odometer, service chips, total cost, shop.
- Search box (matches services, shop, notes, parts) and filter chips (category, year, DIY vs shop).
- Tap a visit → full detail with receipt photo, edit, duplicate, delete (with undo toast for 6 seconds).

**4. Costs**

- Totals: this year, last 12 months, lifetime.
- Cost per mile (lifetime spend ÷ miles driven since first record).
- Bar chart: spend per month for the last 12 months.
- Breakdown by category (Oil, Tires, Brakes, Filters, Fluids, Repairs, Other) as a horizontal stacked bar.
- Average miles per month, from odometer history.

**5. Settings**

- Vehicle details, units, driving style (Normal / Severe), due-soon thresholds (default 500 mi or 30 days).
- Cloud sync: status, last synced, Sync now, Disconnect. Manual backup: Export, Import, last export date.
- Calendar: Export all due items, alert time (default 9:00 AM, 7 days before).
- Notifications: enable badge (requests permission).
- Danger zone: reset all data (requires typing "RESET").
- About: version, storage used, "Request persistent storage" status.

### Global components

- **Floating add button (FAB):** bottom right, above the tab bar. Opens a mini menu: Log service, Update odometer, Add note.
- **Bottom sheet:** used for every form; drag handle; swipe down to dismiss; asks before discarding unsaved input.
- **Number pad input:** `inputmode="numeric"`, thousands separators as you type, large 28 px digits.
- **Status chip:** green OK, amber Due soon, red Overdue, grey Inspect.
- **Toast:** bottom, 4 to 6 seconds, optional Undo.
- **Empty states:** every list has a helpful empty state with the action to fill it.

### iPhone PWA specifics (must do)

- `manifest.webmanifest`: `display: standalone`, `start_url: "./"`, `scope: "./"`, theme and background colours, icons at 192 and 512 px plus a maskable icon.
- In `index.html`: `apple-touch-icon` (180 px), `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style: black-translucent`, `viewport-fit=cover`.
- Respect safe areas with `env(safe-area-inset-*)` on the header, tab bar and FAB.
- All inputs at 16 px font or larger so Safari does not zoom on focus.
- Disable double-tap zoom on buttons (`touch-action: manipulation`); keep pinch zoom for accessibility.
- Use `100dvh`, not `100vh`, for full-height layouts.
- Detect standalone with `matchMedia('(display-mode: standalone)')` or `navigator.standalone`.
- Show "Update available, tap to refresh" when a new service worker is waiting.

### Design direction (sleek now, refined later)

- Theme: dark by default ("garage at night"), with a light theme that follows the system setting.
- Accent: a deep red inspired by Mazda's Soul Red, used only for the primary action and the health ring. Status colours stay standard green, amber, red so meaning is never confused with branding.
- Type: system font stack (`-apple-system`, SF Pro); odometer digits in tabular numerals.
- Motif: thin progress bars styled like a gauge needle sweep; cards with 16 px radius and subtle 1 px borders instead of shadows.
- Motion: short 150 to 250 ms transitions; respect `prefers-reduced-motion`.
- All colours, radii, spacing and fonts defined as CSS variables in `tokens.css` so the UI pass later only edits that file and components' CSS.
- Accessibility: 44 px minimum tap targets, labels on every input, colour is never the only signal (chips always have text).

## Back end

There is no server. The "back end" is a typed data layer inside the app: IndexedDB for storage, a pure-function due engine for the maths, and JSON and .ics files for getting data out. Keeping it pure and separate from the UI makes it fully unit-testable.

### Storage

- **IndexedDB via Dexie.js** (database name `torque`, versioned schema with migrations). Survives app restarts and works offline.
- Call `navigator.storage.persist()` on first launch and show the result in Settings, so iOS is less likely to clear data under storage pressure.
- Receipt photos stored as compressed Blobs (resize to max 1600 px, JPEG quality 0.7) in a separate `attachments` table so lists stay fast.
- All writes go through a repository module (`db/repo.ts`); components never touch Dexie directly.
- Note on privacy: GitHub Pages hosts only the code. My data goes only to my own private data repo (see Cloud sync), never to the public app repo.

### Data model (TypeScript)

```ts
type ID = string; // crypto.randomUUID()
type ISODate = string; // 'YYYY-MM-DD'

interface Vehicle {
  id: ID; nickname: string; make: 'Mazda'; model: 'CX-5';
  year: number; trim: 'Signature'; engine: 'SKYACTIV-G 2.5T';
  vin?: string; plate?: string; purchaseDate?: ISODate; purchaseOdometer?: number;
  units: 'mi' | 'km'; drivingStyle: 'normal' | 'severe';
  oilSpec?: string; // e.g. weight and capacity, from owner's manual
  tireSize?: string; createdAt: string; updatedAt: string;
}

interface OdometerReading {
  id: ID; vehicleId: ID; date: ISODate; value: number;
  source: 'manual' | 'service'; isCorrection?: boolean;
}

interface ServiceItem { // a schedule rule
  id: ID; vehicleId: ID; key: string; // 'oil', 'rotation', 'cabin_filter'…
  name: string; category: Category; kind: 'replace' | 'inspect';
  intervalMiles?: number; intervalMonths?: number;
  severeMiles?: number; severeMonths?: number;
  firstDueMiles?: number; // e.g. coolant first change differs
  enabled: boolean; isCustom: boolean; notes?: string; sortOrder: number;
}

interface ServiceRecord { // one visit
  id: ID; vehicleId: ID; date: ISODate; odometer: number;
  itemKeys: string[]; // services done this visit
  totalCost?: number; itemCosts?: Record<string, number>;
  shop?: string; diy: boolean; parts?: string; notes?: string;
  attachmentIds: ID[]; createdAt: string; updatedAt: string;
}

interface Attachment { id: ID; recordId: ID; blob: Blob; mime: string; createdAt: string; }

interface Settings {
  id: 'settings'; dueSoonMiles: number; dueSoonDays: number;
  calendarAlertTime: string; calendarDaysBefore: number;
  lastBackupAt?: string; recordsSinceBackup: number; schemaVersion: number;
}

type Category = 'Oil' | 'Tires' | 'Brakes' | 'Filters' | 'Fluids' | 'Ignition' | 'Inspection' | 'Repairs' | 'Other';
```

Dexie indexes: `records: id, vehicleId, date, odometer, *itemKeys`; `odometer: id, vehicleId, date`; `items: id, vehicleId, key`.

### The due engine (core logic, `engine/due.ts`)

All functions are pure: data in, results out, with `today` passed in for testability.

1. **Current mileage estimate.** Take odometer readings from the last 180 days (service odometers count too). Fit average miles per day by linear regression; fall back to the overall average, then to 33 mi/day (about 12,000 per year) if there is under 2 readings. Estimate = last reading + rate × days since. Never estimate below the last reading. Mark estimate as low confidence if the last reading is older than 30 days.
2. **Last done.** For each enabled item, find the most recent record (by date, then odometer) whose `itemKeys` contains it. If none, use the onboarding baseline.
3. **Intervals.** Use severe intervals when driving style is severe and the item has them.
4. **Next due.** `dueMiles = lastMiles + intervalMiles`; `dueDate = lastDate + intervalMonths` (calendar months). Either may be missing.
5. **Remaining.** `milesLeft = dueMiles − estMiles`; `daysLeft = dueDate − today`. Convert miles to days with the rate: `daysByMiles = milesLeft ÷ rate`. Projected date = earlier of the two.
6. **Status.** Overdue if `milesLeft ≤ 0` or `daysLeft ≤ 0`. Due soon if `milesLeft ≤ dueSoonMiles` or `daysLeft ≤ dueSoonDays`. Otherwise OK. Inspect items never go red; they show grey "Check".
7. **Progress.** `max(milesUsed ÷ intervalMiles, daysUsed ÷ intervalDays)`, clamped 0 to 1.2 for the bars.
8. **Health score.** 100 − 10 per due-soon − 25 per overdue, floor 0.

Output type per item: `{ key, name, status, dueMiles, dueDate, milesLeft, daysLeft, projectedDate, progress, drivenBy: 'miles' | 'time', lastDone }`.

### Default schedule: CX-5 2.5 Turbo (seed data, all editable)

These are starting defaults. Mazda's own figure is confirmed for spark plugs; the others are typical Mazda US intervals and must be checked against the maintenance booklet for my model year before trusting them. The app shows a one-time "Review your schedule" prompt after onboarding.

| Item | Kind | Normal | Severe | Notes |
| --- | --- | --- | --- | --- |
| Engine oil and filter | Replace | 7,500 mi / 12 mo | 5,000 mi / 6 mo | Many turbo owners choose 5,000 mi; the car's oil monitor may prompt sooner |
| Tire rotation | Replace | 7,500 mi / 12 mo | 5,000 mi / 6 mo | Log tread depth in notes |
| Cabin air filter | Replace | 30,000 mi / 24 mo | 15,000 mi / 12 mo | Easy DIY behind glovebox |
| Engine air filter | Replace | 30,000 mi | 15,000 mi | Inspect at each oil change |
| Spark plugs (2.5T) | Replace | 40,000 mi | 40,000 mi | Turbo-specific; non-turbo is 75,000 mi |
| Brake fluid | Replace | 36 mo | 24 mo | Verify |
| Engine coolant | Replace | First 120,000 mi / 120 mo | Same | Verify for model year |
| Brakes (pads, rotors, lines) | Inspect | 15,000 mi / 12 mo | 7,500 mi / 6 mo | Log pad thickness |
| Drive belts | Inspect | 30,000 mi | 15,000 mi |  |
| Battery and terminals | Inspect | 12 mo | 6 mo | Track battery install date |
| Wiper blades | Replace | 12 mo | 6 mo |  |
| Tire replacement | Inspect | Tread check every 7,500 mi | Same | Replace at 4/32 in |

Spark plug interval from [Mazda USA 2025 CX-5 scheduled maintenance](https://www.mazdausa.com/static/manuals/2025/cx-5/contents/07020201.html); cabin and engine air filter mileage from [Sport Mazda North's CX-5 schedule summary](https://www.sportmazdanorthorlando.com/blog/mazda-cx-5-maintenance-schedule/).

### Data out: backup, import and calendar

- **Export:** `{ app: 'torque', schemaVersion, exportedAt, vehicles, items, records, odometer, settings, attachments: [{ id, mime, base64 }] }`. Shared via `navigator.share({ files })`, falling back to a download link.
- **Import:** validate with a schema (Zod), refuse unknown `app` or newer `schemaVersion`, migrate older versions, show counts, then Replace all or Merge (merge by `id`, newest `updatedAt` wins).
- **Calendar (.ics):** one VEVENT per due item with `UID: torque-<itemKey>@local` so re-imports update instead of duplicating. All-day on the projected date, VALARM at the chosen days before. Title like "CX-5: Oil change due (≈ 52,500 mi)".
- **CSV export** of service history for spreadsheets.

### Cloud sync: private GitHub data repo

Data is synced automatically to a **private** GitHub repo I own, so deleting the app or losing the phone loses nothing. The phone talks to the GitHub REST API directly; there is still no server.

**Two repos**

| Repo | Visibility | Holds |
| --- | --- | --- |
| `torque` | Public | App code, served by GitHub Pages |
| `torque-data` | Private | My data only, written by the app |

**One-time setup**

1. Create the private repo `torque-data` (with a README so it has a `main` branch).
2. Create a fine-grained personal access token with access to `torque-data` only and one permission: Contents, read and write. Set an expiry, e.g. 1 year.
3. Save the token in my password manager; I need it to restore on a new phone.
4. In the app: Settings → Cloud sync → owner, repo, token → Test connection → Sync now.

**Data repo layout**

```text
torque-data/
  torque/data.json              # vehicles, items, records, odometer, settings
  torque/attachments/<id>.jpg   # receipt photos, uploaded once each
```

**How sync works**

- Every entity gets `updatedAt`, and deletes set `deletedAt` (a tombstone) instead of removing the row, so deletions sync too.
- After any change, wait 5 seconds (debounce), then: GET `data.json` and its `sha` → merge remote and local by `id`, newest `updatedAt` wins → PUT the merged file with that `sha`. If GitHub rejects it because the file changed (409), refetch and retry up to 3 times.
- Pull and merge on app launch and whenever the app returns to the foreground.
- Each sync is one commit ("Sync from iPhone · 2026-10-26 14:02"), so git history doubles as version history: any earlier state can be recovered from a past commit.
- Photos upload as separate files only when new; on restore they download lazily when first viewed.
- Offline changes queue in IndexedDB and push when the `online` event fires or on next launch.
- Reads use the `application/vnd.github.raw+json` Accept header so files over 1 MB still load.
- Status in Settings and a small dot on the Dashboard: "Synced 2 min ago", "3 changes pending", or "Sync failed: token expired" (401) with a Fix button.

**Restore on a new or reset phone**

Install from Safari → welcome screen → "Restore from GitHub" → paste owner, repo, token → the app downloads `data.json`, skips onboarding, and opens the Dashboard with everything back.

**Security rules**

- The token lives only in IndexedDB on the phone. It is never written to either repo, never included in JSON exports, and never logged.
- The token can reach only `torque-data`, so a leak cannot touch my other repos.
- All sync code sits in `src/sync/` behind a `SyncProvider` interface (`test()`, `pull()`, `push()`), so another backend could replace GitHub later without touching the UI.
- Unit tests mock `fetch` to cover merge, tombstones, 409 retry, 401 handling and offline queueing.

### Future-proofing for the app suite

- `vehicleId` on every record so a second car or the fuel log can slot in.
- A shared `core/` folder (db helpers, date utils, tokens, components) that the pantry tracker and document vault can reuse.
- The same sync layer can back the pantry tracker and document vault later, each in its own folder of \`torque-data\`.

## Repo, deployment and build phases

Build in five phases; each ends with passing tests and a working deploy, so there is always a usable app on my phone.

### Repo structure

```text
torque/
  .github/workflows/deploy.yml   # build + test + publish to Pages
  public/icons/                  # 180, 192, 512, maskable
  src/
    core/                        # reusable across the app suite
      db.ts  dates.ts  format.ts  ids.ts
      components/  BottomSheet, NumberInput, StatusChip, Toast, Fab, TabBar
      styles/  tokens.css  base.css
    features/
      dashboard/  schedule/  history/  costs/  settings/  onboarding/
    engine/
      due.ts  mileage.ts  health.ts  ics.ts  backup.ts
    data/
      repo.ts  schema.ts (Dexie + Zod)  seed-cx5-turbo.ts  migrations.ts
    app.tsx  router.ts  main.tsx
  tests/  engine/*.test.ts  data/*.test.ts  e2e/*.spec.ts
  index.html  vite.config.ts  README.md
```

### Deployment

- Vite `base` set to `/<repo-name>/` for GitHub Pages.
- GitHub Actions workflow: on push to `main` → `npm ci` → `npm test` → `npm run build` → upload `dist` with `actions/upload-pages-artifact` → `actions/deploy-pages`. Failing tests block the deploy.
- Repo Settings → Pages → Source: GitHub Actions.
- Install on iPhone: open the Pages URL in Safari → Share → Add to Home Screen.
- Note: on the free GitHub plan the Pages site is public, but it contains only code, never my data.

### Build phases

1. **Foundation:** Vite + Preact + TS scaffold, tokens.css, tab bar, hash router, PWA manifest and service worker, deploy workflow live. Done when the empty app installs to the home screen and opens offline.
2. **Data and engine:** Dexie schema, repo, CX-5 Turbo seed, due engine, mileage estimate, health score. Done when unit tests cover every rule below.
3. **Core screens:** onboarding, Dashboard, Log service sheet, odometer sheet, Schedule with item detail. Done when I can onboard, log an oil change and see it go green.
4. **History, costs, backup:** History search and filters, edit/delete with undo, Costs screen with SVG charts, JSON export/import, CSV export, receipt photos, GitHub cloud sync and restore.
5. **Reminders and polish:** .ics export, app badge, backup nudges, update-available toast, empty states, reduced motion, accessibility pass.

### Acceptance tests (must pass)

- [ ] Oil changed at 45,000 mi on 2026-01-10 with a 7,500 mi / 12 mo rule → due at 52,500 mi or 2027-01-10, whichever is first.
- [ ] Driving 50 mi/day, 600 mi left → projected about 12 days out and status Due soon (under 30 days / 500 mi thresholds trigger on days here).
- [ ] Switching to Severe shortens oil to 5,000 mi / 6 mo and recalculates instantly.
- [ ] Logging one visit with Oil + Rotation + Cabin filter resets all three.
- [ ] Deleting the latest oil record falls back to the previous one.
- [ ] Odometer lower than last reading shows a warning and is not saved silently.
- [ ] Estimate never drops below the last real reading.
- [ ] Export → reset all data → import restores identical counts and photos.
- [ ] .ics re-export keeps the same UIDs.
- [ ] App opens and can add a record in airplane mode after install.
- [ ] Lighthouse PWA installable check passes; no input zooms on focus on iPhone.

* [ ] Delete the app, reinstall, Restore from GitHub → all records, odometer history and photos return.
* [ ] Changes made offline sync automatically once back online.
* [ ] A deleted record stays deleted after a pull from GitHub.
* [ ] The token never appears in `torque-data`, exports or console logs.

## Prompt for Claude Code

Save this whole doc as `SPEC.md` in an empty repo, then paste the prompt below.

```text
Read SPEC.md fully before writing any code. It is the source of truth for
a single-user, offline-first PWA called Torque that tracks maintenance for
my Mazda CX-5 Signature 2.5 Turbo, hosted on GitHub Pages and installed on
my iPhone from Safari.

Work in the five phases from the spec, one phase at a time:
- Start each phase by listing the files you will create or change.
- Write unit tests (Vitest) for every engine function before the UI uses it,
  including every acceptance test in the spec.
- Keep all business logic in src/engine as pure functions with `today`
  passed in. Components never call Dexie directly; use src/data/repo.ts.
- Use TypeScript strict mode. No `any`.
- Put every colour, radius, spacing and font in src/core/styles/tokens.css.
- Follow the iPhone PWA checklist exactly (safe areas, 16px inputs, 100dvh,
  apple-touch-icon, standalone detection, update toast).
- After each phase: run tests, run the build, commit with a clear message,
  and tell me what to check on my phone.
- If the spec is ambiguous, pick the simplest option that keeps data safe
  and note it in DECISIONS.md.

Start with Phase 1 now. Also set up the GitHub Actions deploy workflow and
tell me the exact repo settings to change.
```
