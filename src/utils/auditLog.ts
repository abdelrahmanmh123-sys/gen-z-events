import type {
  AdminRole,
  AuditAction,
  AuditActor,
  AuditLogEntry,
  AuditTargetType,
  Booking,
} from '../types';
import { escapeCsvCell, getBookingCheckedInCount, toAsciiDigits } from './bookingLogic';

/**
 * Every staff action recorded in /auditLogs. MUST stay identical to the
 * `data.action in [...]` allowlist inside `isValidAuditLog` in firestore.rules
 * (guarded by auditLog.test.ts).
 */
export const AUDIT_ACTIONS: readonly AuditAction[] = [
  'payment_confirmed',
  'payment_undone',
  'payment_confirmed_checkin',
  'checkin',
  'checkin_undone',
  'booking_deleted',
  'offline_sale_created',
  'offline_import',
  'concert_created',
  'concert_updated',
  'concert_deleted',
  'promo_saved',
  'promo_toggled',
  'promo_deleted',
  'staff_saved',
  'staff_removed',
  'payment_numbers_updated',
];

/** Subset Gate Staff are allowed to record (mirrors their Firestore write permissions). */
export const GATE_STAFF_AUDIT_ACTIONS: readonly AuditAction[] = [
  'checkin',
  'checkin_undone',
  'offline_sale_created',
  'offline_import',
];

export const AUDIT_TARGET_TYPES: readonly AuditTargetType[] = [
  'booking',
  'concert',
  'promo',
  'staff',
  'paymentConfig',
  'import',
];

export type AuditCategory = 'payments' | 'checkins' | 'deletions' | 'offline' | 'settings';

export const AUDIT_ACTION_CATEGORY: Record<AuditAction, AuditCategory> = {
  payment_confirmed: 'payments',
  payment_undone: 'payments',
  payment_confirmed_checkin: 'payments',
  checkin: 'checkins',
  checkin_undone: 'checkins',
  booking_deleted: 'deletions',
  offline_sale_created: 'offline',
  offline_import: 'offline',
  concert_created: 'settings',
  concert_updated: 'settings',
  concert_deleted: 'deletions',
  promo_saved: 'settings',
  promo_toggled: 'settings',
  promo_deleted: 'deletions',
  staff_saved: 'settings',
  staff_removed: 'deletions',
  payment_numbers_updated: 'settings',
};

/** Reversals & destructive actions that deserve extra visual attention in the log. */
export const SENSITIVE_AUDIT_ACTIONS: readonly AuditAction[] = [
  'payment_undone',
  'checkin_undone',
  'booking_deleted',
  'concert_deleted',
  'promo_deleted',
  'staff_removed',
];

export const AUDIT_LOG_PAGE_SIZE = 200;
export const AUDIT_LOG_MAX_ENTRIES = 1000;

export function canRoleRecordAuditAction(role: AdminRole | null | undefined, action: AuditAction): boolean {
  if (role === 'Super Admin') return AUDIT_ACTIONS.includes(action);
  if (role === 'Gate Staff') return GATE_STAFF_AUDIT_ACTIONS.includes(action);
  return false;
}

export function isSensitiveAuditAction(action: AuditAction): boolean {
  return SENSITIVE_AUDIT_ACTIONS.includes(action);
}

export function generateAuditLogId(nowMs: number = Date.now()): string {
  const chars = 'abcdefghijkmnpqrstuvwxyz23456789';
  let suffix = '';
  const webCrypto = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
  if (webCrypto && typeof webCrypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(8);
    webCrypto.getRandomValues(bytes);
    for (let i = 0; i < 8; i++) suffix += chars[bytes[i] % chars.length];
  } else {
    for (let i = 0; i < 8; i++) suffix += chars[Math.floor(Math.random() * chars.length)];
  }
  const safeNow = Number.isFinite(nowMs) && nowMs > 0 ? Math.floor(nowMs) : Date.now();
  return `log-${safeNow.toString(36)}-${suffix}`;
}

