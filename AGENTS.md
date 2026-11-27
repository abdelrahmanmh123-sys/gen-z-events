# Gen Z Events — Workspace Agent Guide

Compact Turn-0 operating guide for `gen-z-events` (React 19 + TypeScript 7 + Vite 8 + Tailwind v4 + Firebase v13).
Load `.agents/skills/gen-z-events-dev/SKILL.md` for full checklists and `.agents/skills/gen-z-events-dev/references/symbol-index.md` for exact file/export line numbers before reading large files.

## Hard Invariants (Never Violate)
- **Firebase Pin:** Project `gen-z-events`, named Firestore DB `ai-studio-ebd015a5-12b5-456c-b8c3-447ca302527f` (`firebase-applet-config.json`, `firebase.json`, `src/firebase.ts`). Never add hardcoded concert/promo seed fallbacks or `testConnection` probes.
- **Rules Parity:** Every collection in `firestore.rules` uses strict `hasAll` + `hasOnly` + `request.time` allowlists. Any schema change in `src/types.ts` or `src/services/firestoreService.ts` MUST update `firestore.rules` + `firestore.rules.test.ts` and deploy rules (`npx firebase-tools@latest deploy --only firestore:rules --project gen-z-events`).
- **Two-Tier RBAC:** `Gate Staff` (`canViewRevenueAnalytics: false`, `canConfirmPayments: false`) MUST NEVER see EGP revenue/totals, confirm/undo payments, delete bookings, read `/auditLogs`, or manage concerts/promos/team/paymentConfig.
- **Bilingual EN/AR & RTL:** Keep `src/i18n/en.ts` and `src/i18n/ar.ts` 1:1 identical keys. Always use logical Tailwind classes (`ps-`/`pe-`/`ms-`/`me-`/`start-`/`end-`/`text-start`). Localize surfaced errors via `localizeKnownMessage(formatFriendlyFirebaseError(err), lang)`.
- **Browser & Security Hygiene:** Preserve Safari 12+ legacy build (`vite.config.ts`), forced long polling (`src/firebase.ts`), `rel="noopener noreferrer"` on `target="_blank"`, `try/catch` on storage, and `escapeCsvCell` / `sanitizeSpreadsheetCell` on exports.

## Windows Toolchain Traps
- **PowerShell 5.1:** Never use `&&`. Chain commands with `; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }`.
- **Git Binary:** Not on default `PATH`. Resolve dynamically:
  `$gitExe = Get-ChildItem "$env:LOCALAPPDATA\GitHubDesktop\app-*\resources\app\git\cmd\git.exe" -EA SilentlyContinue | Sort-Object FullName -Desc | Select-Object -Exp FullName -First 1`
- **`tsconfig.json` `allowJs` Trap:** Excludes only `dist`. Never leave stray `.ts`/`.js` scratch files in the repo or `.agents/`.

## Fast Token-Saving Workflow
1. Read `symbol-index.md` first to locate exact `StartLine–EndLine` ranges instead of reading whole files.
2. Put pure logic in small domain modules (`src/utils/booking/*`, `src/i18n/*`, `src/services/firestore/*`) with matching `*.test.ts` unit tests.
3. Verify fast during iteration (`-Quick`), then run full verification before concluding:
   ```powershell
   powershell -ExecutionPolicy Bypass -File .agents/skills/gen-z-events-dev/scripts/verify.ps1 -Build -Git
   ```
4. After adding/moving exports or files, refresh the index:
   ```powershell
   powershell -ExecutionPolicy Bypass -File .agents/skills/gen-z-events-dev/scripts/gen-index.ps1
   ```
