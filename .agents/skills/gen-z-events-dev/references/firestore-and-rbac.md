# Firestore Collections, Schema Allowlists & RBAC Matrix

Database: **Named Firestore database** `ai-studio-ebd015a5-12b5-456c-b8c3-447ca302527f` in project `gen-z-events`.
Legacy `/settings` and `/updates` collections are permanently disabled by the global catch-all `allow read, write: if false;` at the top of `firestore.rules`.

---

## 1. Role & Auth Tier Definitions

`isVerified()` requires **all** of:
- `request.auth != null`
- `sign_in_provider != 'anonymous'` (no anonymous auth, no phone-auth bypass)
- `email_verified == true`
- `email is string && email.size() >= 5`

**Always call `ensureFreshVerifiedToken(user)`** (`src/firebase.ts`) after email verification or before security-rule-protected writes if claims might be stale.

| Role | How Resolved | Client (`getStaffPermissions`) & Firestore Capabilities |
| :--- | :--- | :--- |
| **Public Visitor** | Unauthenticated or unverified | `get` (valid ID) & `list` on `/concerts`, `/promos`; single-doc `get` on `/paymentConfig/default`. Zero PII reads or writes. |
| **Verified Fan** | `isVerified()` | Own `/users/{uid}` (email must match `request.auth.token.email` case-insensitively). Own `/bookings` (create `Pending` `InstaPay`/`Mobile Wallets`, qty `1..20`, `checkedIn == false`, `checkedInCount == 0`/absent, server-verified pricing + promo; delete only own `Pending` & un-checked-in bookings). Own `/waitlist` (create/read/delete, no update). |
| **Gate Staff** | `isVerified()` + `/admins/{emailToDocId(email)}.role == 'Gate Staff'` | **Tabs:** `checkin`, `offline`, `dashboard` (approvals log only; `canViewRevenueAnalytics: false`).<br>**Allowed writes:**<br>• `/bookings` create ONLY if `userId in ['offline-sale', 'offline_box_office']`, `paymentMethod == 'Offline'`, `paymentStatus in ['Paid', 'Pending']`.<br>• `/bookings` update ONLY when `existing.paymentStatus == 'Paid' && incoming.paymentStatus == 'Paid'` and `affectedKeys().hasOnly(['checkedIn', 'checkedInCount', 'checkedInAt', 'approvedBy', 'approvalMethod', 'updatedAt'])`.<br>• `/concerts` update ONLY `affectedKeys().hasOnly(['seatsLeft', 'updatedAt'])` with `seatsLeft <= existing.seatsLeft`.<br>• `/adminSessions/{sessionId}` CRUD ONLY for own `userId` with `role == 'Gate Staff'`.<br>**Forbidden:** Confirming payments, deleting bookings, managing concerts/promos/team/paymentConfig, listing `/users`, `/waitlist`, `/admins`, `/adminSessions`. |
| **Super Admin** | `weentamalak@gmail.com` (`isPrimaryAdmin()`) **or** `/admins/{emailToDocId(email)}.role == 'Super Admin'` | Full access across all 7 tabs (`dashboard`, `checkin`, `offline`, `schedule`, `manage`, `promos`, `team`) and all 8 collections. Note: `PRIMARY_ADMIN_EMAIL` in `src/data/defaults.ts` must always match `isPrimaryAdmin()` in `firestore.rules`. |

---

## 2. All 8 Collections & Strict Allowlists

Every collection enforces `isValidId(docId)` (`^[a-zA-Z0-9_\-]+$`, `1..128` chars), exact `hasAll` + `hasOnly` field lists, `request.time` on `createdAt`/`updatedAt`, and immutable IDs/ownerIds.

