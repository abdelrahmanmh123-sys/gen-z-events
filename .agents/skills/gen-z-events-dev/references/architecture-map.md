# Gen Z Events — Architecture & File Map

Tech stack: **React 19** + **TypeScript 7** (`noEmit: true`) + **Vite 8** + **Tailwind CSS v4** + **Firebase v13** (Auth + Firestore) + `lucide-react` + `qrcode` + `jsqr` + `recharts` + `xlsx`.

Path alias `@/*` maps to the **repository root** (`tsconfig.json`, `vite.config.ts`).

---

## Top-Level Configuration

| File | Role |
| :--- | :--- |
| `package.json` | Dependencies and scripts (`dev`, `build`, `lint` -> `tsc --noEmit`). Note: `clean` uses `rm -rf dist` (POSIX). |
| `tsconfig.json` | ES2022 + DOM, `allowJs: true`, `allowImportingTsExtensions: true`, `noEmit: true`, `exclude: ["dist"]`. No `include` array! |
| `vite.config.ts` | Legacy browser support (`@vitejs/plugin-legacy`), Tailwind v4 CSS downgrade (`legacyCssCompatPlugin`), `copy-unbundled-src-assets` plugin, `DISABLE_HMR` toggle. |
| `eslint.config.mjs` | ESLint flat config running `@firebase/eslint-plugin-security-rules` (ignores `dist`, `node_modules`, `public`). |
| `firebase-applet-config.json` | Client Firebase config pinned to project `gen-z-events` and database `ai-studio-ebd015a5-12b5-456c-b8c3-447ca302527f`. |
| `firebase.json` | Firestore CLI config pointing `rules` to `firestore.rules` and `databaseId` to `ai-studio-ebd015a5-12b5-456c-b8c3-447ca302527f`. |
| `firestore.rules` | Authoritative 8-collection security rules & field allowlists (575 lines). |
| `security_spec.md` | Security invariants and "Dirty Dozen" adversarial test payload specification. |
| `vercel.json` | SPA fallback rewrite (`/(.*) -> /index.html`), COOP `same-origin-allow-popups`, `Permissions-Policy: camera=(self)`, no-cache HTML, immutable `/assets/*` with CORS. |
| `index.html` | Dark boot shell (`#gz-boot-shell`), non-blocking Google Fonts, ES5 polyfills, `<noscript>` fallback. |

---

## Application Entry & Core Modules

| File | Key Exports / Responsibilities |
| :--- | :--- |
| `src/main.tsx` | Sets `window.__GENZ_BOOTED__ = true`, mounts `<ErrorBoundary><LanguageProvider><App /></LanguageProvider></ErrorBoundary>`. |
| `src/App.tsx` | Central state & Firestore listeners: Auth observer (`onAuthStateChanged` + `ensureFreshVerifiedToken`), public `concerts` / `promos` / `paymentConfig/default` listeners, verified-fan `users/{uid}` (auto-create on first verified sign-in) & `bookings` listeners, verified-staff listeners + `adminSessions` heartbeat, `Ctrl/Cmd+Shift+A` Staff Portal shortcut, lazy-loaded `AdminWorkspace`. |
| `src/types.ts` | Domain types: `TierId`, `OnlinePaymentMethodId`, `PaymentMethodId`, `PaymentStatus`, `AdminRole`, `TierPrices`, `TierColors`, `Concert`, `Booking`, `Promo`, `UserProfile`, `WaitlistEntry`, `AdminMember`, `AdminSession`, `PaymentConfig`, `SortOption`. |
| `src/firebase.ts` | Initializes `db` (forced long polling, `useFetchStreams: false`) and `auth` (multi-tier persistence), `googleProvider`, `handleFirestoreError`, `ensureFreshVerifiedToken`, `formatFriendlyFirebaseError`. |
| `src/data/defaults.ts` | `PRIMARY_ADMIN_EMAIL` (`weentamalak@gmail.com`), `HERO_IMAGE_PATH`, `BRAND_LOGO_PATH`, `DEFAULT_TIER_COLORS`, `TIER_COLOR_SWATCHES`, `TICKET_TIERS`, `PAYMENT_PHONE_NUMBER` (`+201040206700`), `PAYMENT_WHATSAPP_NUMBER` (`201016131000`), `PAYMENT_METHODS`. |
| `src/index.css` | Tailwind v4 import, `@theme` fonts (`Bricolage Grotesque`, `DM Sans`, `Cairo`, `JetBrains Mono`), `overflow-x: hidden; overflow-x: clip;`, `:focus-visible` ring, RTL `letter-spacing: 0 !important` override. |

