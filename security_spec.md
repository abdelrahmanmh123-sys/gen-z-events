# Gen Z Events — Firestore Security Specification (Phase 0)

## 1. Core Data Invariants
1. **Booking Integrity**: Online fan bookings must belong to the authenticated, email-verified user (`userId == request.auth.uid`), reference an existing concert (`exists(/concerts/{concertId})`), use `'InstaPay'` or `'Mobile Wallets'`, cap `quantity <= 6`, provide `customerEmail` (>= 3 chars), and start with `paymentStatus == "Pending"`, `checkedIn == false`, and empty approval metadata (`approvedBy == ""`, `checkedInAt == ""`). Fans can never self-approve payment, forge `'Offline'` sales, or self-check-in. Verified admins may record `'Offline'` box-office or Excel-imported sales (up to 500 tickets/row, optional email).
2. **PII Isolation**: `/users/{userId}`, `/bookings/{bookingId}`, and `/waitlist/{entryId}` contain phone numbers and emails. Non-admin users can ONLY read documents where `userId == request.auth.uid` (or `userId == docId` on `/users`). Blanket `isSignedIn()` reads are forbidden.
3. **Privilege Separation**: User profiles (`/users/{userId}`) contain no role or privilege fields. Admin authority is strictly checked via `request.auth.token.email_verified == true` matching either the primary admin email (`weentamalak@gmail.com`) or a document in `/admins/{emailDocId}`.
4. **Concert & Promo Governance**: Public visitors can read `/concerts` and `/promos`, but ONLY verified admins can create, update, or delete them. Optional `tierColors` on `/concerts` must strictly contain only `Silver`, `Gold`, `VIP`, and `Lounge` keys with valid 7-character `#RRGGBB` hex colors.
5. **Temporal & Immutable Integrity**: `createdAt` must equal `request.time` on creation and remain immutable on update. `updatedAt` must equal `request.time` on create and update. Owner IDs (`userId`, `uid`) and relational IDs (`concertId`, `bookingCode`) are immutable.
6. **Payload & ID Bounds**: All document IDs match `^[a-zA-Z0-9_\-]+$` (`<= 128` chars), all strings enforce explicit `.size()` bounds, and all arrays enforce `.size() <= MAX`.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Self-Approved Paid Booking**: Fan creates `/bookings/GZ-FAKE01` with `paymentStatus: "Paid"`, `checkedIn: true`, or `paymentMethod: "Offline"`. -> **Expected: PERMISSION_DENIED**.
2. **Identity Spoofing on Booking**: User A creates `/bookings/GZ-SPOOF1` with `userId: "user-B"`. -> **Expected: PERMISSION_DENIED**.
3. **Orphaned Booking**: Fan creates `/bookings/GZ-ORPHAN` with `concertId: "nonexistent-show"`. -> **Expected: PERMISSION_DENIED**.
4. **Shadow Field Injection on Profile**: Fan writes `/users/{uid}` with extra field `isAdmin: true`. -> **Expected: PERMISSION_DENIED**.
5. **Cross-User PII Read**: User A reads `/users/{userB}` or `/bookings/{userBBooking}`. -> **Expected: PERMISSION_DENIED**.
6. **Unverified Admin Email Spoof**: Request has `email: "weentamalak@gmail.com"` with `email_verified: false`. -> **Expected: PERMISSION_DENIED**.
7. **Fan Cancelling Checked-In / Paid Ticket**: Fan deletes `/bookings/{ownPaidTicket}` where `paymentStatus == "Paid"`. -> **Expected: PERMISSION_DENIED**.
8. **Fan Tampering With Concert Seats or Colors**: Non-admin updates `/concerts/qena-01` setting `seatsLeft: 9999` or arbitrary `tierColors`. -> **Expected: PERMISSION_DENIED**.
9. **Client Timestamp Forgery**: Fan creates `/bookings/GZ-TIME01` with `createdAt` backdated to 2020. -> **Expected: PERMISSION_DENIED**.
10. **ID Poisoning**: Client writes `/bookings/` with a 500-char or special-character document ID. -> **Expected: PERMISSION_DENIED**.
11. **Value Poisoning / Oversized String**: Fan writes `customerName` of 5,000 characters or `quantity: 50`. -> **Expected: PERMISSION_DENIED**.
12. **Unauthorized Staff Session Injection**: Non-admin creates or reads `/adminSessions/{sessionId}` or `/admins/{adminId}`. -> **Expected: PERMISSION_DENIED**.