| Collection | Doc ID | Required / Allowed Keys | Key Invariants & Gotchas |
| :--- | :--- | :--- | :--- |
| `/concerts/{concertId}` | Slug `2..64` chars | `id`, `title`, `artist`, `venue`, `isoDate` (`YYYY-MM-DD`), `isoTime` (`HH:MM`), `date`, `time`, `doors`, `genre`, `priceEgp`, `tierPrices` (`Silver`, `Gold`, `VIP`, `Lounge`), optional `tierColors`, `totalSeats` (`1..50000`), `seatsLeft` (`0..totalSeats`), `description`, `posterUrl`, `createdAt`, `updatedAt` | **Quirk:** On edit in `adminSaveConcert()`, if custom colors are disabled, send `tierColors: deleteField()` (never `undefined`); on create, omit `tierColors`. `posterUrl` allows `''`, `https://...`, `/assets/...`, or `data:image/(jpeg\|jpg\|png\|webp);base64,...` (`<= 400000` rules / `<= 390000` client; no SVG). |
| `/promos/{promoId}` | Uppercase code `2..32` chars (`^[A-Z0-9_\-]+$`) | `code`, `type` (`'percent' \| 'flat'`), `value` (`> 0 && <= 10000`, `<= 90` if `percent`), `tiers` (subset of 4 tiers, max 4), `label`, `active` (bool), `createdAt`, `updatedAt` | `isValidPromoDiscount` checks `discountEgp` server-side within `±1` EGP rounding tolerance of `math.round(...)`. |
| `/bookings/{bookingId}` | `GZ-*` / `OFF-*` (`5..32` chars) | `bookingCode`, `userId`, `concertId`, `concertTitle`, `concertDate`, `concertTime`, `concertVenue`, `tier`, `quantity` (`1..500`, fans `<= 20`), `unitPrice`, `promoCode`, `discountEgp`, `totalEgp`, `paymentMethod` (`InstaPay \| Mobile Wallets \| Offline`), `transferRef` (`3..80`), `paymentStatus` (`Pending \| Paid`), `checkedIn` (bool), optional `checkedInCount`, `checkedInAt`, `approvedBy`, `approvalMethod`, `customerName`, `customerMobile` (`6..30`), `customerEmail` (`0..120`, fans `>= 3`), `createdAt`, `updatedAt` | **Multi-ticket check-in invariant:** When `checkedInCount` is present, `0 <= checkedInCount <= quantity` AND `checkedIn == (checkedInCount >= quantity)`. Always mutate check-ins via `adminScanCheckIn`, `adminDecrementCheckIn`, or `adminConfirmAndCheckIn` transactions so concurrent scanners cannot over-admit. Legacy bookings without `checkedInCount` are normalized by `getBookingCheckedInCount()`. Gate Staff cannot remove `checkedInCount` once present. |
| `/users/{userId}` | Auth `uid` | `uid`, `displayName` (`2..100`), `email` (`5..120`), `mobile` (`0..30`), `city` (`0..60`), `favoriteGenre` (`0..60`), `bio` (`0..300`), `favorites` (list `<= 50`), `createdAt`, `updatedAt` | **No role fields allowed** on user profiles. Fan writes must satisfy `incoming.email.lower() == request.auth.token.email.lower()`. Fan updates can only touch profile fields + `favorites` + `updatedAt`. |
| `/waitlist/{entryId}` | Slug `2..64` chars | `id`, `userId`, `concertId`, `concertTitle`, `name`, `mobile` (`6..30`), `email`, `createdAt` | Immutable (`allow update: if false;`). Must reference an existing `/concerts/{concertId}`. |
| `/admins/{adminId}` | `emailToDocId(email)` | `id`, `name`, `email`, `role` (`Super Admin \| Gate Staff`), `addedBy`, `createdAt`, `updatedAt` | `emailToDocId` in `src/utils/bookingLogic.ts` (`@ -> _at_`, `. -> _dot_`, `[^a-z0-9_-] -> _`) MUST stay identical to `emailToDocId` in `firestore.rules`. Self-`get` allowed for role discovery; `list` and writes are Super Admin only. |
| `/adminSessions/{sessionId}` | `sess-*` (`2..64` chars) | `id`, `userId`, `name`, `email`, `role` (`Super Admin \| Gate Staff`), `lastSeen` (timestamp), `createdAt` | Note `lastSeen == request.time` on create & update, and `role` is immutable on update. Client TTL (`ADMIN_SESSION_TTL_MS`) is 15 minutes; Super Admins prune stale sessions in `App.tsx`. |
| `/paymentConfig/{configId}` | Must be `'default'` | `id` (`'default'`), `instapayNumber` (`5..80`, `^[+a-zA-Z0-9._@\- ]+$`), `walletNumber` (`6..30`, `^[+0-9\- ()]+$`), `updatedBy`, `createdAt`, `updatedAt` | Public `get` (`isValidId(configId)`), Super Admin `list` & writes (`configId == 'default'`). |

---

## 3. Deploying Rules Changes

Whenever `firestore.rules` is modified:
1. Run `.\node_modules\.bin\eslint.cmd firestore.rules` and `.\node_modules\.bin\tsx.cmd --test firestore.rules.test.ts`.
2. Deploy to Firebase using the project's configured database target:
   ```powershell
   npx firebase-tools@latest deploy --only firestore:rules --project gen-z-events
   ```
