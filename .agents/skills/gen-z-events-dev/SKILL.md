---
name: gen-z-events-dev
description: >-
  Codebase map, architecture invariants, change-impact checklists, and verification
  runbook for the Gen Z Events web app. Activate whenever analyzing, debugging,
  refactoring, or adding features, Firestore rules, bilingual copy, admin tools,
  ticket/QR logic, or build/deploy configuration in the gen-z-events repository.
---

# Gen Z Events — Engineering & Safe-Update Skill

Use this skill to locate code fast, preserve every security/i18n/browser-compat
invariant, and verify edits cleanly in one pass.

## 1. Change-Impact Matrix (Read Before Editing)

Check which files must move together for the area you are changing:

| Area | Primary Files | Coupled Files / Tests to Update & Check |
| :--- | :--- | :--- |
| **Schema / Data Model** | `src/types.ts`, `src/services/firestoreService.ts` | `firestore.rules` (`hasAll`/`hasOnly` allowlists!), `firestore.rules.test.ts`, deploy rules to Firebase |
| **Pricing / Promos / Validation** | `src/utils/bookingLogic.ts`, `src/components/BookingModal.tsx` | `firestore.rules` (`isValidFanPricing`, `isValidPromoDiscount`), `src/utils/bookingLogic.test.ts` |
| **Staff RBAC / Admin Portal** | `src/utils/bookingLogic.ts` (`getStaffPermissions`), `src/components/admin/AdminWorkspace.tsx` | `firestore.rules` (`isSuperAdmin`, `isGateStaff`), `src/App.tsx` (listeners), `firestore.rules.test.ts` |
| **Gate QR Check-In / Camera** | `src/utils/gateScanLogic.ts`, `src/components/admin/AdminCheckin.tsx`, `src/services/firestoreService.ts` | `src/utils/gateScanLogic.test.ts`, `firestore.rules` (`checkedInCount`), `vercel.json` (`camera=(self)`) |
| **Ticket Art / QR Export / WhatsApp** | `src/utils/ticketDesign.ts`, `src/utils/passExport.ts`, `src/components/TicketVisualCard.tsx`, `src/components/TicketsModal.tsx` | `src/utils/ticketDesign.test.ts`, `src/data/defaults.ts`, `src/i18n/translations.ts` |
| **Offline Excel / Google Forms** | `src/utils/excelOffline.ts`, `src/utils/googleFormsMapper.ts`, `src/services/googleFormsService.ts`, `src/components/admin/AdminOfflineTickets.tsx`, `src/components/admin/GoogleFormSyncPanel.tsx` | `src/utils/bookingLogic.ts` (`parseOfflineTicketRows`), `src/utils/googleFormsMapper.test.ts`, `firestore.rules` (`offline-sale` / `offline_box_office`) |
| **Concerts / Tier Colors / Capacity** | `src/components/admin/AdminSchedule.tsx`, `src/components/admin/AdminManage.tsx`, `src/components/admin/TierColorEditor.tsx` | `src/utils/bookingLogic.ts` (`validateAndBuildConcertEditPayload`, `computeAdjustedSeatsLeft`), `firestore.rules` (`isValidConcert`, `isValidTierColors`) |
| **Payment Numbers (InstaPay / Wallets)** | `src/data/defaults.ts`, `src/services/firestoreService.ts`, `src/components/BookingModal.tsx` | `src/i18n/translations.ts` (`PAYMENT_COPY`, `buildFooterSubtitle`), `src/i18n/translations.test.ts`, `firestore.rules` (`paymentConfig`) |
| **Copy / Bilingual EN & AR / RTL** | `src/i18n/translations.ts`, `src/i18n/LanguageContext.tsx`, `src/index.css` | Both `translations.en` and `translations.ar` must match 1:1; `src/i18n/translations.test.ts`; use logical Tailwind classes (`ps-`, `pe-`, `ms-`, `me-`, `start-`, `end-`) |
| **Auth / Email Verification** | `src/firebase.ts`, `src/components/AuthProfileModal.tsx`, `src/App.tsx` | `src/utils/bookingLogic.ts` (`isVerifiedFanAccount`, `validateSignupInput`), `src/utils/browserCompat.test.ts` |
| **Legacy Browser / Build / Hosting** | `vite.config.ts`, `index.html`, `src/index.css`, `vercel.json`, `src/firebase.ts` | `src/utils/browserCompat.test.ts` |

