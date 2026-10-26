# Decisions

Where the spec was ambiguous, the simplest option that keeps data safe was chosen.

## Phase 1

- **Router:** a ~20-line hash router in `src/router.ts` instead of a library; routes are a closed union type.
- **Vite `base`:** read from the `BASE_PATH` env var (set by the workflow from the repo name), defaulting to `/` locally, so renaming the repo needs no code change.
- **Service worker update:** `registerType: 'prompt'` so the user taps to refresh instead of the app reloading mid-entry.
- **Icons:** generated from inline SVG by `scripts/generate-icons.mjs` and committed, so CI does not need a browser.
- **FAB and bottom sheet:** deferred to Phase 3, when there are forms to open. Phase 1 ships only the tab bar, update toast and install hint.
- **Pinned toolchain:** versions are whatever `npm install` resolved; `package-lock.json` is committed.

## Phase 2

- **Sync fields on every entity:** `updatedAt` everywhere and optional `deletedAt` (tombstone) on vehicles, items, records, readings and attachments, added now so Phase 4 sync needs no schema change. `Settings` has `updatedAt` only.
- **Interfaces vs Zod:** types are hand-written in `data/types.ts` (as in the spec); `data/schema.ts` holds the Dexie class and Zod schemas typed `z.ZodType<T>` so the two cannot drift.
- **Baselines live on the item** (`ServiceItem.baseline`), not as fake service records. Onboarding choices map to: date + mileage → `source: 'entered'`; "Never, car is new" → `source: 'purchase'`; "Not sure" → no baseline (due now, amber, `unknownBaseline`). `firstDueMiles` (coolant at 120,000 mi) applies only to a `'purchase'` baseline.
- **Service odometers are not copied into the readings table.** `computeDue` merges each record's odometer into the mileage points itself, so editing or deleting a record updates the estimate with no extra bookkeeping. `OdometerReading.source: 'service'` is kept in the type for compatibility but unused.
- **"Due soon" uses days as well as miles.** Spec rule 6 says `milesLeft <= dueSoonMiles` or `daysLeft <= dueSoonDays`, but acceptance test 2 (600 mi at 50 mi/day is Due soon) needs miles converted to days at the current pace. The engine uses `min(daysLeft, milesLeft / rate)` against the day threshold. At the default 33 mi/day this means about 990 mi.
- **Per-field severe fallback:** a severe interval applies only to the field that defines one (e.g. engine air filter has severe miles but no months, so months stays unset).
- **Items with only one axis** (brake fluid months-only, belts miles-only) track that axis alone.
- **Inspect items** always report status `inspect` but still carry miles/days left, so the UI can show "Check" with a date. They do not affect the health score.
- **Pace calculation:** correction readings are excluded from the regression (they fix typos, not driving). If the regression slope is zero or negative, the overall average is used, then 33 mi/day. Readings dated after `today` are ignored.
- **Odometer check:** compares against the latest reading or record on or before the new entry's date, so back-dating a consistent entry is allowed. `repo.addReading` and `repo.addRecord` throw `OdometerRegressionError` unless `allowCorrection` is set; the UI maps that to the "Fix / Save anyway" warning.
- **Single vehicle:** `getVehicle()` returns the first non-deleted vehicle; the schema still carries `vehicleId` everywhere for later.

## Phase 3

- **State:** one Dexie `liveQuery` loads the raw vehicle, items, records, readings and settings; the due engine runs on each render with today's date, so statuses stay correct across midnight without a refresh. Screens read it through `useAppData()` and open sheets through `useUi()`.
- **"Add note"** (FAB menu) opens the log sheet in note mode: a service record with no `itemKeys` and the note text.
- **Onboarding:** the cloud-sync step and "Restore from GitHub" are shown as coming soon until Phase 4. "Never, car is new" asks for purchase date and odometer once, on the same step, defaulting to today and the current reading. When the purchase date is in the past, a purchase reading is also stored so the pace estimate has two points.
- **"Review your schedule" prompt:** persisted as `Settings.scheduleReviewed`, not in localStorage, so it syncs and survives a reinstall.
- **Schedule editing:** done in the item sheet (intervals, severe intervals, track on/off) plus "Add custom item", whose clock starts today at the estimated odometer. Disabled items stay listed under "Disabled" so they can be re-enabled.
- **Odometer warning:** `OdometerRegressionError` from the repo drives the "Fix / Save anyway (correction)" prompt in both the odometer and log sheets. Nothing is written until the user confirms.
- **Settings** has only driving style and due-soon thresholds for now; backup, sync and calendar settings arrive in later phases.
- **Dashboard quick actions** omit "Export to Calendar" until Phase 5.
- **Browser smoke test:** `tests/e2e/smoke.mjs` drives onboarding, logging an oil change, the odometer warning, reload persistence and the 16 px input rule. It uses the preinstalled Playwright and is run by hand, not in CI.

## Phase 4a

- **Backup file** is `{ app, schemaVersion, exportedAt, vehicles, items, records, odometer, settings, attachments }`. It includes tombstoned rows so a restore or merge keeps deletions; counts shown to the user cover live rows only. Attachments carry their full metadata plus `base64`. Nothing secret can be in it: there is no token or sync config in the database yet, and Phase 4b keeps those out of the export tables.
- **Import** refuses other apps, newer schema versions and files that fail Zod validation, with a plain-language reason. Merge is by id, newest `updatedAt` wins, ties keep the local row (the same function sync will use).
- **Restore from the welcome screen:** after "Reset all data" the app returns to onboarding, so the welcome screen also offers "Restore from backup file". The same file picker is in Settings.
- **Backup nudge:** the dashboard banner appears after 30 days or 5 new records since the last export (counted from when the car was added if you never exported). `lastBackupAt` is only set when the share sheet completes or the download starts, not when you cancel. Cloud sync (4b) will replace this nudge with the 24-hour sync-failure banner.
- **iOS share sheet:** `navigator.share` needs a user gesture. Export reads the database first, then shares; if iOS rejects the late call the code falls back to a download link. Worth checking on the phone.
- **Editing a record** skips the lower-odometer check, since the record may legitimately be corrected to an earlier value. Adding records and readings still checks.
- **Cost per mile** uses lifetime spend over the span between the lowest and highest odometer values seen (readings, records, purchase odometer), not the extrapolated estimate, so the number does not drift day to day. Correction readings are ignored.
- **Cost categories:** Ignition and Inspection services roll into "Other"; a visit's cost is split by per-item costs when present, otherwise evenly across its services. Per-item cost entry is not in the log form yet (the data model supports it).
- **Charts** use the validated categorical slots in fixed order as `--series-*` tokens (light and dark steps). The category legend carries every value and percentage, and the monthly chart has a "View as table" fallback, so colour is never the only signal. Tapping a month shows its exact value above the chart.
- **Receipt photos** are resized to 1600 px and re-encoded as JPEG 0.7 before storing; removed photos are tombstoned like everything else.
- **Storage:** `navigator.storage.persist()` is requested on launch and the result is shown in Settings > About.
- **Settings** gained Backup, About and Danger zone (type RESET). Calendar and notification settings arrive in Phase 5, sync in 4b.
