import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  type WriteBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { DEFAULT_CONCERTS, DEFAULT_PROMOS, PRIMARY_ADMIN_EMAIL } from '../data/defaults';
import type {
  AdminMember,
  AdminRole,
  Booking,
  Concert,
  Promo,
  UserProfile,
  WaitlistEntry,
} from '../types';
import { emailToDocId } from '../utils/bookingLogic';

async function attachSiteSeededFlag(batch: WriteBatch): Promise<void> {
  const settingsRef = doc(db, 'settings', 'site');
  const snap = await getDoc(settingsRef);
  if (!snap.exists()) {
    batch.set(settingsRef, {
      id: 'site',
      seeded: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } else if (snap.data()?.seeded !== true) {
    batch.update(settingsRef, {
      seeded: true,
      updatedAt: serverTimestamp(),
    });
  }
}

export async function seedInitialDatabase(adminEmail: string): Promise<void> {
  try {
    const primaryId = emailToDocId(PRIMARY_ADMIN_EMAIL);
    const [concertsSnap, promosSnap, primaryAdminSnap] = await Promise.all([
      getDocs(collection(db, 'concerts')),
      getDocs(collection(db, 'promos')),
      getDoc(doc(db, 'admins', primaryId)),
    ]);

    const existingConcertIds = new Set(concertsSnap.docs.map((d) => d.id));
    const existingPromoCodes = new Set(promosSnap.docs.map((d) => d.id));

    const batch = writeBatch(db);

    for (const concert of DEFAULT_CONCERTS) {
      if (!existingConcertIds.has(concert.id)) {
        batch.set(doc(db, 'concerts', concert.id), {
          ...concert,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    }

    for (const promo of DEFAULT_PROMOS) {
      if (!existingPromoCodes.has(promo.code)) {
        batch.set(doc(db, 'promos', promo.code), {
          ...promo,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    }

    const primaryRef = doc(db, 'admins', primaryId);
    if (!primaryAdminSnap.exists()) {
      batch.set(primaryRef, {
        id: primaryId,
        name: 'Lead Organizer',
        email: PRIMARY_ADMIN_EMAIL,
        role: 'Super Admin',
        addedBy: adminEmail || PRIMARY_ADMIN_EMAIL,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    await attachSiteSeededFlag(batch);
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'concerts/promos/admins/settings');
  }
}

export async function upsertUserProfile(
  uid: string,
  payload: Omit<UserProfile, 'uid' | 'createdAt' | 'updatedAt'>,
): Promise<void> {
  const path = `users/${uid}`;
  const ref = doc(db, 'users', uid);
  const sanitized = {
    uid,
    displayName: payload.displayName.trim().slice(0, 100) || 'Gen Z Fan',
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

export async function adminToggleCheckIn(
  booking: Booking,
  nextCheckedIn: boolean,
  approverName: string,
  method: string,
): Promise<void> {
  const path = `bookings/${booking.bookingCode}`;
  const timeStamp = nextCheckedIn
    ? new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : '';
  try {
    await updateDoc(doc(db, 'bookings', booking.bookingCode), {
      checkedIn: nextCheckedIn,
      checkedInAt: timeStamp,
      approvedBy: nextCheckedIn ? approverName.slice(0, 100) : booking.approvedBy,
      approvalMethod: nextCheckedIn ? method.slice(0, 40) : booking.approvalMethod,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function adminConfirmAndCheckIn(
  booking: Booking,
  approverName: string,
  method: string,
): Promise<void> {
  const bookingRef = doc(db, 'bookings', booking.bookingCode);
  const concertRef = doc(db, 'concerts', booking.concertId);
  const timeStamp = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  try {
    await runTransaction(db, async (tx) => {
      const freshBookingSnap = await tx.get(bookingRef);
      if (!freshBookingSnap.exists()) {
        throw new Error('Booking no longer exists.');
      }
      const freshBooking = freshBookingSnap.data() as Booking;
      const freshConcertSnap = await tx.get(concertRef);

      tx.update(bookingRef, {
        paymentStatus: 'Paid',
        checkedIn: true,
        checkedInAt: freshBooking.checkedInAt || timeStamp,
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
    });
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
          seatsLeft: Math.min(freshConcert.totalSeats, freshConcert.seatsLeft + freshBooking.quantity),
          updatedAt: serverTimestamp(),
        });
      }
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `bookings/${booking.bookingCode}`);
  }
}

export async function adminSaveConcert(
  concert: Omit<Concert, 'createdAt' | 'updatedAt'>,
  isEdit: boolean,
): Promise<void> {
  const path = `concerts/${concert.id}`;
  try {
    const batch = writeBatch(db);
    const ref = doc(db, 'concerts', concert.id);
    if (isEdit) {
      batch.update(ref, {
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
        totalSeats: concert.totalSeats,
        seatsLeft: concert.seatsLeft,
        description: concert.description,
        posterUrl: concert.posterUrl,
        updatedAt: serverTimestamp(),
      });
    } else {
      batch.set(ref, {
        ...concert,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    await attachSiteSeededFlag(batch);
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, isEdit ? OperationType.UPDATE : OperationType.CREATE, path);
  }
}

export async function adminDeleteConcert(concertId: string): Promise<void> {
  const path = `concerts/${concertId}`;
  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, 'concerts', concertId));
    await attachSiteSeededFlag(batch);
    await batch.commit();
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
    const batch = writeBatch(db);
    const ref = doc(db, 'promos', promo.code);
    if (isEdit) {
      batch.update(ref, {
        type: promo.type,
        value: promo.value,
        tiers: promo.tiers,
        label: promo.label,
        active: promo.active,
        updatedAt: serverTimestamp(),
      });
    } else {
      batch.set(ref, {
        ...promo,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    await attachSiteSeededFlag(batch);
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, isEdit ? OperationType.UPDATE : OperationType.CREATE, path);
  }
}

export async function adminDeletePromo(code: string): Promise<void> {
  const path = `promos/${code}`;
  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, 'promos', code));
    await attachSiteSeededFlag(batch);
    await batch.commit();
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
  const lower = email.toLowerCase();
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
  role: AdminRole,
): Promise<void> {
  try {
    await updateDoc(doc(db, 'adminSessions', sessionId), {
      name: name.trim().slice(0, 100) || 'Admin',
      role,
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
