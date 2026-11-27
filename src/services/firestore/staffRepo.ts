import {
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { PRIMARY_ADMIN_EMAIL } from '../../data/defaults';
import type { AdminMember, AdminRole, AuditActor, UserProfile } from '../../types';
import { emailToDocId } from '../../utils/bookingLogic';
import { recordAuditLog, resolveActor } from './auditHelper';

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

export async function adminAddMember(
  name: string,
  email: string,
  role: AdminRole,
  addedBy: string,
  actor?: AuditActor,
): Promise<void> {
  const id = emailToDocId(email);
  const path = `admins/${id}`;
  const ref = doc(db, 'admins', id);
  let exists = false;
  try {
    const existing = await getDoc(ref);
    exists = existing.exists();
    const cleanName = name.trim().slice(0, 100);
    const cleanEmail = email.trim().toLowerCase().slice(0, 120);
    if (exists) {
      await updateDoc(ref, {
        name: cleanName,
        email: cleanEmail,
        role,
        addedBy: addedBy.slice(0, 120),
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        id,
        name: cleanName,
        email: cleanEmail,
        role,
        addedBy: addedBy.slice(0, 120),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    await recordAuditLog({
      action: 'staff_saved',
      actor: resolveActor(actor, undefined, 'Super Admin'),
      targetType: 'staff',
      targetId: id,
      targetLabel: cleanName,
      details: `${exists ? 'Updated' : 'Added'} ${cleanEmail} · ${role}`,
      amountEgp: 0,
    });
  } catch (error) {
    handleFirestoreError(error, exists ? OperationType.UPDATE : OperationType.CREATE, path);
  }
}

export async function adminRemoveMember(
  id: string,
  actor?: AuditActor,
  memberMeta?: Pick<AdminMember, 'name' | 'email' | 'role'>,
): Promise<void> {
  const path = `admins/${id}`;
  try {
    await deleteDoc(doc(db, 'admins', id));
    await recordAuditLog({
      action: 'staff_removed',
      actor: resolveActor(actor, undefined, 'Super Admin'),
      targetType: 'staff',
      targetId: id,
      targetLabel: memberMeta?.name || id,
      details: memberMeta
        ? `Revoked ${memberMeta.email} · ${memberMeta.role}`
        : 'Revoked staff access',
      amountEgp: 0,
    });
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
