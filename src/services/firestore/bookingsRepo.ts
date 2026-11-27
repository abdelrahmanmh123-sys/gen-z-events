import {
  deleteDoc,
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import type { AuditActor, Booking, Concert } from '../../types';
import {
  buildUndoPaymentPatch,
  computeRestoredSeatsLeft,
  getBookingCheckedInCount,
} from '../../utils/bookingLogic';
import { describeBookingForAudit } from '../../utils/auditLog';
import { recordAuditLog, resolveActor } from './auditHelper';

export async function createBooking(
  booking: Omit<Booking, 'createdAt' | 'updatedAt'>,
): Promise<void> {
  const path = `bookings/${booking.bookingCode}`;
  try {
    await setDoc(doc(db, 'bookings', booking.bookingCode), {
      ...booking,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function cancelPendingBooking(bookingCode: string): Promise<void> {
  const path = `bookings/${bookingCode}`;
  try {
    await deleteDoc(doc(db, 'bookings', bookingCode));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function adminConfirmPayment(
  booking: Booking,
  approverName: string,
  method: string,
  actor?: AuditActor,
): Promise<void> {
  const bookingRef = doc(db, 'bookings', booking.bookingCode);
  const concertRef = doc(db, 'concerts', booking.concertId);
  try {
    let confirmedBooking: Booking | null = null;
    await runTransaction(db, async (tx) => {
      const freshBookingSnap = await tx.get(bookingRef);
      if (!freshBookingSnap.exists()) {
        throw new Error('Booking no longer exists.');
      }
      const freshBooking = freshBookingSnap.data() as Booking;
      if (freshBooking.paymentStatus === 'Paid') return;

      const freshConcertSnap = await tx.get(concertRef);
      tx.update(bookingRef, {
        paymentStatus: 'Paid',
        approvedBy: approverName.slice(0, 100),
        approvalMethod: method.slice(0, 40),
        updatedAt: serverTimestamp(),
      });
      if (freshConcertSnap.exists()) {
        const freshConcert = freshConcertSnap.data() as Concert;
        const nextSeats = Math.max(0, freshConcert.seatsLeft - freshBooking.quantity);
        tx.update(concertRef, {
          seatsLeft: nextSeats,
          updatedAt: serverTimestamp(),
        });
      }
      confirmedBooking = freshBooking;
    });

    if (confirmedBooking) {
      const confirmed = confirmedBooking as Booking;
      await recordAuditLog({
        action: 'payment_confirmed',
        actor: resolveActor(actor, approverName, 'Super Admin'),
        targetType: 'booking',
        targetId: confirmed.bookingCode,
        targetLabel: confirmed.customerName,
        details: describeBookingForAudit(confirmed, [method]),
        amountEgp: confirmed.totalEgp,
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `bookings/${booking.bookingCode}`);
  }
}

export async function adminUndoPayment(
  booking: Booking,
  actor?: AuditActor,
): Promise<boolean> {
  const bookingRef = doc(db, 'bookings', booking.bookingCode);
  const concertRef = doc(db, 'concerts', booking.concertId);
  try {
    let revertedSnapshot: Booking | null = null;
    const reverted = await runTransaction(db, async (tx) => {
      const freshBookingSnap = await tx.get(bookingRef);
      if (!freshBookingSnap.exists()) {
        throw new Error('Booking no longer exists.');
      }
      const freshBooking = freshBookingSnap.data() as Booking;
      if (freshBooking.paymentStatus !== 'Paid') {
        return false;
      }

      const freshConcertSnap = await tx.get(concertRef);
      tx.update(bookingRef, {
        ...buildUndoPaymentPatch(),
        updatedAt: serverTimestamp(),
      });
      if (freshConcertSnap.exists()) {
        const freshConcert = freshConcertSnap.data() as Concert;
        const nextSeats = computeRestoredSeatsLeft(
          freshConcert.seatsLeft,
          freshConcert.totalSeats,
          freshBooking.quantity,
        );
        tx.update(concertRef, {
          seatsLeft: nextSeats,
          updatedAt: serverTimestamp(),
        });
      }
      revertedSnapshot = freshBooking;
      return true;
    });

    if (reverted && revertedSnapshot) {
      const prev = revertedSnapshot as Booking;
      const hadCheckIns = getBookingCheckedInCount(prev) > 0;
      await recordAuditLog({
        action: 'payment_undone',
        actor: resolveActor(actor, undefined, 'Super Admin'),
        targetType: 'booking',
        targetId: prev.bookingCode,
        targetLabel: prev.customerName,
        details: describeBookingForAudit(prev, [
          prev.approvedBy ? `Prev approver: ${prev.approvedBy}` : null,
          hadCheckIns ? `Check-in reset (${getBookingCheckedInCount(prev)}/${prev.quantity})` : null,
        ]),
        amountEgp: prev.totalEgp,
      });
    }
    return reverted;
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `bookings/${booking.bookingCode}`);
  }
}

export interface CheckInScanResult {
  checkedInCount: number;
  quantity: number;
  checkedIn: boolean;
  checkedInAt: string;
}

export async function adminScanCheckIn(
  booking: Booking,
  approverName: string,
  method: string,
  actor?: AuditActor,
): Promise<CheckInScanResult> {
  const path = `bookings/${booking.bookingCode}`;
  const bookingRef = doc(db, 'bookings', booking.bookingCode);
  const timeStamp = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  try {
    // Atomic transaction guarantees simultaneous entrance scanners increment 1/5 -> 2/5 -> ... -> 5/5 cleanly and never over-admit
    let scannedBooking: Booking | null = null;
    const result = await runTransaction(db, async (tx) => {
      const snap = await tx.get(bookingRef);
      if (!snap.exists()) {
        throw new Error('Booking no longer exists.');
      }
      const fresh = snap.data() as Booking;
      if (fresh.paymentStatus !== 'Paid') {
        throw new Error('PAYMENT_NOT_PAID');
      }
      const total = Math.max(1, Math.floor(fresh.quantity || 1));
      const currentCount = getBookingCheckedInCount(fresh);
      if (currentCount >= total) {
        throw new Error(
          `ALREADY_CHECKED_IN|${currentCount}|${total}|${fresh.checkedInAt || ''}|${fresh.approvedBy || ''}`,
        );
      }
      const nextCount = currentCount + 1;
      const isNowFull = nextCount >= total;
      tx.update(bookingRef, {
        checkedIn: isNowFull,
        checkedInCount: nextCount,
        checkedInAt: timeStamp,
        approvedBy: approverName.slice(0, 100),
        approvalMethod: method.slice(0, 40),
        updatedAt: serverTimestamp(),
      });
      scannedBooking = fresh;
      return {
        checkedInCount: nextCount,
        quantity: total,
        checkedIn: isNowFull,
        checkedInAt: timeStamp,
      };
    });

    if (scannedBooking) {
      const scanned = scannedBooking as Booking;
      await recordAuditLog({
        action: 'checkin',
        actor: resolveActor(actor, approverName, 'Super Admin'),
        targetType: 'booking',
        targetId: scanned.bookingCode,
        targetLabel: scanned.customerName,
        details: describeBookingForAudit(scanned, [
          method,
          `Entries ${result.checkedInCount}/${result.quantity}`,
        ]),
        amountEgp: 0,
      });
    }
    return result;
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.startsWith('ALREADY_CHECKED_IN|') || error.message === 'PAYMENT_NOT_PAID')
    ) {
      throw error;
    }
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function adminDecrementCheckIn(
  booking: Booking,
  approverName: string,
  method: string,
  actor?: AuditActor,
): Promise<CheckInScanResult> {
  const path = `bookings/${booking.bookingCode}`;
  const bookingRef = doc(db, 'bookings', booking.bookingCode);
  try {
    let revertedBooking: Booking | null = null;
    const result = await runTransaction(db, async (tx) => {
      const snap = await tx.get(bookingRef);
      if (!snap.exists()) {
        throw new Error('Booking no longer exists.');
      }
      const fresh = snap.data() as Booking;
      if (fresh.paymentStatus !== 'Paid') {
        throw new Error('PAYMENT_NOT_PAID');
      }
      const total = Math.max(1, Math.floor(fresh.quantity || 1));
      const currentCount = getBookingCheckedInCount(fresh);
      const nextCount = Math.max(0, currentCount - 1);
      const nextAt = nextCount === 0 ? '' : fresh.checkedInAt || '';
      tx.update(bookingRef, {
        checkedIn: false,
        checkedInCount: nextCount,
        checkedInAt: nextAt,
        approvedBy: (nextCount === 0 ? fresh.approvedBy : approverName || fresh.approvedBy).slice(0, 100),
        approvalMethod: (nextCount === 0 ? fresh.approvalMethod : method || fresh.approvalMethod).slice(0, 40),
        updatedAt: serverTimestamp(),
      });
      revertedBooking = fresh;
      return {
        checkedInCount: nextCount,
        quantity: total,
        checkedIn: false,
        checkedInAt: nextAt,
      };
    });

    if (revertedBooking) {
      const target = revertedBooking as Booking;
      await recordAuditLog({
        action: 'checkin_undone',
        actor: resolveActor(actor, approverName, 'Super Admin'),
        targetType: 'booking',
        targetId: target.bookingCode,
        targetLabel: target.customerName,
        details: describeBookingForAudit(target, [
          method,
          `Entries ${result.checkedInCount}/${result.quantity}`,
        ]),
        amountEgp: 0,
      });
    }
    return result;
  } catch (error) {
    if (error instanceof Error && error.message === 'PAYMENT_NOT_PAID') {
      throw error;
    }
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function adminToggleCheckIn(
  booking: Booking,
  nextCheckedIn: boolean,
  approverName: string,
  method: string,
  actor?: AuditActor,
): Promise<CheckInScanResult> {
  if (nextCheckedIn) {
    return adminScanCheckIn(booking, approverName, method, actor);
  }
  return adminDecrementCheckIn(booking, approverName, method, actor);
}

export async function adminConfirmAndCheckIn(
  booking: Booking,
  approverName: string,
  method: string,
  actor?: AuditActor,
): Promise<CheckInScanResult> {
  const bookingRef = doc(db, 'bookings', booking.bookingCode);
  const concertRef = doc(db, 'concerts', booking.concertId);
  const timeStamp = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  try {
    let approvedBooking: Booking | null = null;
    const result = await runTransaction(db, async (tx) => {
      const freshBookingSnap = await tx.get(bookingRef);
      if (!freshBookingSnap.exists()) {
        throw new Error('Booking no longer exists.');
      }
      const freshBooking = freshBookingSnap.data() as Booking;
      const freshConcertSnap = await tx.get(concertRef);
      const total = Math.max(1, Math.floor(freshBooking.quantity || 1));
      const currentCount = getBookingCheckedInCount(freshBooking);
      const nextCount = Math.min(total, currentCount + 1);
      const isNowFull = nextCount >= total;
      const nextAt = timeStamp;

      tx.update(bookingRef, {
        paymentStatus: 'Paid',
        checkedIn: isNowFull,
        checkedInCount: nextCount,
        checkedInAt: nextAt,
        approvedBy: approverName.slice(0, 100),
        approvalMethod: method.slice(0, 40),
        updatedAt: serverTimestamp(),
      });

      if (freshBooking.paymentStatus !== 'Paid' && freshConcertSnap.exists()) {
        const freshConcert = freshConcertSnap.data() as Concert;
        tx.update(concertRef, {
          seatsLeft: Math.max(0, freshConcert.seatsLeft - freshBooking.quantity),
          updatedAt: serverTimestamp(),
        });
      }

      approvedBooking = freshBooking;
      return {
        checkedInCount: nextCount,
        quantity: total,
        checkedIn: isNowFull,
        checkedInAt: nextAt,
      };
    });

    if (approvedBooking) {
      const approved = approvedBooking as Booking;
      await recordAuditLog({
        action: 'payment_confirmed_checkin',
        actor: resolveActor(actor, approverName, 'Super Admin'),
        targetType: 'booking',
        targetId: approved.bookingCode,
        targetLabel: approved.customerName,
        details: describeBookingForAudit(approved, [
          method,
          `Entries ${result.checkedInCount}/${result.quantity}`,
        ]),
        amountEgp: approved.totalEgp,
      });
    }
    return result;
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `bookings/${booking.bookingCode}`);
  }
}

export async function adminDeleteBooking(
  booking: Booking,
  actor?: AuditActor,
): Promise<void> {
  const bookingRef = doc(db, 'bookings', booking.bookingCode);
  const concertRef = doc(db, 'concerts', booking.concertId);
  try {
    let deletedSnapshot: Booking | null = null;
    await runTransaction(db, async (tx) => {
      const freshBookingSnap = await tx.get(bookingRef);
      if (!freshBookingSnap.exists()) return;
      const freshBooking = freshBookingSnap.data() as Booking;
      const freshConcertSnap = await tx.get(concertRef);

      tx.delete(bookingRef);
      if (freshBooking.paymentStatus === 'Paid' && freshConcertSnap.exists()) {
        const freshConcert = freshConcertSnap.data() as Concert;
        tx.update(concertRef, {
          seatsLeft: computeRestoredSeatsLeft(
            freshConcert.seatsLeft,
            freshConcert.totalSeats,
            freshBooking.quantity,
          ),
          updatedAt: serverTimestamp(),
        });
      }
      deletedSnapshot = freshBooking;
    });

    if (deletedSnapshot) {
      const removed = deletedSnapshot as Booking;
      await recordAuditLog({
        action: 'booking_deleted',
        actor: resolveActor(actor, undefined, 'Super Admin'),
        targetType: 'booking',
        targetId: removed.bookingCode,
        targetLabel: removed.customerName,
        details: describeBookingForAudit(removed, [
          `Status: ${removed.paymentStatus}`,
          removed.approvedBy ? `Approved by: ${removed.approvedBy}` : null,
        ]),
        amountEgp: removed.totalEgp,
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `bookings/${booking.bookingCode}`);
  }
}

export async function adminCreateOfflineBooking(
  booking: Omit<Booking, 'createdAt' | 'updatedAt'>,
  deductSeats: boolean,
  actor?: AuditActor,
): Promise<void> {
  const bookingRef = doc(db, 'bookings', booking.bookingCode);
  const concertRef = doc(db, 'concerts', booking.concertId);
  try {
    await runTransaction(db, async (tx) => {
      const [existingBookingSnap, freshConcertSnap] = await Promise.all([
        tx.get(bookingRef),
        tx.get(concertRef),
      ]);
      if (existingBookingSnap.exists()) {
        throw new Error('Booking code already exists. Please try again.');
      }
      tx.set(bookingRef, {
        ...booking,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      if (deductSeats && booking.paymentStatus === 'Paid' && freshConcertSnap.exists()) {
        const freshConcert = freshConcertSnap.data() as Concert;
        tx.update(concertRef, {
          seatsLeft: Math.max(0, freshConcert.seatsLeft - booking.quantity),
          updatedAt: serverTimestamp(),
        });
      }
    });

    await recordAuditLog({
      action: 'offline_sale_created',
      actor: resolveActor(actor, booking.approvedBy, 'Super Admin'),
      targetType: 'booking',
      targetId: booking.bookingCode,
      targetLabel: booking.customerName,
      details: describeBookingForAudit(booking, [
        booking.checkedIn ? 'Checked in immediately' : null,
        deductSeats ? 'Seats deducted' : 'No seat deduction',
      ]),
      amountEgp: booking.totalEgp,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `bookings/${booking.bookingCode}`);
  }
}

export async function adminBulkImportOfflineBookings(
  concertId: string,
  bookings: Omit<Booking, 'createdAt' | 'updatedAt'>[],
  deductSeats: boolean,
  auditOptions?: {
    actor?: AuditActor;
    sourceLabel?: string;
    concertTitle?: string;
  },
): Promise<{
  importedCount: number;
  skippedDuplicateCount: number;
  deductedTickets: number;
  importedTickets: number;
  importedRevenueEgp: number;
}> {
  if (bookings.length === 0) {
    return {
      importedCount: 0,
      skippedDuplicateCount: 0,
      deductedTickets: 0,
      importedTickets: 0,
      importedRevenueEgp: 0,
    };
  }
  const EXISTENCE_CHECK_CHUNK = 25;
  const WRITE_CHUNK_SIZE = 400;
  try {
    // Verify server-side which bookingCodes do not already exist so concurrent imports stay idempotent
    const freshBookings: Omit<Booking, 'createdAt' | 'updatedAt'>[] = [];
    const seenInBatch = new Set<string>();
    let skippedDuplicateCount = 0;

    for (let i = 0; i < bookings.length; i += EXISTENCE_CHECK_CHUNK) {
      const slice = bookings.slice(i, i + EXISTENCE_CHECK_CHUNK);
      const checks = await Promise.all(
        slice.map(async (item) => {
          const codeKey = item.bookingCode.toUpperCase();
          if (seenInBatch.has(codeKey)) {
            return { item, exists: true };
          }
          seenInBatch.add(codeKey);
          const snap = await getDoc(doc(db, 'bookings', item.bookingCode));
          return { item, exists: snap.exists() };
        }),
      );
      for (const entry of checks) {
        if (entry.exists) {
          skippedDuplicateCount += 1;
        } else {
          freshBookings.push(entry.item);
        }
      }
    }

    if (freshBookings.length === 0) {
      return {
        importedCount: 0,
        skippedDuplicateCount,
        deductedTickets: 0,
        importedTickets: 0,
        importedRevenueEgp: 0,
      };
    }

    let committedPaidQty = 0;
    for (let i = 0; i < freshBookings.length; i += WRITE_CHUNK_SIZE) {
      const chunk = freshBookings.slice(i, i + WRITE_CHUNK_SIZE);
      const batch = writeBatch(db);
      for (const item of chunk) {
        batch.set(doc(db, 'bookings', item.bookingCode), {
          ...item,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      await batch.commit();
      committedPaidQty += chunk
        .filter((b) => b.paymentStatus === 'Paid')
        .reduce((sum, b) => sum + b.quantity, 0);
    }

    const importedTickets = freshBookings.reduce((sum, b) => sum + b.quantity, 0);
    const importedRevenueEgp = freshBookings
      .filter((b) => b.paymentStatus === 'Paid')
      .reduce((sum, b) => sum + b.totalEgp, 0);

    let deductedTickets = 0;
    if (deductSeats && committedPaidQty > 0) {
      const concertRef = doc(db, 'concerts', concertId);
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(concertRef);
        if (!snap.exists()) return;
        const freshConcert = snap.data() as Concert;
        const nextSeats = Math.max(0, freshConcert.seatsLeft - committedPaidQty);
        deductedTickets = freshConcert.seatsLeft - nextSeats;
        tx.update(concertRef, {
          seatsLeft: nextSeats,
          updatedAt: serverTimestamp(),
        });
      });
    }

    const source = auditOptions?.sourceLabel || 'Offline Import';
    const label = auditOptions?.concertTitle || freshBookings[0]?.concertTitle || concertId;
    await recordAuditLog({
      action: 'offline_import',
      actor: resolveActor(auditOptions?.actor, freshBookings[0]?.approvedBy, 'Super Admin'),
      targetType: 'import',
      targetId: concertId,
      targetLabel: label,
      details: `${source} · ${freshBookings.length} orders · ${importedTickets} passes${
        skippedDuplicateCount > 0 ? ` · ${skippedDuplicateCount} dup skipped` : ''
      }${deductedTickets > 0 ? ` · -${deductedTickets} seats` : ''}`,
      amountEgp: importedRevenueEgp,
    });

    return {
      importedCount: freshBookings.length,
      skippedDuplicateCount,
      deductedTickets,
      importedTickets,
      importedRevenueEgp,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `bookings/offline-import/${concertId}`);
  }
}
