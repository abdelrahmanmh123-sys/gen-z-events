import type { AdminRole, AdminSession, Booking, Concert } from '../../types';

export const ADMIN_SESSION_TTL_MS = 15 * 60 * 1000;

export function emailToDocId(email: string): string {
  return email
    .trim()
    .toLowerCase()
    .replace(/@/g, '_at_')
    .replace(/\./g, '_dot_')
    .replace(/[^a-z0-9_-]/g, '_');
}

export function sanitizeId(raw: string, fallbackPrefix = 'item'): string {
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  if (cleaned.length >= 2) return cleaned;
  return `${fallbackPrefix}-${Math.random().toString(36).slice(2, 8)}`;
}

export function generateBookingCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  const webCrypto = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
  if (webCrypto && typeof webCrypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(6);
    webCrypto.getRandomValues(bytes);
    for (let i = 0; i < 6; i++) {
      suffix += chars[bytes[i] % chars.length];
    }
  } else {
    for (let i = 0; i < 6; i++) {
      suffix += chars[Math.floor(Math.random() * chars.length)];
    }
  }
  return `GZ-${suffix}`;
}

export function getBookingCheckedInCount(
  booking: Pick<Booking, 'quantity' | 'checkedIn' | 'checkedInCount'>,
): number {
  const total = Math.max(1, Math.floor(Number(booking.quantity) || 1));
  if (typeof booking.checkedInCount === 'number' && Number.isFinite(booking.checkedInCount)) {
    return Math.max(0, Math.min(total, Math.floor(booking.checkedInCount)));
  }
  return booking.checkedIn ? total : 0;
}

export function getBookingRemainingEntries(
  booking: Pick<Booking, 'quantity' | 'checkedIn' | 'checkedInCount'>,
): number {
  const total = Math.max(1, Math.floor(Number(booking.quantity) || 1));
  return Math.max(0, total - getBookingCheckedInCount(booking));
}

export function isBookingFullyCheckedIn(
  booking: Pick<Booking, 'quantity' | 'checkedIn' | 'checkedInCount'>,
): boolean {
  const total = Math.max(1, Math.floor(Number(booking.quantity) || 1));
  return getBookingCheckedInCount(booking) >= total;
}

export function formatCheckInProgress(checkedInCount: number, quantity: number): string {
  const total = Math.max(1, Math.floor(Number(quantity) || 1));
  const count = Math.max(0, Math.min(total, Math.floor(Number(checkedInCount) || 0)));
  return `(${count}/${total})`;
}

export function computeRestoredSeatsLeft(
  currentSeatsLeft: number,
  totalSeats: number,
  quantity: number,
): number {
  const safeTotal = Math.max(0, Math.floor(Number(totalSeats) || 0));
  const safeCurrent = Math.max(0, Math.floor(Number(currentSeatsLeft) || 0));
  const safeQty = Math.max(0, Math.floor(Number(quantity) || 0));
  return Math.min(safeTotal, safeCurrent + safeQty);
}

export function buildUndoPaymentPatch(): {
  paymentStatus: 'Pending';
  checkedIn: false;
  checkedInCount: 0;
  checkedInAt: '';
  approvedBy: '';
  approvalMethod: '';
} {
  return {
    paymentStatus: 'Pending',
    checkedIn: false,
    checkedInCount: 0,
    checkedInAt: '',
    approvedBy: '',
    approvalMethod: '',
  };
}

export function canDisplayBookingQr(
  booking: Pick<Booking, 'paymentStatus'> | null | undefined,
): boolean {
  return Boolean(booking && booking.paymentStatus === 'Paid');
}

export function computeAdminKpis(concerts: Concert[], bookings: Booking[]) {
  const liveEvents = concerts.length;
  const seatsRemaining = concerts.reduce((sum, c) => sum + Math.max(0, c.seatsLeft), 0);
  const paidBookings = bookings.filter((b) => b.paymentStatus === 'Paid');
  const pendingPayments = bookings.filter((b) => b.paymentStatus === 'Pending').length;
  const checkedIn = bookings.reduce((sum, b) => sum + getBookingCheckedInCount(b), 0);
  const ticketsSold = paidBookings.reduce((sum, b) => sum + b.quantity, 0);
  const totalRevenueEgp = paidBookings.reduce((sum, b) => sum + b.totalEgp, 0);
  return {
    liveEvents,
    seatsRemaining,
    checkedIn,
    ticketsSold,
    totalRevenueEgp,
    pendingPayments,
  };
}

export type AdminTab =
  | 'dashboard'
  | 'checkin'
  | 'offline'
  | 'schedule'
  | 'manage'
  | 'promos'
  | 'team'
  | 'audit';

export interface StaffPermissions {
  isSuperAdmin: boolean;
  isGateStaff: boolean;
  allowedTabs: AdminTab[];
  defaultTab: AdminTab;
  canGateCheckIn: boolean;
  canConfirmPayments: boolean;
  canUndoPayments: boolean;
  canDeleteBookings: boolean;
  canAccessOfflineTickets: boolean;
  canViewRecentApprovals: boolean;
  canViewRevenueAnalytics: boolean;
  canManageConcerts: boolean;
  canManagePromos: boolean;
  canManageTeam: boolean;
  canViewAuditLog: boolean;
}

