# Gen Z Events — Architecture & File Map

Tech stack: **React 19** + **TypeScript 7** (`noEmit: true`) + **Vite 8** + **Tailwind CSS v4** + **Firebase v13** (Auth + Firestore) + `lucide-react` + `qrcode` + `jsqr` + `recharts` + `xlsx` + `oxlint`.

For exact per-export line numbers (`Symbol:L123`), read [symbol-index.md](./symbol-index.md) first.

---

## Top-Level Configuration & Automation

| File | Role |
| :--- | :--- |
| `AGENTS.md` | Always-on `< 2 KB` Turn-0 workspace instructions & invariants. |
| `package.json` | Dependencies & scripts (`dev`, `build`, `lint`, `lint:all`, `verify`, `verify:quick`, `gen:index`, `smoke:browser`). |
| `tsconfig.json` | ES2022 + DOM, `allowJs: true`, `allowImportingTsExtensions: true`, `noEmit: true`, `exclude: ["dist"]`. No `include` array! |
| `eslint.config.mjs` | ESLint flat config running `@firebase/eslint-plugin-security-rules` on `firestore.rules`. |
| `.oxlintrc.json` | Fast Rust Oxlint config (`< 150ms`) linting TypeScript + React Hooks across `src/`. |
| `vite.config.ts` | Legacy browser support (`@vitejs/plugin-legacy`), Tailwind v4 CSS downgrade (`legacyCssCompatPlugin`), `copy-unbundled-src-assets`. |
| `firebase-applet-config.json` | Client Firebase config pinned to project `gen-z-events` and database `ai-studio-ebd015a5-12b5-456c-b8c3-447ca302527f`. |
| `firebase.json` | Firestore CLI config pointing `rules` to `firestore.rules` and `database` to `ai-studio-ebd015a5-12b5-456c-b8c3-447ca302527f`. |
| `firestore.rules` | Authoritative 9-collection security rules & field allowlists (626 lines). |
| `.agents/hooks.json` | Antigravity lifecycle hooks (`PreToolUse` file hygiene guard + `Stop` unverified-edits verification gate). |
| `.github/workflows/ci.yml` | 3-job CI gate: `verify` (`tsc` + ESLint + Oxlint + 115+ tests + Vite build), `firestore-rules-emulator`, and `browser-smoke`. |
| `scripts/smoke-browser.mjs` | Playwright smoke test verifying Desktop EN, Mobile 375px EN, and Mobile 375px AR RTL (`dir="rtl"`, 0 page errors, 0 overflow). |
| `tests/firestore.emulator.test.ts` | Live `@firebase/rules-unit-testing` Firestore Emulator suite (runs in CI where Java 21 is pre-installed). |

---

## Core Modules & Domain Splits

### Bilingual i18n (`src/i18n/`)
- `translations.ts`: Thin 16-line barrel re-exporting everything below (zero breaking imports).
- `en.ts` / `ar.ts`: Full 1:1 matched English and Arabic UI dictionaries.
- `messages.ts`: `EN_TO_AR_MESSAGES`, `formatPromoTiersSummary`, `localizeKnownMessage`.
- `catalogCopy.ts`: `TIER_COPY`, `PAYMENT_COPY`, `TICKET_ENTRY_TERMS`, `AUDIT_ACTION_LABELS`, `SWATCH_NAME_AR`, currency/label helpers.
- `LanguageContext.tsx`: React context syncing `<html dir lang>` and `localStorage`.