## 2. Deep Reference Files (Load On Demand)

- Module & export inventory: [architecture-map.md](./references/architecture-map.md)
- Firestore schema, RBAC & security rules: [firestore-and-rbac.md](./references/firestore-and-rbac.md)
- Browser compatibility, i18n/RTL & ticket pass geometry: [browser-compat-and-i18n.md](./references/browser-compat-and-i18n.md)

## 3. Non-Negotiable Invariants

1. **Firebase Project & Named Database**: Always stay pinned to project `gen-z-events` and database `ai-studio-ebd015a5-12b5-456c-b8c3-447ca302527f` (`firebase-applet-config.json`, `firebase.json`, `src/firebase.ts`). Never add hardcoded concert/promo seed fallbacks or restore `testConnection` probes (`bookingLogic.test.ts` and `browserCompat.test.ts` fail if present).
2. **Strict Anti-Update-Gap Parity**: Every collection in `firestore.rules` uses `.keys().hasAll(...)` + `.keys().hasOnly(...)` + `request.time` timestamps. Adding/renaming any field in `src/types.ts` or `firestoreService.ts` **will cause `PERMISSION_DENIED`** unless `firestore.rules` is updated and deployed.
3. **Auth & RBAC Separation**: No anonymous auth or phone-auth bypasses. Call `ensureFreshVerifiedToken(user)` before writes after verification. Never elevate `Gate Staff` to confirm payments, delete bookings, edit concerts/promos/paymentConfig, or list PII collections.
4. **Security & Export Hygiene**: Keep Google Forms OAuth tokens strictly in memory (`googleFormsService.ts`). Neutralize spreadsheet formula injection via `escapeCsvCell` / `sanitizeSpreadsheetCell`. Reject `svg` data URLs on concert posters (`isSafeImageUrl` / `isValidPosterUrl`).
5. **Payment & Receipt Numbers**: Default transfer number is `+201040206700` (live overrides come from `/paymentConfig/default`); WhatsApp receipt number is `201016131000` (`+201016131000`). `translations.test.ts` explicitly asserts legacy numbers never reappear.
6. **Repository & Tooling Traps (Windows)**:
   - `tsconfig.json` has `"allowJs": true` and excludes only `["dist"]` (no `include`): **never leave stray `.ts`/`.js` scratch files** anywhere inside the repo (including `.agents/`).
   - Default shell is **Windows PowerShell 5.1**: `&&` fails with a parser error, and `npm run clean` uses `rm -rf`. Chain commands with `; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }` or run `verify.ps1`.
   - `git` is not on default `PATH`; locate GitHub Desktop's `git.exe` dynamically (`$env:LOCALAPPDATA\GitHubDesktop\app-*\resources\app\git\cmd\git.exe`) when running Git commands. `.git/config` uses `credential.helper = wincred`.

## 4. Standard Edit & Verification Workflow

1. **Locate first**: Inspect the relevant row in the Change-Impact Matrix and read only the targeted lines/functions needed.
2. **Keep logic pure & tested**: Put new validation, pricing, parsing, or state-transition logic in `src/utils/` (pure TypeScript) and add `node:test` cases to the matching `*.test.ts` file rather than burying business rules in `.tsx` event handlers.
3. **Preserve i18n parity**: Update both `translations.en` and `translations.ar` in `src/i18n/translations.ts`, normalize Arabic/Persian digits via `toAsciiDigits()`, and use `localizeKnownMessage()` for surfaced error/validation strings.
4. **Verify in one command** after your final edit using [scripts/verify.ps1](./scripts/verify.ps1):
   ```powershell
   powershell -ExecutionPolicy Bypass -File .agents/skills/gen-z-events-dev/scripts/verify.ps1 -Build -Git
   ```
   This runs `tsc --noEmit`, `eslint firestore.rules`, all `*.test.ts` suites via `tsx --test`, `vite build` (checking `dist/index.html` and `dist/_redirects`), and `git status -sb`.
5. **Deploy checklist**:
   - **Frontend changes**: Commit and push to `origin/main` (Vercel auto-deploys from `main` using `vercel.json`).
   - **If `firestore.rules` changed**: Deploy rules explicitly alongside the frontend push:
     ```powershell
     npx firebase-tools@latest deploy --only firestore:rules --project gen-z-events
     ```
