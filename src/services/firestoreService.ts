import {
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { PRIMARY_ADMIN_EMAIL } from '../data/defaults';
import type {
  AdminMember,
  AdminRole,
  Booking,
  Concert,
  Promo,
  UserProfile,
  WaitlistEntry,
} from '../types';
import {
  buildUndoPaymentPatch,
  computeRestoredSeatsLeft,
  emailToDocId,
  getBookingCheckedInCount,
  PAYMENT_CONFIG_DOC_ID,
} from '../utils/bookingLogic';

export async function upsertUserProfile(
  uid: string,
  payload: Omit<UserProfile, 'uid' | 'createdAt' | 'updatedAt'>,
): Promise<void> {
  const path = `users/${uid}`;
  const ref = doc(db, 'users', uid);
  const cleanDisplayName = payload.displayName.trim().slice(0, 100);
  const sanitized = {
    uid,
    displayName: cleanDisplayName.length >= 2 ? cleanDisplayName : 'Gen Z Fan',
    email: payload.email.trim().slice(0, 120),
    mobile: payload.mobile.trim().slice(0, 30),
    city: payload.city.trim().slice(0, 60),
    favoriteGenre: payload.favoriteGenre.trim().slice(0, 60),
    bio: payload.bio.trim().slice(0, 300),
    favorites: Array.from(new Set(payload.favorites)).slice(0, 50),
  };
  let exists = false;
  try {
    const snap = await getDoc(ref);
    exists = snap.exists();
    if (exists) {
      await updateDoc(ref, {
        displayName: sanitized.displayName,
        email: sanitized.email,
        mobile: sanitized.mobile,
        city: sanitized.city,
        favoriteGenre: sanitized.favoriteGenre,
        bio: sanitized.bio,
        favorites: sanitized.favorites,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        ...sanitized,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, exists ? OperationType.UPDATE : OperationType.CREATE, path);
  }
}

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
): Promise<void> {
  const bookingRef = doc(db, 'bookings', booking.bookingCode);
  const concertRef = doc(db, 'concerts', booking.concertId);
  try {
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
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `bookings/${booking.bookingCode}`);
  }
}

export async function adminUndoPayment(booking: Booking): Promise<boolean> {
  const bookingRef = doc(db, 'bookings', booking.bookingCode);
  const concertRef = doc(db, 'concerts', booking.concertId);
  try {
    return await runTransaction(db, async (tx) => {
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
      return true;
    });
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
): Promise<CheckInScanResult> {
  const path = `bookings/${booking.bookingCode}`;
  const bookingRef = doc(db, 'bookings', booking.bookingCode);
  const timeStamp = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  try {
    // Atomic transaction guarantees simultaneous entrance scanners increment 1/5 -> 2/5 -> ... -> 5/5 cleanly and never over-admit
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
      return {
        checkedInCount: nextCount,
        quantity: total,
        checkedIn: isNowFull,
        checkedInAt: timeStamp,
      };
    });
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
): Promise<CheckInScanResult> {
  const path = `bookings/${booking.bookingCode}`;
  const bookingRef = doc(db, 'bookings', booking.bookingCode);
  try {
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
      return {
        checkedInCount: nextCount,
        quantity: total,
        checkedIn: false,
        checkedInAt: nextAt,
      };
    });
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
): Promise<CheckInScanResult> {
  if (nextCheckedIn) {
    return adminScanCheckIn(booking, approverName, method);
  }
  return adminDecrementCheckIn(booking, approverName, method);
}

export async function adminConfirmAndCheckIn(
  booking: Booking,
  approverName: string,
  method: string,
): Promise<CheckInScanResult> {
  const bookingRef = doc(db, 'bookings', booking.bookingCode);
  const concertRef = doc(db, 'concerts', booking.concertId);
  const timeStamp = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  try {
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

      return {
        checkedInCount: nextCount,
        quantity: total,
        checkedIn: isNowFull,
        checkedInAt: nextAt,
      };
    });
    return result;
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `bookings/${booking.bookingCode}`);
  }
}

export async function adminDeleteBooking(booking: Booking): Promise<void> {
  const bookingRef = doc(db, 'bookings', booking.bookingCode);
  const concertRef = doc(db, 'concerts', booking.concertId);
  try {
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
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `bookings/${booking.bookingCode}`);
  }
}

export async function adminCreateOfflineBooking(
  booking: Omit<Booking, 'createdAt' | 'updatedAt'>,
  deductSeats: boolean,
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
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `bookings/${booking.bookingCode}`);
  }
}