### Pure Business Logic (`src/utils/`)
- `bookingLogic.ts`: Thin 8-line barrel re-exporting all 7 focused modules under `src/utils/booking/`:
  - `booking/pricing.ts`: tier pricing, custom tier hex colors, promo scopes & evaluation, order totals.
  - `booking/validation.ts`: safe URLs, Arabic digit normalization, Egyptian mobile/email/name/password/signup/profile/booking/waitlist/payment-config validation.
  - `booking/rbacAndTickets.ts`: `emailToDocId`, `sanitizeId`, `generateBookingCode`, multi-ticket `checkedInCount` helpers, undo-payment patch, KPIs, two-tier `getStaffPermissions`, session TTL, `sortByCreatedAtDesc`, `sortByUpdatedAtDesc`.
  - `booking/exports.ts`: spreadsheet formula neutralization, CSV & RFC ICS builders.
  - `booking/schedule.ts`: countdown, concert filter/sort, poster dimensions, concert edit validation, live concert detail resolution.
  - `booking/offlineParser.ts`: offline Excel/CSV row parser (`parseOfflineTicketRows`).
  - `booking/firebaseErrors.ts`: JSON-unwrapping `formatFriendlyFirebaseError` (strips `authInfo` UID/email).
- `gateScanLogic.ts`, `ticketDesign.ts`, `passExport.ts`, `googleFormsMapper.ts`, `excelOffline.ts`, `shareConcert.ts`, `auditLog.ts`, `staffQuickSearch.ts`.

### Services (`src/services/`)
- `firestoreService.ts`: Thin 4-line barrel re-exporting:
  - `firestore/auditHelper.ts`: `resolveActor`, non-fatal `recordAuditLog`.
  - `firestore/bookingsRepo.ts`: fan bookings, payment confirm/undo, atomic multi-ticket check-in/decrement, offline single & bulk import.
  - `firestore/concertsRepo.ts`: concerts, waitlist, promos, paymentConfig.
  - `firestore/staffRepo.ts`: user profiles, admins directory, adminSessions.
- `googleFormsService.ts`: In-memory OAuth token & Google Forms API client.

### Automated Guard & Unit Test Suites
- `firestore.rules.test.ts` + `tests/firestore.emulator.test.ts`: Static + live emulator Firestore security verification.
- `src/utils/codebaseInvariants.test.ts`: Enforces Gate Staff RBAC financial gating, z-index layering, Arabic error coverage, strict RTL logical Tailwind classes, zero XSS/`as any` sinks, and DB pin parity.
- `src/utils/bookingLogic.test.ts`, `gateScanLogic.test.ts`, `ticketDesign.test.ts`, `googleFormsMapper.test.ts`, `shareConcert.test.ts`, `auditLog.test.ts`, `staffQuickSearch.test.ts`, `browserCompat.test.ts`, `src/i18n/translations.test.ts`.

---

## UI Components (`src/components/`)

### Storefront & Fan Modals
- `Header.tsx`, `HeroSection.tsx`, `ConcertCard.tsx`, `PassTiersSection.tsx`, `BookingModal.tsx`, `TicketsModal.tsx`, `TicketVisualCard.tsx`, `AuthProfileModal.tsx`, `BrandLogo.tsx`, `ErrorBoundary.tsx`.

### Staff Command Center (`src/components/admin/`) — Lazy-Loaded
- `AdminWorkspace.tsx`: RBAC tab shell, KPIs, and `Ctrl+K` global search trigger.
- `AdminQuickSearchModal.tsx`: Global `Ctrl+K` RBAC-scoped search across bookings, concerts, promos, waitlist with inline actions.
- `AdminDashboard.tsx`: Revenue/ticket charts (Super Admin) & `updatedAt`-sorted Recent Approvals log.
- `AdminCheckin.tsx` + `AdminCheckinVerdictCard.tsx` + `AdminCheckinRoster.tsx`: Live camera/photo QR verification (`startCamera` stays inside `AdminCheckin.tsx`), high-contrast verdict banner, and attendee roster.
- `AdminOfflineTickets.tsx` + `OfflineExcelPreviewPanel.tsx` + `OfflineManualSaleForm.tsx` + `OfflineSalesLedger.tsx` + `GoogleFormSyncPanel.tsx`: Box-office offline sales, Excel import/export (financials stripped for Gate Staff), and Google Form sync.
- `AdminSchedule.tsx`, `AdminManage.tsx`, `TierColorEditor.tsx`, `AdminContentPromos.tsx`, `AdminTeam.tsx`, `AdminAuditLog.tsx`.
