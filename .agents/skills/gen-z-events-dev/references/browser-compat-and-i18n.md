# Cross-Browser Compatibility, i18n/RTL & Ticket Pass Geometry

Everything below is enforced by automated guard tests (`src/utils/browserCompat.test.ts`, `src/i18n/translations.test.ts`, `src/utils/ticketDesign.test.ts`).

---

## 1. Legacy Browser & Mobile WebView Compatibility

Target matrix: **Safari 12+ / iOS Safari 12+**, **Chrome 64+ / Android 64+**, **Samsung Internet 10+**, **Firefox 67+**, **Edge 79+**.

- **`vite.config.ts`**:
  - `@vitejs/plugin-legacy` (`renderLegacyChunks: true`, `modernPolyfills: true`) targeting Safari/iOS 12+, Chrome/Android 64+, Samsung 10+, Firefox 67+, Edge 79+.
  - `legacyCssCompatPlugin`: runs `@csstools/postcss-cascade-layers` (flattens Tailwind v4 `@layer` blocks for Safari < 15.4 / Chrome < 99 / Samsung < 18) followed by `lightningcss` (transpiles `oklch`, `oklab`, `color-mix`, nesting to sRGB fallbacks).
  - `build.target` & `cssTarget` pinned to `['es2018', 'chrome64', 'safari12', 'firefox67', 'edge79']`.
  - `copy-unbundled-src-assets`: copies `src/assets` to `dist/src/assets` if present.
- **`index.html`**:
  - Google Fonts `<link rel="stylesheet" ... media="print" onload="this.media='all'">` + `<noscript>` fallback so slow/blocked font CDNs never blank-screen the page.
  - Synchronous ES5 polyfills before module boot: `globalThis`, `Object.hasOwn`, `Array.prototype.at`, `String.prototype.replaceAll`, `Promise.allSettled`.
  - `#gz-boot-shell` fallback timer (`16000ms` / `2500ms` on window error) cleared when `src/main.tsx` sets `window.__GENZ_BOOTED__ = true`. **Must use `document.createElement` + `textContent` — never `el.innerHTML =`** (`browserCompat.test.ts` asserts this).
- **`src/firebase.ts`**:
  - Firestore initialized with `experimentalForceLongPolling: true` and `useFetchStreams: false` to prevent `ReadableStream` hangs in Safari 12–14, older Android WebViews, and carrier proxies.
  - Auth persistence cascade: `indexedDBLocalPersistence` -> `browserLocalPersistence` -> `browserSessionPersistence` -> `inMemoryPersistence`.
- **`src/index.css`**:
  - Keeps `overflow-x: hidden; overflow-x: clip;`, `:focus-visible` outline (`2px solid #ffffff`), and `color-scheme: dark`.
- **`vercel.json`**:
  - `/` and `/index.html`: `Cache-Control: public, max-age=0, must-revalidate` (prevents stale HTML pointing to removed hashed chunks).
  - `/assets/(.*)`: `Access-Control-Allow-Origin: *` and immutable 1-year cache.
  - Global headers: `Cross-Origin-Opener-Policy: same-origin-allow-popups` (keeps Google Sign-In & Google Forms popups working), `Permissions-Policy: camera=(self)` (required for Gate QR live camera).

---

## 2. Bilingual EN / AR & RTL Rules

- **Strict key parity**: `Object.keys(translations.en)` and `Object.keys(translations.ar)` in `src/i18n/translations.ts` must have **identical keys and non-empty string values** (`translations.test.ts` checks this).
- **Directionality & fonts**: `LanguageProvider` (`src/i18n/LanguageContext.tsx`) syncs `document.documentElement.lang` (`'en' | 'ar'`), `dir` (`'ltr' | 'rtl'`), `document.title`, and `localStorage` key `genz_events_lang`. `src/index.css` switches Arabic font to `"Cairo"` and resets `letter-spacing: 0 !important` on non-mono text (`rtl:tracking-normal` on utility classes).
- **Always use logical CSS classes** in JSX: `ps-*`, `pe-*`, `ms-*`, `me-*`, `start-*`, `end-*`, `text-start` (avoid `pl-`, `pr-`, `ml-`, `mr-`, `left-`, `right-` unless layout-invariant).
- **Digit normalization**: Use `toAsciiDigits()` in `src/utils/bookingLogic.ts` before parsing numeric inputs, mobile numbers, Excel quantities/amounts, or Google Form responses so Arabic-Indic (`٠-٩`) and Persian (`۰-۹`) digits work seamlessly.
- **Error localization**: Wrap dynamic/validation messages with `localizeKnownMessage(msg, lang)` (`src/i18n/translations.ts`).

---

## 3. Payment Numbers, Ticket Artwork & QR Seal Geometry

- **Payment numbers**:
  - Default InstaPay & Mobile Wallets destination: `PAYMENT_PHONE_NUMBER = '+201040206700'` (overridable live via `/paymentConfig/default` -> `resolvePaymentConfig()`).
  - Never reintroduce legacy numbers (`01041062000`, `01554118042`, `01007979070`).
  - WhatsApp receipt number: `PAYMENT_WHATSAPP_NUMBER = '201016131000'` (`+201016131000`), built by `buildTicketReceiptWhatsAppUrl()`.
- **Ticket artworks & QR overlay (`src/utils/ticketDesign.ts`, `src/utils/passExport.ts`)**:
  - Four 3:1 (1500x500 canvas target) Houda x Qena artworks live in `public/assets/aistudio/` mapped by `TICKET_DESIGN_CATALOG`:
    - `silver`: `Picsart_26-11-23_23-44-09-266_6f827646.jpg`
    - `gold`: `Picsart_26-11-23_23-43-56-751_8cb50bad.jpg`
    - `vip` (Fan Pit): `Picsart_26-11-23_23-44-23-795_e887538b.jpg`
    - `lounge`: `Picsart_26-11-23_23-43-39-262_423bdafa.jpg`
  - `TICKET_STUB_SLOT` (`patchLeft: 0.684`, `patchWidth: 0.126`, `patchTop: 0.214`, `patchHeight: 0.44`) aligns the Digital QR Seal directly over the physical `OFFICIAL STAMP` circle without overlapping the Arabic headline (`x <= 0.6682`), bottom bar, or stub title (`y >= 0.675`). Keep `TicketVisualCard.tsx` and `renderTicketPassPng()` aligned via `computeTicketStubRects()`.
- **Original QR export**: `1024px`, `margin: 4` (`QR_ORIGINAL_EXPORT_SIZE`, `QR_ORIGINAL_EXPORT_MARGIN`), filename from `buildQrDownloadFilename()`.
- **Gate QR scanning (`src/utils/gateScanLogic.ts`)**: Official ticket codes match `^(GZ|OFF)-[A-Z0-9_-]{3,28}$/i`. Camera access is strictly isolated to verified staff inside `AdminCheckin` (`ticketDesign.test.ts` asserts visitors never request `getUserMedia`).