---

## Services (`src/services/`)

| File | Exports & Responsibilities |
| :--- | :--- |
| `src/services/firestoreService.ts` | All Firestore writes/transactions: `upsertUserProfile`, `createBooking`, `cancelPendingBooking`, `adminConfirmPayment`, `adminUndoPayment`, `adminScanCheckIn`, `adminDecrementCheckIn`, `adminToggleCheckIn`, `adminConfirmAndCheckIn`, `adminDeleteBooking`, `adminCreateOfflineBooking`, `adminBulkImportOfflineBookings`, `adminSaveConcert` (handles `deleteField()` for unset `tierColors`), `adminDeleteConcert`, `createWaitlistEntry`, `deleteWaitlistEntry`, `adminSavePromo`, `adminDeletePromo`, `adminAddMember`, `adminRemoveMember`, `checkIsEmailAdmin`, `createAdminSession`, `touchAdminSession`, `removeAdminSession`, `adminSavePaymentConfig`. |
| `src/services/googleFormsService.ts` | Client-side Google Sign-In popup (`GOOGLE_FORMS_SCOPES` read-only), in-memory OAuth access token cache (auto-cleared on sign-out / user switch), `connectGoogleFormsAccount`, `fetchGoogleFormSchema`, `fetchAllGoogleFormResponses`, `GoogleFormsApiError`. |

---

## Business Logic, Utilities & Tests (`src/utils/`, `src/i18n/`, `firestore.rules.test.ts`)

| Module | Test File | Key Responsibilities |
| :--- | :--- | :--- |
| `src/utils/bookingLogic.ts` | `src/utils/bookingLogic.test.ts` | ID/email normalization, tier pricing & color hex helpers, promo evaluation, `GZ-` code generator, countdown & date/doors display, fan & signup & profile & concert-edit & payment-config validation, `getStaffPermissions` RBAC matrix, `checkedInCount` helpers, CSV/ICS exporters, offline spreadsheet parser (`parseOfflineTicketRows`), `toAsciiDigits`, `resolveBookingConcertDetails`. |
| `src/utils/gateScanLogic.ts` | `src/utils/gateScanLogic.test.ts` | `evaluateGateQrScan`, `isGenZTicketCodeFormat`, `buildAlreadyUsedVerdict`, `buildGateScanSuccessVerdict`, `buildUnreadableQrVerdict`, `getCameraConstraintFallbacks`, `classifyCameraError`, `computeDecodedImageDimensions`. |
| `src/utils/ticketDesign.ts` | `src/utils/ticketDesign.test.ts` | `TICKET_DESIGN_CATALOG` (4 Houda x Qena artworks in `public/assets/aistudio/`), `TICKET_STUB_SLOT` normalized geometry, `computeTicketStubRects`, `buildQrDownloadFilename`, `buildTicketReceiptWhatsAppUrl`. |
| `src/utils/passExport.ts` | *(covered via `ticketDesign.test.ts`)* | `playGateTone` (Web Audio), `generateQrDataUrl`, `generateOriginalQrDataUrl`, `renderTicketPassPng` (1500x500 composite canvas), `copyTextToClipboard`, `triggerFileDownload`, `triggerDataUrlDownload`, `compressPosterImage`. |
| `src/utils/googleFormsMapper.ts` | `src/utils/googleFormsMapper.test.ts` | `DEFAULT_OFFLINE_FORM_*`, `extractGoogleFormId`, `parseGoogleFormSchemaPayload`, `autoMapFormQuestions`, `buildDeterministicFormBookingCode`, `resolveFormOutletRef`, `mapGoogleFormResponsesToBookings`. |
| `src/utils/shareConcert.ts` | `src/utils/shareConcert.test.ts` | `resolveShareUrl`, `buildConcertShareData`, `formatShareClipboardText`, `shareConcertDetails` (Web Share API with clipboard fallback). |
| `src/utils/excelOffline.ts` | — | `readSpreadsheetFile` (max 10 MB / 2,000 rows), `downloadOfflineTemplateXlsx`, `exportOfflineBookingsXlsx` (using `sanitizeSpreadsheetCell`). |
| `src/i18n/translations.ts` & `LanguageContext.tsx` | `src/i18n/translations.test.ts` | `translations.en` & `translations.ar` dictionaries, `PAYMENT_COPY`, `TICKET_ENTRY_TERMS`, `formatCurrencyEgp`, `buildPaymentMethodCopy`, `buildFooterSubtitle`, `localizeKnownMessage`, `LanguageProvider`, `useLanguage`. |
| `firestore.rules` | `firestore.rules.test.ts` | Static rule assertions covering the "Dirty Dozen", RBAC tiers, field allowlists, `checkedInCount`, `tierColors`, and `paymentConfig`. |
| Config / Browser Guards | `src/utils/browserCompat.test.ts` | Guards `vite.config.ts`, `index.html`, `src/firebase.ts`, `src/index.css`, `src/App.tsx`, `vercel.json`, `firebase-applet-config.json`, `.gitignore`. |