function cleanText(value: unknown, maxLen: number): string {
  return String(value ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

export interface AuditLogInput {
  action: AuditAction;
  actor: AuditActor;
  targetType: AuditTargetType;
  targetId: string;
  targetLabel: string;
  details: string;
  amountEgp?: number;
}

/**
 * Builds a sanitized, Firestore-rules-compliant audit record (without createdAt).
 * actorUid/actorEmail must come from the signed-in Firebase Auth user.
 */
export function buildAuditLogRecord(
  input: AuditLogInput & { actorUid: string; actorEmail: string; id?: string },
): Omit<AuditLogEntry, 'createdAt'> {
  const rawAmount = Number(input.amountEgp ?? 0);
  const amountEgp = Number.isFinite(rawAmount)
    ? Math.min(50000000, Math.max(0, Math.round(rawAmount)))
    : 0;
  return {
    id: input.id || generateAuditLogId(),
    action: input.action,
    actorUid: input.actorUid,
    actorName: cleanText(input.actor.name, 100) || 'Staff',
    actorEmail: cleanText(input.actorEmail, 120).toLowerCase(),
    actorRole: input.actor.role,
    targetType: input.targetType,
    targetId: cleanText(input.targetId, 128),
    targetLabel: cleanText(input.targetLabel, 160),
    details: cleanText(input.details, 300),
    amountEgp,
  };
}

/** Compact, human-readable booking summary stored alongside booking actions. */
export function describeBookingForAudit(
  booking: Pick<
    Booking,
    'concertTitle' | 'quantity' | 'tier' | 'paymentMethod' | 'transferRef' | 'paymentStatus'
  > &
    Partial<Pick<Booking, 'checkedIn' | 'checkedInCount'>>,
  extra: ReadonlyArray<string | null | undefined | false> = [],
): string {
  const qty = Math.max(1, Math.floor(booking.quantity || 1));
  const ref = cleanText(booking.transferRef, 40);
  const parts = [
    cleanText(booking.concertTitle, 80),
    `${qty}× ${booking.tier}`,
    booking.paymentMethod,
    ref ? `Ref ${ref}` : '',
    ...extra,
  ].filter((p): p is string => typeof p === 'string' && p.trim().length > 0);
  return cleanText(parts.join(' · '), 300);
}

export function describeEntryProgress(
  booking: Pick<Booking, 'quantity' | 'checkedIn'> & Partial<Pick<Booking, 'checkedInCount'>>,
): string {
  const total = Math.max(1, Math.floor(booking.quantity || 1));
  return `Entries ${getBookingCheckedInCount(booking as Booking)}/${total}`;
}

export function getAuditTimestampMs(ts: unknown): number {
  if (ts === null || ts === undefined) return Date.now();
  if (typeof ts === 'number' && Number.isFinite(ts)) return ts;
  if (ts instanceof Date) return ts.getTime();
  if (typeof ts === 'object') {
    const maybe = ts as { toMillis?: () => number; seconds?: number };
    if (typeof maybe.toMillis === 'function') {
      const ms = maybe.toMillis();
      if (Number.isFinite(ms)) return ms;
    }
    if (typeof maybe.seconds === 'number') return maybe.seconds * 1000;
  }
  return 0;
}

export function sortAuditLogsNewestFirst<T extends Pick<AuditLogEntry, 'createdAt'>>(logs: T[]): T[] {
  return [...logs].sort((a, b) => getAuditTimestampMs(b.createdAt) - getAuditTimestampMs(a.createdAt));
}

export interface AuditLogFilter {
  category: AuditCategory | 'all';
  actorEmail: string;
  search: string;
}

export function filterAuditLogs<T extends AuditLogEntry>(logs: T[], filter: AuditLogFilter): T[] {
  const q = toAsciiDigits(filter.search).trim().toLowerCase();
  const actor = filter.actorEmail.trim().toLowerCase();
  return logs.filter((log) => {
    if (filter.category !== 'all' && AUDIT_ACTION_CATEGORY[log.action] !== filter.category) return false;
    if (actor && log.actorEmail.toLowerCase() !== actor) return false;
    if (q) {
      const hay = toAsciiDigits(
        `${log.targetId} ${log.targetLabel} ${log.details} ${log.actorName} ${log.actorEmail}`,
      ).toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function listAuditActors(logs: AuditLogEntry[]): Array<{ email: string; name: string }> {
  const map = new Map<string, string>();
  for (const log of logs) {
    const email = log.actorEmail.toLowerCase();
    if (email && !map.has(email)) map.set(email, log.actorName);
  }
  return Array.from(map.entries())
    .map(([email, name]) => ({ email, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function buildAuditLogCsv(
  logs: AuditLogEntry[],
  labelFor: (action: AuditAction) => string = (a) => a,
): string {
  const headers = ['Time (ISO)', 'Action', 'Staff', 'Staff Email', 'Role', 'Target', 'Code / ID', 'Details', 'Amount EGP'];
  const rows = logs.map((log) => [
    new Date(getAuditTimestampMs(log.createdAt)).toISOString(),
    labelFor(log.action),
    log.actorName,
    log.actorEmail,
    log.actorRole,
    log.targetLabel,
    log.targetId,
    log.details,
    log.amountEgp,
  ]);
  return [headers, ...rows].map((row) => row.map(escapeCsvCell).join(',')).join('\r\n');
}