export async function adminBulkImportOfflineBookings(
  concertId: string,
  bookings: Omit<Booking, 'createdAt' | 'updatedAt'>[],
  deductSeats: boolean,
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

export async function adminSaveConcert(
  concert: Omit<Concert, 'createdAt' | 'updatedAt'>,
  isEdit: boolean,
): Promise<void> {
  const path = `concerts/${concert.id}`;
  try {
    const ref = doc(db, 'concerts', concert.id);
    if (isEdit) {
      await updateDoc(ref, {
        title: concert.title,
        artist: concert.artist,
        venue: concert.venue,
        isoDate: concert.isoDate,
        isoTime: concert.isoTime,
        date: concert.date,
        time: concert.time,
        doors: concert.doors,
        genre: concert.genre,
        priceEgp: concert.priceEgp,
        tierPrices: concert.tierPrices,
        tierColors: concert.tierColors ? concert.tierColors : deleteField(),
        totalSeats: concert.totalSeats,
        seatsLeft: concert.seatsLeft,
        description: concert.description,
        posterUrl: concert.posterUrl,
        updatedAt: serverTimestamp(),
      });
    } else {
      const { tierColors, ...rest } = concert;
      await setDoc(ref, {
        ...rest,
        ...(tierColors ? { tierColors } : {}),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, isEdit ? OperationType.UPDATE : OperationType.CREATE, path);
  }
}

export async function adminDeleteConcert(concertId: string): Promise<void> {
  const path = `concerts/${concertId}`;
  try {
    await deleteDoc(doc(db, 'concerts', concertId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function createWaitlistEntry(
  entry: Omit<WaitlistEntry, 'createdAt'>,
): Promise<void> {
  const path = `waitlist/${entry.id}`;
  try {
    await setDoc(doc(db, 'waitlist', entry.id), {
      ...entry,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function deleteWaitlistEntry(entryId: string): Promise<void> {
  const path = `waitlist/${entryId}`;
  try {
    await deleteDoc(doc(db, 'waitlist', entryId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function adminSavePromo(
  promo: Omit<Promo, 'createdAt' | 'updatedAt'>,
  isEdit: boolean,
): Promise<void> {
  const path = `promos/${promo.code}`;
  try {
    const ref = doc(db, 'promos', promo.code);
    if (isEdit) {
      await updateDoc(ref, {
        type: promo.type,
        value: promo.value,
        tiers: promo.tiers,
        label: promo.label,
        active: promo.active,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        ...promo,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, isEdit ? OperationType.UPDATE : OperationType.CREATE, path);
  }
}

export async function adminDeletePromo(code: string): Promise<void> {
  const path = `promos/${code}`;
  try {
    await deleteDoc(doc(db, 'promos', code));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function adminAddMember(
  name: string,
  email: string,
  role: AdminRole,
  addedBy: string,
): Promise<void> {
  const id = emailToDocId(email);
  const path = `admins/${id}`;
  const ref = doc(db, 'admins', id);
  let exists = false;
  try {
    const existing = await getDoc(ref);
    exists = existing.exists();
    if (exists) {
      await updateDoc(ref, {
        name: name.trim().slice(0, 100),
        email: email.trim().toLowerCase().slice(0, 120),
        role,
        addedBy: addedBy.slice(0, 120),
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        id,
        name: name.trim().slice(0, 100),
        email: email.trim().toLowerCase().slice(0, 120),
        role,
        addedBy: addedBy.slice(0, 120),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, exists ? OperationType.UPDATE : OperationType.CREATE, path);
  }
}

export async function adminRemoveMember(id: string): Promise<void> {
  const path = `admins/${id}`;
  try {
    await deleteDoc(doc(db, 'admins', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function checkIsEmailAdmin(email: string | null | undefined): Promise<AdminMember | null> {
  if (!email) return null;
  const lower = email.trim().toLowerCase();
  if (lower === PRIMARY_ADMIN_EMAIL.toLowerCase()) {
    return {
      id: emailToDocId(lower),
      name: 'Lead Organizer',
      email: lower,
      role: 'Super Admin',
      addedBy: 'System',
    };
  }
  const id = emailToDocId(lower);
  if (id.length < 2 || id.length > 128) return null;
  try {
    const snap = await getDoc(doc(db, 'admins', id));
    if (snap.exists()) {
      return snap.data() as AdminMember;
    }
    return null;
  } catch {
    return null;
  }
}

export async function createAdminSession(
  sessionId: string,
  userId: string,
  name: string,
  email: string,
  role: AdminRole,
): Promise<void> {
  const path = `adminSessions/${sessionId}`;
  try {
    await setDoc(doc(db, 'adminSessions', sessionId), {
      id: sessionId,
      userId,
      name: name.trim().slice(0, 100) || 'Admin',
      email: email.trim().slice(0, 120),
      role,
      lastSeen: serverTimestamp(),
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function touchAdminSession(
  sessionId: string,
  name: string,
): Promise<void> {
  try {
    await updateDoc(doc(db, 'adminSessions', sessionId), {
      name: name.trim().slice(0, 100) || 'Admin',
      lastSeen: serverTimestamp(),
    });
  } catch {
    // non-fatal heartbeat refresh failure
  }
}

export async function removeAdminSession(sessionId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'adminSessions', sessionId));
  } catch {
    // non-fatal cleanup on logout or stale prune
  }
}

export async function adminSavePaymentConfig(
  payload: { instapayNumber: string; walletNumber: string },
  updatedBy: string,
): Promise<void> {
  const id = PAYMENT_CONFIG_DOC_ID;
  const path = `paymentConfig/${id}`;
  const ref = doc(db, 'paymentConfig', id);
  const cleanInstapay = payload.instapayNumber.trim().slice(0, 80);
  const cleanWallet = payload.walletNumber.trim().slice(0, 30);
  const cleanUpdatedBy = updatedBy.trim().slice(0, 120);
  let exists = false;
  try {
    const existingSnap = await getDoc(ref);
    exists = existingSnap.exists();
    if (exists) {
      await updateDoc(ref, {
        instapayNumber: cleanInstapay,
        walletNumber: cleanWallet,
        updatedBy: cleanUpdatedBy,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        id,
        instapayNumber: cleanInstapay,
        walletNumber: cleanWallet,
        updatedBy: cleanUpdatedBy,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, exists ? OperationType.UPDATE : OperationType.CREATE, path);
  }
}
