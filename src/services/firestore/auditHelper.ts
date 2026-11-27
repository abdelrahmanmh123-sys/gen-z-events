import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db, logFirestoreError, OperationType } from '../../firebase';
import type { AdminRole, AuditActor } from '../../types';
import {
  buildAuditLogRecord,
  canRoleRecordAuditAction,
  type AuditLogInput,
} from '../../utils/auditLog';

export function resolveActor(actor?: AuditActor, fallbackName?: string, fallbackRole: AdminRole = 'Super Admin'): AuditActor {
  if (actor) return actor;
  return {
    name: fallbackName?.trim() || auth.currentUser?.displayName || auth.currentUser?.email?.split('@')[0] || 'Staff',
    role: fallbackRole,
  };
}

/**
 * Appends an immutable staff audit log document to /auditLogs/{id}.
 * Non-fatal on write error so live gate/desk operations keep working smoothly
 * even before updated Firestore rules finish propagating.
 */
export async function recordAuditLog(input: AuditLogInput): Promise<void> {
  const currentUser = auth.currentUser;
  const email = (currentUser?.email || '').trim().toLowerCase();
  if (!currentUser || !currentUser.uid || !email) return;
  if (!canRoleRecordAuditAction(input.actor.role, input.action)) return;
  const record = buildAuditLogRecord({
    ...input,
    actorUid: currentUser.uid,
    actorEmail: email,
  });
  const path = `auditLogs/${record.id}`;
  try {
    await setDoc(doc(db, 'auditLogs', record.id), {
      ...record,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    logFirestoreError(error, OperationType.CREATE, path);
  }
}