/**
 * Resolves strict Role-Based Access Control (RBAC) capabilities for the Staff Portal.
 * - Super Admin: Full access across all 8 tabs, payment confirmation/undo, deletions, team management, and audit log.
 * - Gate Staff: Strictly restricted to Gate QR Check-In (check-in only, no payment confirmation/undo or deletion),
 *   Offline Tickets, and Recent Payment & Gate Approvals log.
 */
export function getStaffPermissions(role: AdminRole | null | undefined): StaffPermissions {
  if (role === 'Super Admin') {
    return {
      isSuperAdmin: true,
      isGateStaff: false,
      allowedTabs: ['dashboard', 'checkin', 'offline', 'schedule', 'manage', 'promos', 'team', 'audit'],
      defaultTab: 'dashboard',
      canGateCheckIn: true,
      canConfirmPayments: true,
      canUndoPayments: true,
      canDeleteBookings: true,
      canAccessOfflineTickets: true,
      canViewRecentApprovals: true,
      canViewRevenueAnalytics: true,
      canManageConcerts: true,
      canManagePromos: true,
      canManageTeam: true,
      canViewAuditLog: true,
    };
  }
  if (role === 'Gate Staff') {
    return {
      isSuperAdmin: false,
      isGateStaff: true,
      allowedTabs: ['checkin', 'offline', 'dashboard'],
      defaultTab: 'checkin',
      canGateCheckIn: true,
      canConfirmPayments: false,
      canUndoPayments: false,
      canDeleteBookings: false,
      canAccessOfflineTickets: true,
      canViewRecentApprovals: true,
      canViewRevenueAnalytics: false,
      canManageConcerts: false,
      canManagePromos: false,
      canManageTeam: false,
      canViewAuditLog: false,
    };
  }
  return {
    isSuperAdmin: false,
    isGateStaff: false,
    allowedTabs: [],
    defaultTab: 'checkin',
    canGateCheckIn: false,
    canConfirmPayments: false,
    canUndoPayments: false,
    canDeleteBookings: false,
    canAccessOfflineTickets: false,
    canViewRecentApprovals: false,
    canViewRevenueAnalytics: false,
    canManageConcerts: false,
    canManagePromos: false,
    canManageTeam: false,
    canViewAuditLog: false,
  };
}

export function canAccessAdminTab(role: AdminRole | null | undefined, tab: AdminTab): boolean {
  return getStaffPermissions(role).allowedTabs.includes(tab);
}

function extractTimestampMillis(ts: unknown): number {
  if (ts === null || ts === undefined) return Number.MAX_SAFE_INTEGER;
  if (typeof ts === 'number' && Number.isFinite(ts)) return ts;
  if (ts instanceof Date) return ts.getTime();
  if (typeof ts === 'object') {
    const maybe = ts as { toMillis?: () => number; seconds?: number };
    if (typeof maybe.toMillis === 'function') {
      return maybe.toMillis();
    }
    if (typeof maybe.seconds === 'number') {
      return maybe.seconds * 1000;
    }
  }
  return 0;
}

export function sortByCreatedAtDesc<T extends { createdAt?: unknown }>(items: T[]): T[] {
  return [...items].sort(
    (a, b) => extractTimestampMillis(b.createdAt) - extractTimestampMillis(a.createdAt),
  );
}

export function sortByUpdatedAtDesc<T extends { updatedAt?: unknown; createdAt?: unknown }>(
  items: T[],
): T[] {
  return [...items].sort(
    (a, b) =>
      extractTimestampMillis(b.updatedAt ?? b.createdAt) -
      extractTimestampMillis(a.updatedAt ?? a.createdAt),
  );
}

/**
 * Maps raw Firebase Auth / Firestore / transaction errors into safe, user-facing English strings.
 * Unwraps structured JSON payloads produced by handleFirestoreError() so internal authInfo
 * (userId, email, document paths) is never leaked into UI toasts.
 */

export function isAdminSessionActive(
  session: Pick<AdminSession, 'lastSeen' | 'createdAt'>,
  nowMs = Date.now(),
  ttlMs = ADMIN_SESSION_TTL_MS,
): boolean {
  const ts = session.lastSeen ?? session.createdAt;
  if (ts === null || ts === undefined) return true;
  const seenMs = extractTimestampMillis(ts);
  if (seenMs === Number.MAX_SAFE_INTEGER) return true;
  return nowMs - seenMs <= ttlMs;
}

export function partitionAdminSessions(
  sessions: AdminSession[],
  nowMs = Date.now(),
  ttlMs = ADMIN_SESSION_TTL_MS,
): { active: AdminSession[]; stale: AdminSession[] } {
  const active: AdminSession[] = [];
  const stale: AdminSession[] = [];
  for (const session of sessions) {
    if (isAdminSessionActive(session, nowMs, ttlMs)) {
      active.push(session);
    } else {
      stale.push(session);
    }
  }
  return { active, stale };
}

/**
 * Returns an upcoming YYYY-MM-DD date offset from `now` by `daysAhead`.
 */
