import {
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import type { AuditAction, AuditActor, Concert, Promo, WaitlistEntry } from '../../types';
import { PAYMENT_CONFIG_DOC_ID } from '../../utils/bookingLogic';
import { recordAuditLog, resolveActor } from './auditHelper';

export async function adminSaveConcert(
  concert: Omit<Concert, 'createdAt' | 'updatedAt'>,
  isEdit: boolean,
  actor?: AuditActor,
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

    await recordAuditLog({
      action: isEdit ? 'concert_updated' : 'concert_created',
      actor: resolveActor(actor, undefined, 'Super Admin'),
      targetType: 'concert',
      targetId: concert.id,
      targetLabel: concert.title,
      details: `${concert.artist} · ${concert.isoDate} ${concert.isoTime} · ${concert.seatsLeft}/${concert.totalSeats} seats`,
      amountEgp: 0,
    });
  } catch (error) {
    handleFirestoreError(error, isEdit ? OperationType.UPDATE : OperationType.CREATE, path);
  }
}

export async function adminDeleteConcert(
  concertId: string,
  actor?: AuditActor,
  concertTitle?: string,
): Promise<void> {
  const path = `concerts/${concertId}`;
  try {
    await deleteDoc(doc(db, 'concerts', concertId));
    await recordAuditLog({
      action: 'concert_deleted',
      actor: resolveActor(actor, undefined, 'Super Admin'),
      targetType: 'concert',
      targetId: concertId,
      targetLabel: concertTitle || concertId,
      details: 'Removed concert from live lineup',
      amountEgp: 0,
    });
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
  actor?: AuditActor,
  auditAction: AuditAction = 'promo_saved',
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

    const tierText = promo.tiers.length > 0 ? promo.tiers.join(', ') : 'All Tiers';
    const detail =
      auditAction === 'promo_toggled'
        ? `${promo.active ? 'Set Live' : 'Set Hidden'} · ${promo.value}${promo.type === 'percent' ? '%' : ' EGP'} · ${tierText}`
        : `${isEdit ? 'Updated' : 'Created'} · ${promo.value}${promo.type === 'percent' ? '%' : ' EGP'} · ${tierText}`;
    await recordAuditLog({
      action: auditAction,
      actor: resolveActor(actor, undefined, 'Super Admin'),
      targetType: 'promo',
      targetId: promo.code,
      targetLabel: promo.label,
      details: detail,
      amountEgp: 0,
    });
  } catch (error) {
    handleFirestoreError(error, isEdit ? OperationType.UPDATE : OperationType.CREATE, path);
  }
}

export async function adminDeletePromo(code: string, actor?: AuditActor): Promise<void> {
  const path = `promos/${code}`;
  try {
    await deleteDoc(doc(db, 'promos', code));
    await recordAuditLog({
      action: 'promo_deleted',
      actor: resolveActor(actor, undefined, 'Super Admin'),
      targetType: 'promo',
      targetId: code,
      targetLabel: code,
      details: 'Deleted promo code',
      amountEgp: 0,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function adminSavePaymentConfig(
  payload: { instapayNumber: string; walletNumber: string },
  updatedBy: string,
  actor?: AuditActor,
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

    await recordAuditLog({
      action: 'payment_numbers_updated',
      actor: resolveActor(actor, cleanUpdatedBy, 'Super Admin'),
      targetType: 'paymentConfig',
      targetId: id,
      targetLabel: 'Payment Numbers',
      details: `InstaPay: ${cleanInstapay} · Wallet: ${cleanWallet}`,
      amountEgp: 0,
    });
  } catch (error) {
    handleFirestoreError(error, exists ? OperationType.UPDATE : OperationType.CREATE, path);
  }
}