---

## UI Components (`src/components/`)

### Storefront & Fan Modals
- `Header.tsx`: Navigation bar, language toggle, My Tickets badge, Auth/Profile trigger, Staff Portal shortcut (visible only to verified staff).
- `HeroSection.tsx`: Featured next upcoming show (`getNextUpcomingConcert`), live countdown, active promo pills with copy-to-clipboard.
- `ConcertCard.tsx`: Concert card, save/favorite heart, Web Share button (`shareConcertDetails`), tier starting price & Book CTA.
- `PassTiersSection.tsx`: Silver / Gold / VIP / Lounge comparison cards across live concerts.
- `BookingModal.tsx`: Fan checkout (InstaPay / Mobile Wallets), promo code application, waitlist join on sold-out shows, plus inline Super Admin live payment-number editor (`adminSavePaymentConfig`).
- `TicketsModal.tsx`: Fan ticket wallet, TicketVisualCard preview, QR enlarge modal, PNG E-Pass & original QR download, `.ics` calendar download, WhatsApp receipt link, cancel pending booking.
- `TicketVisualCard.tsx`: Renders the tier artwork (`TICKET_DESIGN_CATALOG`) with overlaid QR seal positioned by `TICKET_STUB_SLOT`.
- `AuthProfileModal.tsx`: Email/Password sign-up/sign-in, Google Sign-In, email-verification polling & resend, pending signup profile (`localStorage` key `PENDING_PROFILE_STORAGE_KEY`) synced on verification, fan profile editor.
- `BrandLogo.tsx`, `ErrorBoundary.tsx`.

### Staff Command Center (`src/components/admin/`) — Lazy-Loaded
- `AdminWorkspace.tsx`: Clamps `activeTab` strictly to `permissions.allowedTabs` (`getStaffPermissions`), renders header KPIs, language switcher, and tab panels.
- `AdminDashboard.tsx`: Revenue/ticket charts (`recharts`, hidden unless `canViewRevenueAnalytics`), concert occupancy, recent approvals log (Gate Staff sees approvals log only).
- `AdminCheckin.tsx`: Live camera QR scanner (`jsqr` + `getCameraConstraintFallbacks`), PNG image upload scan (`computeDecodedImageDimensions`), manual code lookup, multi-ticket atomic `1/N..N/N` check-in/decrement, Super Admin payment confirmation & deletion.
- `AdminOfflineTickets.tsx`: Box-office offline pass issuance, Excel/CSV template download, bulk import (`parseOfflineTicketRows` + `adminBulkImportOfflineBookings`), XLSX export, and embedded `GoogleFormSyncPanel`.
- `GoogleFormSyncPanel.tsx`: Connects Google Forms OAuth, fetches form schema & responses, auto-maps fields, previews & bulk-imports new offline bookings idempotently.
- `AdminSchedule.tsx`: Creates new concerts (`adminSaveConcert`), compresses uploaded poster images (`compressPosterImage`), configures prices & `TierColorEditor`.
- `AdminManage.tsx`: Edits/deletes concerts (`validateAndBuildConcertEditPayload`, proportional `computeAdjustedSeatsLeft`), exports attendees CSV (`buildAttendeesCsv`), manages waitlist entries.
- `AdminContentPromos.tsx`: Creates/toggles/deletes promo codes (`adminSavePromo`, `adminDeletePromo`).
- `AdminTeam.tsx`: Manages `/admins` (`Super Admin` / `Gate Staff` via `emailToDocId`) and displays active `/adminSessions`.
- `TierColorEditor.tsx`: Per-concert custom `Silver`/`Gold`/`VIP`/`Lounge` hex color picker & swatch selector.
