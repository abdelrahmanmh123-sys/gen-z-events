import { PAYMENT_PHONE_NUMBER } from '../data/defaults';
import type {
  AdminRole,
  AdminSession,
  Booking,
  Concert,
  PaymentConfig,
  Promo,
  SortOption,
  TierColors,
  TierId,
  TierPrices,
} from '../types';

export const MAX_QTY_PER_ORDER = 20;
export const MAX_POSTER_DATA_URL_LENGTH = 390000;
export const ADMIN_SESSION_TTL_MS = 15 * 60 * 1000;

export function emailToDocId(email: string): string {
  return email
    .trim()
    .toLowerCase()
    .replace(/@/g, '_at_')
    .replace(/\./g, '_dot_')
    .replace(/[^a-z0-9_\-]/g, '_');
}

export function sanitizeId(raw: string, fallbackPrefix = 'item'): string {
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_\-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  if (cleaned.length >= 2) return cleaned;
  return `${fallbackPrefix}-${Math.random().toString(36).slice(2, 8)}`;
}

export function suggestTierPrices(silverPrice: number): TierPrices {
  const base = Math.max(50, Math.round(Number(silverPrice) || 200));
  const roundTen = (n: number) => Math.max(10, Math.round(n / 10) * 10);
  return {
    Silver: base,
    Gold: roundTen(base * 1.45),
    VIP: roundTen(base * 2.1),
    Lounge: roundTen(base * 3.2),
  };
}

export function getTierUnitPrice(concert: Pick<Concert, 'priceEgp' | 'tierPrices'>, tier: TierId): number {
  const mapped = concert.tierPrices?.[tier];
  if (typeof mapped === 'number' && Number.isFinite(mapped) && mapped >= 0) {
    return mapped;
  }
  const fallback = suggestTierPrices(concert.priceEgp);
  return fallback[tier];
}

export const ALL_PROMO_TIERS: readonly TierId[] = ['Silver', 'Gold', 'VIP', 'Lounge'];

export function normalizePromoTiers(tiers: readonly TierId[]): TierId[] {
  const validSet = new Set<TierId>();
  for (const tier of tiers) {
    if (ALL_PROMO_TIERS.includes(tier)) {
      validSet.add(tier);
    }
  }
  if (validSet.size === 0 || validSet.size === ALL_PROMO_TIERS.length) {
    return [];
  }
  return ALL_PROMO_TIERS.filter((tier) => validSet.has(tier));
}

export function togglePromoTier(currentTiers: readonly TierId[], tier: TierId): TierId[] {
  const normalized = normalizePromoTiers(currentTiers);
  if (normalized.length === 0) {
    return ALL_PROMO_TIERS.includes(tier) ? [tier] : [];
  }
  if (normalized.includes(tier)) {
    return normalizePromoTiers(normalized.filter((item) => item !== tier));
  }
  return normalizePromoTiers([...normalized, tier]);
}

function formatTierIdListEn(tiers: readonly TierId[]): string {
  if (tiers.length <= 1) return tiers[0] ?? '';
  if (tiers.length === 2) return `${tiers[0]} & ${tiers[1]}`;
  return `${tiers.slice(0, -1).join(', ')} & ${tiers[tiers.length - 1]}`;
}

export interface PromoEvaluation {
  valid: boolean;
  code: string;
  discountEgp: number;
  message: string;
  promo: Promo | null;
}

export function evaluatePromo(
  rawCode: string,
  tier: TierId,
  subtotalEgp: number,
  promos: Promo[],
): PromoEvaluation {
  const code = rawCode.trim().toUpperCase();
  if (!code) {
    return { valid: false, code: '', discountEgp: 0, message: '', promo: null };
  }
  const found = promos.find((p) => p.code.toUpperCase() === code && p.active);
  if (!found) {
    return {
      valid: false,
      code,
      discountEgp: 0,
      message: 'Promo code is invalid or currently inactive.',
      promo: null,
    };
  }
  const scopedTiers = Array.isArray(found.tiers) ? normalizePromoTiers(found.tiers) : [];
  if (scopedTiers.length > 0 && !scopedTiers.includes(tier)) {
    return {
      valid: false,
      code,
      discountEgp: 0,
      message: `${found.code} applies only to ${formatTierIdListEn(scopedTiers)} passes.`,
      promo: null,
    };
  }
  const rawDiscount =
    found.type === 'percent'
      ? Math.round((subtotalEgp * Math.min(90, found.value)) / 100)
      : Math.round(found.value);
  const discountEgp = Math.max(0, Math.min(subtotalEgp, rawDiscount));
  return {
    valid: true,
    code: found.code,
    discountEgp,
    message: `${found.label} applied (-${discountEgp.toLocaleString()} EGP)`,
    promo: found,
  };
}

export function calculateOrderTotals(
  concert: Pick<Concert, 'priceEgp' | 'tierPrices'>,
  tier: TierId,
  quantity: number,
  promoCode: string,
  promos: Promo[],
) {
  const safeQty = Math.max(1, Math.min(MAX_QTY_PER_ORDER, Math.floor(quantity || 1)));
  const unitPrice = getTierUnitPrice(concert, tier);
  const subtotalEgp = unitPrice * safeQty;
  const promoResult = evaluatePromo(promoCode, tier, subtotalEgp, promos);
  const discountEgp = promoResult.valid ? promoResult.discountEgp : 0;
  const totalEgp = Math.max(0, subtotalEgp - discountEgp);
  return {
    quantity: safeQty,
    unitPrice,
    subtotalEgp,
    discountEgp,
    totalEgp,
    promoResult,
  };
}

export function isSafeHttpsUrl(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const trimmed = raw.trim();
  if (!trimmed.startsWith('https://')) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' && parsed.hostname.length > 0;
  } catch {
    return false;
  }
}

export function isSafeImageUrl(raw: string | null | undefined): boolean {
  if (!raw) return true;
  const trimmed = raw.trim();
  if (trimmed === '') return true;
  if (trimmed.length > MAX_POSTER_DATA_URL_LENGTH) return false;
  if (isSafeHttpsUrl(trimmed)) return true;
  if (/^\/assets\/[a-zA-Z0-9_./\-]+$/.test(trimmed) && !trimmed.includes('..')) return true;
  if (/^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(trimmed)) return true;
  return false;
}

export function sanitizeSpreadsheetCell(value: unknown): string {
  const str = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(str)) {
    return `'${str}`;
  }
  return str;
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

export function formatDateTimeDisplay(isoDate: string, isoTime: string): {
  date: string;
  time: string;
  doors: string;
} {
  const safeDate = /^\d{4}-\d{2}-\d{2}$/.test(isoDate) ? isoDate : '2026-12-04';
  const safeTime = /^\d{2}:\d{2}$/.test(isoTime) ? isoTime : '20:00';
  const [y, m, d] = safeDate.split('-').map(Number);
  const [hh, mm] = safeTime.split(':').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, hh, mm));
  const dateStr = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(dt);

  const format12 = (hours: number, mins: number) => {
    const period = hours >= 12 ? 'PM' : 'AM';
    const h12 = hours % 12 === 0 ? 12 : hours % 12;
    return `${h12}:${String(mins).padStart(2, '0')} ${period}`;
  };

  const doorsTotalMins = ((hh * 60 + mm - 90) % 1440 + 1440) % 1440;
  const doorsH = Math.floor(doorsTotalMins / 60);
  const doorsM = doorsTotalMins % 60;

  return {
    date: dateStr,
    time: format12(hh, mm),
    doors: format12(doorsH, doorsM),
  };
}

export function computeCountdown(isoDate: string, isoTime: string, nowMs = Date.now()) {
  const targetMs = new Date(`${isoDate}T${isoTime || '20:00'}:00+02:00`).getTime();
  const diff = targetMs - nowMs;
  if (!Number.isFinite(diff) || diff <= 0) {
    return { days: 0, hours: 0, mins: 0, secs: 0, isPast: true };
  }
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  const secs = Math.floor((diff % 60000) / 1000);
  return { days, hours, mins, secs, isPast: false };
}

export function filterAndSortConcerts(
  concerts: Concert[],
  opts: {
    search: string;
    genre: string;
    sortBy: SortOption;
    savedOnly: boolean;
    favorites: string[];
  },
): Concert[] {
  const q = opts.search.trim().toLowerCase();
  const favSet = new Set(opts.favorites);

  const filtered = concerts.filter((c) => {
    if (opts.savedOnly && !favSet.has(c.id)) return false;
    if (opts.genre !== 'All' && c.genre !== opts.genre) return false;
    if (q) {
      const hay = `${c.title} ${c.artist} ${c.venue} ${c.genre} ${c.description}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  return [...filtered].sort((a, b) => {
    if (opts.sortBy === 'price-asc') {
      return getTierUnitPrice(a, 'Silver') - getTierUnitPrice(b, 'Silver');
    }
    if (opts.sortBy === 'price-desc') {
      return getTierUnitPrice(b, 'Silver') - getTierUnitPrice(a, 'Silver');
    }
    return `${a.isoDate}T${a.isoTime}`.localeCompare(`${b.isoDate}T${b.isoTime}`);
  });
}

export interface BookingInputValidation {
  valid: boolean;
  error?: string;
}

export function validateBookingInput(input: {
  customerName: string;
  customerMobile: string;
  customerEmail: string;
  transferRef: string;
  quantity: number;
  seatsLeft: number;
}): BookingInputValidation {
  const name = input.customerName.trim();
  const mobileCheck = validateEgyptianMobile(input.customerMobile, true);
  const email = input.customerEmail.trim();
  const ref = input.transferRef.trim();

  if (name.length < 2 || name.length > 100) {
    return { valid: false, error: 'Please enter your full name (2–100 characters).' };
  }
  if (!mobileCheck.valid) {
    return { valid: false, error: mobileCheck.error || 'Please enter a valid Egyptian mobile number.' };
  }
  const emailCheck = validateEmailAddress(email, { allowDisposable: true });
  if (!emailCheck.valid) {
    return { valid: false, error: 'Please enter a valid email address.' };
  }
  if (ref.length < 3 || ref.length > 80) {
    return { valid: false, error: 'Please enter your InstaPay / Wallet transfer reference or sender number.' };
  }
  if (input.quantity < 1 || input.quantity > MAX_QTY_PER_ORDER) {
    return { valid: false, error: `Quantity must be between 1 and ${MAX_QTY_PER_ORDER}.` };
  }
  if (input.quantity > input.seatsLeft) {
    return {
      valid: false,
      error: 'That ticket quantity is not currently available for this show. Try selecting fewer passes.',
    };
  }
  return { valid: true };
}

export function validateWaitlistInput(input: {
  name: string;
  mobile: string;
  email: string;
}): { valid: boolean; error?: string; normalized?: { name: string; mobile: string; email: string } } {
  const cleanName = input.name.trim().replace(/\s+/g, ' ');
  if (cleanName.length < 2 || cleanName.length > 100) {
    return { valid: false, error: 'Please enter your full name (2–100 characters).' };
  }
  const mobileCheck = validateEgyptianMobile(input.mobile, true);
  if (!mobileCheck.valid) {
    return { valid: false, error: mobileCheck.error || 'Please enter a valid Egyptian mobile number.' };
  }
  const cleanEmail = input.email.trim().toLowerCase();
  if (cleanEmail.length > 0) {
    const emailCheck = validateEmailAddress(cleanEmail, { allowDisposable: true });
    if (!emailCheck.valid) {
      return { valid: false, error: 'Please enter a valid email address or leave it blank.' };
    }
  }
  return {
    valid: true,
    normalized: {
      name: cleanName,
      mobile: mobileCheck.normalized,
      email: cleanEmail,
    },
  };
}

export function escapeCsvCell(val: unknown): string {
  let str = String(val ?? '');
  // Guard against spreadsheet formula injection while keeping single '-' placeholder intact
  if (str !== '-' && /^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function buildAttendeesCsv(bookings: Booking[]): string {
  const headers = [
    'Booking Code',
    'Concert',
    'Date',
    'Venue',
    'Tier',
    'Qty',
    'Total EGP',
    'Promo',
    'Payment Method',
    'Transfer Ref',
    'Payment Status',
    'Checked In',
    'Checked In At',
    'Approved By',
    'Approval Method',
    'Customer Name',
    'Mobile',
    'Email',
  ];
  const rows = bookings.map((b) =>
    [
      b.bookingCode,
      b.concertTitle,
      b.concertDate,
      b.concertVenue,
      b.tier,
      b.quantity,
      b.totalEgp,
      b.promoCode || '-',
      b.paymentMethod,
      b.transferRef,
      b.paymentStatus,
      (() => {
        const total = Math.max(1, Math.floor(b.quantity || 1));
        const count = getBookingCheckedInCount(b);
        if (total > 1) return count > 0 ? `${count}/${total}` : `0/${total}`;
        return count > 0 ? 'Yes' : 'No';
      })(),
      b.checkedInAt || '-',
      b.approvedBy || '-',
      b.approvalMethod || '-',
      b.customerName,
      b.customerMobile,
      b.customerEmail,
    ]
      .map(escapeCsvCell)
      .join(','),
  );
  return [headers.join(','), ...rows].join('\r\n');
}

export function buildCalendarIcs(booking: Booking, concert?: Concert): string {
  const rawDate = concert?.isoDate && /^\d{4}-\d{2}-\d{2}$/.test(concert.isoDate) ? concert.isoDate : '2026-12-04';
  const rawTime = concert?.isoTime && /^\d{2}:\d{2}$/.test(concert.isoTime) ? concert.isoTime : '20:00';
  const [y, m, d] = rawDate.split('-').map(Number);
  const [hh, mm] = rawTime.split(':').map(Number);
  const startDt = new Date(Date.UTC(y, m - 1, d, hh, mm, 0));
  const endDt = new Date(startDt.getTime() + 3 * 60 * 60 * 1000);

  const fmtStamp = (dt: Date) =>
    `${dt.getUTCFullYear()}${String(dt.getUTCMonth() + 1).padStart(2, '0')}${String(dt.getUTCDate()).padStart(2, '0')}T${String(dt.getUTCHours()).padStart(2, '0')}${String(dt.getUTCMinutes()).padStart(2, '0')}00`;

  const startStamp = fmtStamp(startDt);
  const endStamp = fmtStamp(endDt);

  const esc = (s: string) => s.replace(/[,;\\]/g, (m) => `\\${m}`).replace(/\n/g, '\\n');

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Gen Z Events Qena//Concert E-Pass//EN',
    'BEGIN:VEVENT',
    `UID:${booking.bookingCode}@genzevents.eg`,
    `DTSTART:${startStamp}`,
    `DTEND:${endStamp}`,
    `SUMMARY:${esc(`${booking.concertTitle} — ${booking.tier} Pass (${booking.quantity}x)`)}`,
    `LOCATION:${esc(`${booking.concertVenue}, Qena, Egypt`)}`,
    `DESCRIPTION:${esc(`Booking Code: ${booking.bookingCode} | Status: ${booking.paymentStatus} | Holder: ${booking.customerName}`)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
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

export interface SignupValidationResult {
  valid: boolean;
  error?: string;
  normalized?: {
    fullName: string;
    email: string;
    mobile: string;
  };
}

export interface PasswordStrengthResult {
  minLength: boolean;
  hasLetter: boolean;
  hasNumber: boolean;
  notCommon: boolean;
  valid: boolean;
}

const BLOCKED_EMAIL_DOMAINS = new Set([
  'example.com',
  'example.org',
  'example.net',
  'test.com',
  'test.org',
  'test.net',
  'fake.com',
  'fake.org',
  'asdf.com',
  'qwerty.com',
  'invalid.com',
  'none.com',
  'null.com',
  'localhost',
  'mailinator.com',
  'tempmail.com',
  'temp-mail.org',
  'guerrillamail.com',
  'yopmail.com',
  '10minutemail.com',
  'trashmail.com',
  'sharklasers.com',
  'throwaway.email',
]);

const BLOCKED_NAME_WORDS = new Set([
  'test',
  'testing',
  'asdf',
  'asdfgh',
  'qwerty',
  'zxcvbn',
  'fake',
  'admin',
  'user',
  'guest',
  'none',
  'null',
  'undefined',
  'unknown',
  'anonymous',
  'abcd',
  'abcde',
  'xyz',
  'foo',
  'bar',
  'spam',
  'dummy',
]);

const COMMON_WEAK_PASSWORDS = new Set([
  'password',
  'password1',
  'password123',
  '12345678',
  '123456789',
  '1234567890',
  'qwerty123',
  'qwertyui',
  'abcd1234',
  'abc12345',
  '00000000',
  '11111111',
  'letmein1',
  'welcome1',
  'admin123',
  'iloveyou1',
]);

export function toAsciiDigits(raw: string): string {
  return raw
    .replace(/[٠-٩]/g, (ch) => String(ch.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (ch) => String(ch.charCodeAt(0) - 0x06f0));
}

export function normalizeEgyptianMobile(raw: string): string {
  const cleaned = toAsciiDigits(raw).trim().replace(/[\s\-()]/g, '');
  if (cleaned.startsWith('+200') && cleaned.length === 14) {
    return cleaned.slice(3);
  }
  if (cleaned.startsWith('+20')) {
    return `0${cleaned.slice(3)}`;
  }
  if (cleaned.startsWith('00200') && cleaned.length === 15) {
    return cleaned.slice(4);
  }
  if (cleaned.startsWith('0020')) {
    return `0${cleaned.slice(4)}`;
  }
  if (/^2001[0125]\d{8}$/.test(cleaned)) {
    return cleaned.slice(2);
  }
  if (/^201[0125]\d{8}$/.test(cleaned)) {
    return `0${cleaned.slice(2)}`;
  }
  if (/^1[0125]\d{8}$/.test(cleaned)) {
    return `0${cleaned}`;
  }
  return cleaned;
}

export interface AuthUserLike {
  isAnonymous?: boolean;
  emailVerified?: boolean;
  email?: string | null;
}

export function isVerifiedFanAccount(user: AuthUserLike | null | undefined): boolean {
  if (!user || user.isAnonymous) return false;
  return Boolean(user.emailVerified && typeof user.email === 'string' && user.email.trim().length >= 5);
}

export function isPendingEmailVerification(user: AuthUserLike | null | undefined): boolean {
  if (!user || user.isAnonymous) return false;
  return !isVerifiedFanAccount(user);
}

export function isEmailVerifiedAdminCandidate(user: AuthUserLike | null | undefined): boolean {
  return isVerifiedFanAccount(user);
}

export function validateFullName(raw: string): { valid: boolean; normalized: string; error?: string } {
  const normalized = raw.trim().replace(/\s+/g, ' ');
  if (normalized.length < 4 || normalized.length > 60) {
    return { valid: false, normalized, error: 'Enter your real first and last name (4–60 characters).' };
  }
  // Allow Unicode letters (Latin + Arabic), spaces, hyphens, and apostrophes only
  if (!/^[\p{L}][\p{L}\s'\-]*[\p{L}]$/u.test(normalized)) {
    return {
      valid: false,
      normalized,
      error: 'Full name can only contain letters, spaces, hyphens, or apostrophes (no numbers or symbols).',
    };
  }
  const parts = normalized.split(' ').filter(Boolean);
  if (parts.length < 2) {
    return { valid: false, normalized, error: 'Please enter both your first and last name.' };
  }
  for (const part of parts) {
    const lettersOnly = part.replace(/['\-]/g, '');
    if (lettersOnly.length < 2) {
      return { valid: false, normalized, error: 'Each part of your name must be at least 2 letters.' };
    }
    if (/(.)\1{2,}/iu.test(lettersOnly)) {
      return { valid: false, normalized, error: 'Please enter a real name without repeated filler letters.' };
    }
    if (BLOCKED_NAME_WORDS.has(lettersOnly.toLowerCase())) {
      return { valid: false, normalized, error: 'Please enter your real full name rather than placeholder text.' };
    }
  }
  return { valid: true, normalized };
}

export function validateEgyptianMobile(
  raw: string,
  required = true,
): { valid: boolean; normalized: string; error?: string } {
  const normalized = normalizeEgyptianMobile(raw);
  if (!normalized) {
    if (!required) return { valid: true, normalized: '' };
    return { valid: false, normalized: '', error: 'Enter your Egyptian mobile number.' };
  }
  if (!/^01[0125]\d{8}$/.test(normalized)) {
    return {
      valid: false,
      normalized,
      error: 'Enter a valid 11-digit Egyptian mobile number starting with 010, 011, 012, or 015.',
    };
  }
  if (/^01[0125](\d)\1{7}$/.test(normalized)) {
    return {
      valid: false,
      normalized,
      error: 'Please enter your real mobile number rather than repeated digits.',
    };
  }
  return { valid: true, normalized };
}

export function validateEmailAddress(
  raw: string,
  opts: { allowDisposable?: boolean } = {},
): { valid: boolean; normalized: string; error?: string } {
  const normalized = raw.trim().toLowerCase();
  if (!normalized || normalized.length > 120) {
    return { valid: false, normalized, error: 'Please enter a valid email address.' };
  }
  if (!/^[a-z0-9](?:[a-z0-9._%+\-]{0,62}[a-z0-9])?@(?:[a-z0-9](?:[a-z0-9\-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/.test(normalized)) {
    return { valid: false, normalized, error: 'Please enter a properly formatted email address.' };
  }
  if (normalized.includes('..')) {
    return { valid: false, normalized, error: 'Email address cannot contain consecutive dots.' };
  }
  const domain = normalized.split('@')[1] || '';
  if (!opts.allowDisposable && BLOCKED_EMAIL_DOMAINS.has(domain)) {
    return {
      valid: false,
      normalized,
      error: 'Please use a real personal email address (test or temporary email domains are not accepted).',
    };
  }
  return { valid: true, normalized };
}

export function evaluatePasswordStrength(password: string): PasswordStrengthResult {
  const minLength = password.length >= 8;
  const hasLetter = /[A-Za-z]/.test(password);
  const hasNumber = /\d/.test(password);
  const lower = password.trim().toLowerCase();
  const notCommon =
    lower.length > 0 &&
    !COMMON_WEAK_PASSWORDS.has(lower) &&
    !/^(.)\1+$/.test(password);
  return {
    minLength,
    hasLetter,
    hasNumber,
    notCommon,
    valid: minLength && hasLetter && hasNumber && notCommon,
  };
}

export function validateSignupInput(input: {
  fullName: string;
  email: string;
  password: string;
  confirmPassword: string;
  mobile: string;
}): SignupValidationResult {
  const nameCheck = validateFullName(input.fullName);
  if (!nameCheck.valid) {
    return { valid: false, error: nameCheck.error };
  }

  const mobileCheck = validateEgyptianMobile(input.mobile, true);
  if (!mobileCheck.valid) {
    return { valid: false, error: mobileCheck.error };
  }

  const emailCheck = validateEmailAddress(input.email);
  if (!emailCheck.valid) {
    return { valid: false, error: emailCheck.error };
  }

  const pwCheck = evaluatePasswordStrength(input.password);
  if (!pwCheck.minLength) {
    return { valid: false, error: 'Password must be at least 8 characters long.' };
  }
  if (!pwCheck.hasLetter || !pwCheck.hasNumber) {
    return { valid: false, error: 'Password must include both letters and at least one number.' };
  }
  if (!pwCheck.notCommon) {
    return { valid: false, error: 'Choose a stronger password — avoid common or repeated patterns.' };
  }
  if (input.password !== input.confirmPassword) {
    return { valid: false, error: 'Passwords do not match.' };
  }

  return {
    valid: true,
    normalized: {
      fullName: nameCheck.normalized,
      email: emailCheck.normalized,
      mobile: mobileCheck.normalized,
    },
  };
}

export function validateProfileUpdateInput(input: {
  displayName: string;
  mobile: string;
  city: string;
  bio: string;
}): {
  valid: boolean;
  error?: string;
  normalized?: { displayName: string; mobile: string; city: string; bio: string };
} {
  const nameCheck = validateFullName(input.displayName);
  if (!nameCheck.valid) {
    return { valid: false, error: nameCheck.error };
  }
  const mobileCheck = validateEgyptianMobile(input.mobile, false);
  if (!mobileCheck.valid) {
    return { valid: false, error: mobileCheck.error };
  }
  const cleanCity = input.city.trim().replace(/\s+/g, ' ');
  if (cleanCity.length < 2 || cleanCity.length > 60 || !/^[\p{L}\s'\-]+$/u.test(cleanCity)) {
    return { valid: false, error: 'Enter a valid city name (letters only, 2–60 characters).' };
  }
  const cleanBio = input.bio.trim().slice(0, 300);
  return {
    valid: true,
    normalized: {
      displayName: nameCheck.normalized,
      mobile: mobileCheck.normalized,
      city: cleanCity,
      bio: cleanBio,
    },
  };
}

/**
 * Picks the earliest concert whose start time is still in the future.
 * Falls back to the most recent scheduled concert only if all shows are in the past.
 */
export function getNextUpcomingConcert(concerts: Concert[], nowMs = Date.now()): Concert | null {
  if (concerts.length === 0) return null;
  const sorted = [...concerts].sort((a, b) =>
    `${a.isoDate}T${a.isoTime}`.localeCompare(`${b.isoDate}T${b.isoTime}`),
  );
  const upcoming = sorted.find((c) => !computeCountdown(c.isoDate, c.isoTime, nowMs).isPast);
  return upcoming || sorted[sorted.length - 1] || null;
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
export function formatFriendlyFirebaseError(error: unknown): string {
  const rawOriginal = error instanceof Error ? error.message : String(error ?? '');
  let raw = rawOriginal.trim();

  // Safely unwrap JSON-serialized FirestoreErrorInfo emitted by handleFirestoreError
  if (raw.startsWith('{') && raw.endsWith('}')) {
    try {
      const parsed = JSON.parse(raw) as { error?: unknown };
      if (typeof parsed?.error === 'string' && parsed.error.trim().length > 0) {
        raw = parsed.error.trim();
      }
    } catch {
      // Not valid JSON; keep original string
    }
  }

  if (raw.includes('auth/operation-not-allowed')) {
    return 'Email/Password sign-in is not enabled yet in Firebase Console. Enable Email/Password under Authentication -> Sign-in method, or use Continue with Google.';
  }
  if (raw.includes('auth/unauthorized-domain')) {
    return 'This app domain must be added under Firebase Console -> Authentication -> Settings -> Authorized domains.';
  }
  if (raw.includes('auth/email-already-in-use')) {
    return 'An account with this email already exists. Try signing in instead.';
  }
  if (
    raw.includes('auth/invalid-credential') ||
    raw.includes('auth/wrong-password') ||
    raw.includes('auth/user-not-found')
  ) {
    return 'Invalid email or password. Double-check your credentials and try again.';
  }
  if (raw.includes('auth/weak-password')) {
    return 'Password must be at least 8 characters long and include both letters and numbers.';
  }
  if (raw.includes('auth/invalid-email')) {
    return 'Please enter a valid email address.';
  }
  if (raw.includes('auth/popup-closed-by-user') || raw.includes('auth/cancelled-popup-request')) {
    return 'Sign-in popup was closed before completing.';
  }
  if (raw.includes('auth/popup-blocked')) {
    return 'Your browser blocked the sign-in popup. Please allow popups for this site or sign in with Email & Password.';
  }
  if (raw.includes('auth/network-request-failed')) {
    return 'Network error while connecting to authentication service. Check your internet connection and try again.';
  }
  if (raw.includes('auth/user-disabled')) {
    return 'This account has been disabled. Please contact Gen Z Events support.';
  }
  if (raw.includes('auth/too-many-requests')) {
    return 'Too many attempts. Please wait a moment and try again.';
  }
  if (raw.includes('Booking no longer exists.')) {
    return 'This booking no longer exists or was already deleted.';
  }
  if (raw.includes('Booking code already exists.')) {
    return 'Booking code already exists. Please try again.';
  }
  if (raw.includes('PAYMENT_NOT_PAID')) {
    return 'This ticket has not been confirmed as paid yet.';
  }
  if (raw.startsWith('ALREADY_CHECKED_IN|')) {
    return 'This ticket is already fully checked in.';
  }
  if (raw.includes('Quota exceeded') || raw.includes('resource-exhausted')) {
    return 'Daily Firestore free-tier quota exceeded. Quota resets tomorrow.';
  }
  if (raw.includes('Missing or insufficient permissions') || raw.includes('permission-denied')) {
    return 'Permission denied. Make sure your account is signed in and verified.';
  }
  if (
    raw.includes('unavailable') ||
    raw.includes('client is offline') ||
    raw.includes('Failed to fetch')
  ) {
    return 'Unable to reach the server. Check your internet connection and try again.';
  }
  if (raw.includes('deadline-exceeded')) {
    return 'Request timed out. Please check your connection and try again.';
  }
  if (raw.includes('aborted') || raw.includes('failed-precondition')) {
    return 'This record was just updated on another device. Please try again.';
  }
  return raw.length > 180 ? `${raw.slice(0, 177)}...` : raw;
}

/**
 * Computes scaled poster dimensions that preserve aspect ratio without upscaling.
 */
export function fitPosterDimensions(
  origWidth: number,
  origHeight: number,
  maxWidth: number,
): { width: number; height: number } {
  const safeW = Math.max(1, Math.round(Number(origWidth) || 1));
  const safeH = Math.max(1, Math.round(Number(origHeight) || 1));
  const safeMax = Math.max(1, Math.round(Number(maxWidth) || 1));
  const scale = Math.min(1, safeMax / safeW);
  return {
    width: Math.max(1, Math.round(safeW * scale)),
    height: Math.max(1, Math.round(safeH * scale)),
  };
}

/**
 * Determines whether an admin session is still fresh within the TTL window.
 * Pending serverTimestamp() writes (null/undefined) are treated as active.
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
export function getDefaultUpcomingIsoDate(now = new Date(), daysAhead = 14): string {
  const target = new Date(now.getTime() + daysAhead * 86400000);
  const year = target.getFullYear();
  const month = String(target.getMonth() + 1).padStart(2, '0');
  const day = String(target.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Parses a controlled numeric text field strictly (rejecting empty/NaN/out-of-bounds values).
 */
export function parseBoundedIntInput(
  raw: string,
  min: number,
  max: number,
): { valid: boolean; value: number } {
  const trimmed = toAsciiDigits(raw).trim();
  if (!trimmed || !/^\d+$/.test(trimmed)) {
    return { valid: false, value: min };
  }
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    return { valid: false, value: min };
  }
  return { valid: true, value: parsed };
}

// =============================================================================
// CUSTOM TICKET CATEGORY COLOR UTILITIES
// =============================================================================

export const DEFAULT_CATEGORY_COLORS: Record<TierId, string> = {
  Silver: '#94A3B8',
  Gold: '#FBBF24',
  VIP: '#F43F5E',
  Lounge: '#22D3EE',
};

export function isValidHexColor(raw: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(raw.trim());
}

export function normalizeHexColor(raw: string): string | null {
  let cleaned = raw.trim();
  if (!cleaned) return null;
  if (!cleaned.startsWith('#')) {
    cleaned = `#${cleaned}`;
  }
  const shortMatch = /^#([0-9A-Fa-f]{3})$/.exec(cleaned);
  if (shortMatch) {
    const [r, g, b] = shortMatch[1].split('');
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  if (/^#[0-9A-Fa-f]{6}$/.test(cleaned)) {
    return cleaned.toUpperCase();
  }
  return null;
}

export function validateTierColors(colors: Partial<Record<TierId, string>>): {
  valid: boolean;
  normalized?: Record<TierId, string>;
  error?: string;
} {
  const tiers: TierId[] = ['Silver', 'Gold', 'VIP', 'Lounge'];
  const normalized = {} as Record<TierId, string>;
  for (const tier of tiers) {
    const raw = colors[tier];
    if (typeof raw !== 'string') {
      return { valid: false, error: `Missing hex color for ${tier} category.` };
    }
    const hex = normalizeHexColor(raw);
    if (!hex) {
      return {
        valid: false,
        error: `Invalid hex color for ${tier} ("${raw}"). Use #RRGGBB format (e.g. #FBBF24).`,
      };
    }
    normalized[tier] = hex;
  }
  return { valid: true, normalized };
}

export function getTierColorHex(
  concert: Pick<Concert, 'tierColors'> | null | undefined,
  tier: TierId,
): string {
  const candidate = concert?.tierColors?.[tier];
  if (typeof candidate === 'string') {
    const normalized = normalizeHexColor(candidate);
    if (normalized) return normalized;
  }
  return DEFAULT_CATEGORY_COLORS[tier];
}

export function hexToRgba(hex: string, alpha: number): string {
  const normalized = normalizeHexColor(hex) || '#94A3B8';
  const r = Number.parseInt(normalized.slice(1, 3), 16);
  const g = Number.parseInt(normalized.slice(3, 5), 16);
  const b = Number.parseInt(normalized.slice(5, 7), 16);
  const safeAlpha = Math.max(0, Math.min(1, Number.isFinite(alpha) ? alpha : 1));
  return `rgba(${r}, ${g}, ${b}, ${safeAlpha})`;
}

// =============================================================================
// OFFLINE TICKET SPREADSHEET PARSER & NORMALIZER
// =============================================================================

export const MAX_OFFLINE_QTY_PER_ROW = 500;
export const OFFLINE_USER_ID = 'offline-sale';

export interface ParsedOfflineRowError {
  rowNumber: number;
  reason: string;
}

export interface ParsedOfflineBatchResult {
  validBookings: Omit<Booking, 'createdAt' | 'updatedAt'>[];
  errors: ParsedOfflineRowError[];
  totalTickets: number;
  paidTickets: number;
  totalRevenueEgp: number;
}

function normalizeHeaderKey(key: string): string {
  return key
    .trim()
    .toLowerCase()
    .replace(/[\s_\-\/.]+/g, '');
}

function pickColumnValue(row: Record<string, unknown>, aliases: string[]): string {
  const entries = Object.entries(row);
  for (const alias of aliases) {
    const target = normalizeHeaderKey(alias);
    for (const [k, v] of entries) {
      if (normalizeHeaderKey(k) === target && v !== undefined && v !== null) {
        const s = String(v).trim();
        if (s !== '') return s;
      }
    }
  }
  return '';
}

export function normalizeTierValue(raw: string): TierId | null {
  const clean = raw.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!clean) return null;
  if (
    clean === 'silver' ||
    clean === 's' ||
    clean === 'regular' ||
    clean === 'standard' ||
    clean === 'فضي' ||
    clean === 'سيلفر' ||
    clean.includes('silver') ||
    clean.includes('سيلفر')
  ) {
    return 'Silver';
  }
  if (
    clean === 'gold' ||
    clean === 'g' ||
    clean === 'ذهبي' ||
    clean === 'جولد' ||
    clean.includes('gold') ||
    clean.includes('جولد')
  ) {
    return 'Gold';
  }
  if (
    clean === 'vip' ||
    clean === 'v' ||
    clean === 'fan pit' ||
    clean === 'fanpit' ||
    clean === 'fan-pit' ||
    clean === 'فان بيت' ||
    clean === 'في اي بي' ||
    clean === 'في آي بي' ||
    clean === 'كبار الشخصيات' ||
    clean.includes('fan pit') ||
    clean.includes('fanpit') ||
    clean.includes('فان بيت') ||
    clean.includes('vip')
  ) {
    return 'VIP';
  }
  if (
    clean === 'lounge' ||
    clean === 'l' ||
    clean === 'table' ||
    clean === 'لاونج' ||
    clean.includes('lounge') ||
    clean.includes('لاونج')
  ) {
    return 'Lounge';
  }
  return null;
}

function parseTruthyFlag(raw: string): boolean {
  const v = raw.trim().toLowerCase();
  return v === 'yes' || v === 'true' || v === '1' || v === 'y' || v === 'checked' || v === 'checked in' || v === 'نعم';
}

function sanitizeOfflineBookingCode(raw: string, usedCodes: Set<string>): string {
  const cleaned = raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_\-]/g, '')
    .slice(0, 32);
  if (cleaned.length >= 5 && !usedCodes.has(cleaned)) {
    usedCodes.add(cleaned);
    return cleaned;
  }
  let generated = generateBookingCode();
  while (usedCodes.has(generated)) {
    generated = generateBookingCode();
  }
  usedCodes.add(generated);
  return generated;
}

export function normalizeOfflineMobile(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  // Excel sometimes strips the leading zero from Egyptian numbers (e.g. 1012345678)
  const normalizedEg = normalizeEgyptianMobile(trimmed);
  if (normalizedEg.length >= 6 && normalizedEg.length <= 30) {
    return normalizedEg;
  }
  return trimmed.slice(0, 30);
}

export function parseOfflineTicketRows(
  rows: Record<string, unknown>[],
  concert: Concert,
  adminName: string,
  existingCodes: Iterable<string> = [],
): ParsedOfflineBatchResult {
  const usedCodes = new Set<string>(Array.from(existingCodes, (c) => c.toUpperCase()));
  const validBookings: Omit<Booking, 'createdAt' | 'updatedAt'>[] = [];
  const errors: ParsedOfflineRowError[] = [];
  let totalTickets = 0;
  let paidTickets = 0;
  let totalRevenueEgp = 0;

  rows.forEach((row, index) => {
    const rowNumber = index + 2; // Row 1 is spreadsheet header

    // Ignore completely blank rows
    const hasAnyValue = Object.values(row).some(
      (v) => v !== undefined && v !== null && String(v).trim() !== '',
    );
    if (!hasAnyValue) return;

    const rawName = pickColumnValue(row, [
      'Customer Name',
      'Full Name',
      'Name',
      'Buyer',
      'Buyer Name',
      'Attendee',
      'Guest',
      'Client',
      'الاسم',
      'اسم العميل',
    ]);
    const rawMobile = pickColumnValue(row, [
      'Mobile',
      'Phone',
      'Customer Mobile',
      'Phone Number',
      'Mobile Number',
      'Tel',
      'Whatsapp',
      'رقم الواتساب للتواصل',
      'رقم الواتساب',
      'واتساب',
      'رقم الموبايل',
      'الموبايل',
      'الهاتف',
    ]);
    const rawEmail = pickColumnValue(row, ['Email', 'Customer Email', 'E-mail', 'البريد الالكتروني']);
    const rawTier = pickColumnValue(row, [
      'Tier',
      'Category',
      'Pass',
      'Pass Tier',
      'Ticket Tier',
      'Ticket Category',
      'Class',
      'فئة التذكرة',
      'الفئة',
    ]);
    const rawQty = pickColumnValue(row, [
      'Quantity',
      'Qty',
      'Tickets',
      'Count',
      'Seats',
      'Passes',
      'العدد',
      'عدد التذاكر',
    ]);
    const rawAmount = pickColumnValue(row, [
      'Total EGP',
      'Total',
      'Amount',
      'Paid',
      'Amount EGP',
      'Price',
      'المبلغ',
      'الاجمالي',
    ]);
    const rawOutlet = pickColumnValue(row, [
      'Outlet',
      'POS',
      'Branch',
      'Seller',
      'Source',
      'Location',
      'Booth',
      'Receipt',
      'Ref',
      'Transfer Ref',
      'Reference',
      'Notes',
      'مركز البيع',
      'المنفذ',
      'البائع',
    ]);
    const rawCode = pickColumnValue(row, ['Booking Code', 'Code', 'Ticket Code', 'Ticket ID', 'ID', 'الكود']);
    const rawStatus = pickColumnValue(row, ['Payment Status', 'Status', 'الحالة']);
    const rawCheckedIn = pickColumnValue(row, ['Checked In', 'Check In', 'Entered', 'الدخول']);

    const cleanName = rawName.replace(/\s+/g, ' ').trim().slice(0, 100);
    if (cleanName.length < 2) {
      errors.push({ rowNumber, reason: 'Missing or invalid customer name (at least 2 characters).' });
      return;
    }

    const cleanMobile = normalizeOfflineMobile(rawMobile);
    if (cleanMobile.length < 6) {
      errors.push({
        rowNumber,
        reason: `Missing or invalid mobile number for "${cleanName}" (need at least 6 digits).`,
      });
      return;
    }

    const tier = normalizeTierValue(rawTier || 'Silver');
    if (!tier) {
      errors.push({
        rowNumber,
        reason: `Unknown ticket category "${rawTier}" for "${cleanName}". Use Silver, Gold, VIP, or Lounge.`,
      });
      return;
    }

    const normalizedQtyStr = rawQty ? toAsciiDigits(rawQty).replace(/,/g, '').trim() : '';
    const qtyNum = normalizedQtyStr ? Number(normalizedQtyStr) : 1;
    if (!Number.isInteger(qtyNum) || qtyNum < 1 || qtyNum > MAX_OFFLINE_QTY_PER_ROW) {
      errors.push({
        rowNumber,
        reason: `Invalid quantity "${rawQty}" for "${cleanName}" (must be an integer 1–${MAX_OFFLINE_QTY_PER_ROW}).`,
      });
      return;
    }

    const unitPrice = getTierUnitPrice(concert, tier);
    const expectedSubtotal = unitPrice * qtyNum;
    let totalEgp = expectedSubtotal;
    let discountEgp = 0;

    if (rawAmount) {
      const normalizedAmount = toAsciiDigits(rawAmount)
        .replace(/ج\s*\.\s*م\.?/g, '')
        .replace(/\b(?:egp|l\.?\s*e\.?)\b/gi, '')
        .replace(/[,٬\s]/g, '');
      const strippedAmount = normalizedAmount.replace(/[^0-9.\-]/g, '');
      const cleanedAmount = Number(strippedAmount);
      if (
        strippedAmount === '' ||
        !/^-?\d+(?:\.\d+)?$/.test(strippedAmount) ||
        !Number.isFinite(cleanedAmount) ||
        cleanedAmount < 0 ||
        cleanedAmount > 50000000
      ) {
        errors.push({
          rowNumber,
          reason: `Invalid total amount "${rawAmount}" for "${cleanName}".`,
        });
        return;
      }
      totalEgp = Math.round(cleanedAmount);
      discountEgp = Math.max(0, expectedSubtotal - totalEgp);
    }

    const cleanEmail = rawEmail.trim().toLowerCase().slice(0, 120);
    const statusLower = rawStatus.trim().toLowerCase();
    const paymentStatus: 'Paid' | 'Pending' =
      statusLower === 'pending' ||
      statusLower === 'unpaid' ||
      statusLower === 'معلق' ||
      statusLower === 'معلّق' ||
      statusLower === 'قيد المراجعة' ||
      statusLower === 'غير مدفوع'
        ? 'Pending'
        : 'Paid';
    const checkedIn = paymentStatus === 'Paid' && parseTruthyFlag(rawCheckedIn);
    const transferRef = (rawOutlet.replace(/\s+/g, ' ').trim() || 'Offline Box Office')
      .padEnd(3, ' ')
      .trim()
      .slice(0, 80);
    const safeTransferRef = transferRef.length >= 3 ? transferRef : 'Offline Box Office';

    const bookingCode = sanitizeOfflineBookingCode(rawCode, usedCodes);

    validBookings.push({
      bookingCode,
      userId: OFFLINE_USER_ID,
      concertId: concert.id,
      concertTitle: concert.title.slice(0, 120),
      concertDate: concert.date.slice(0, 40),
      concertTime: concert.time.slice(0, 20),
      concertVenue: concert.venue.slice(0, 140),
      tier,
      quantity: qtyNum,
      unitPrice,
      promoCode: '',
      discountEgp,
      totalEgp,
      paymentMethod: 'Offline',
      transferRef: safeTransferRef,
      paymentStatus,
      checkedIn,
      checkedInCount: checkedIn ? qtyNum : 0,
      checkedInAt: checkedIn ? 'Excel Import' : '',
      approvedBy: paymentStatus === 'Paid' ? adminName.trim().slice(0, 100) || 'Admin' : '',
      approvalMethod: paymentStatus === 'Paid' ? 'Excel Import' : '',
      customerName: cleanName,
      customerMobile: cleanMobile,
      customerEmail: cleanEmail,
    });

    totalTickets += qtyNum;
    if (paymentStatus === 'Paid') {
      paidTickets += qtyNum;
      totalRevenueEgp += totalEgp;
    }
  });

  return {
    validBookings,
    errors,
    totalTickets,
    paidTickets,
    totalRevenueEgp,
  };
}

export interface ConcertEditDraft {
  title: string;
  artist: string;
  venue: string;
  genre: string;
  isoDate: string;
  isoTime: string;
  totalSeats: string;
  seatsLeft: string;
  silver: string;
  gold: string;
  vip: string;
  lounge: string;
  useCustomColors: boolean;
  hexDrafts: TierColors;
  posterUrl: string;
  description: string;
}

export type ConcertEditValidationResult =
  | {
      valid: true;
      concert: Omit<Concert, 'createdAt' | 'updatedAt'>;
    }
  | {
      valid: false;
      errorEn: string;
      errorAr: string;
    };

/**
 * Adjusts seatsLeft when an organizer changes a concert's total capacity so
 * previously booked/used seats stay accounted for and 0 <= seatsLeft <= nextTotalSeats.
 */
export function computeAdjustedSeatsLeft(
  prevTotalSeats: number,
  prevSeatsLeft: number,
  nextTotalSeats: number,
): number {
  const safePrevTotal = Math.max(0, Math.round(prevTotalSeats));
  const safePrevLeft = Math.max(0, Math.min(safePrevTotal, Math.round(prevSeatsLeft)));
  const safeNextTotal = Math.max(0, Math.round(nextTotalSeats));
  const usedSeats = Math.max(0, safePrevTotal - safePrevLeft);
  return Math.max(0, Math.min(safeNextTotal, safeNextTotal - usedSeats));
}

function isValidCalendarIsoDate(isoDate: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!m) return false;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const dt = new Date(Date.UTC(year, month - 1, day));
  return (
    dt.getUTCFullYear() === year &&
    dt.getUTCMonth() === month - 1 &&
    dt.getUTCDate() === day
  );
}

function isValidClockIsoTime(isoTime: string): boolean {
  const m = /^(\d{2}):(\d{2})$/.exec(isoTime);
  if (!m) return false;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  return hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59;
}

/**
 * Normalizes HH:MM:SS (emitted by some mobile time inputs) to HH:MM and validates
 * that both the calendar date (no Feb 30) and 24-hour clock time are real.
 */
export function normalizeScheduleDateTime(
  rawIsoDate: string,
  rawIsoTime: string,
): { valid: true; isoDate: string; isoTime: string } | { valid: false } {
  const isoDate = rawIsoDate.trim();
  const trimmedTime = rawIsoTime.trim();
  const isoTime = /^\d{2}:\d{2}:\d{2}$/.test(trimmedTime) ? trimmedTime.slice(0, 5) : trimmedTime;
  if (!isValidCalendarIsoDate(isoDate) || !isValidClockIsoTime(isoTime)) {
    return { valid: false };
  }
  return { valid: true, isoDate, isoTime };
}

export function validateAndBuildConcertEditPayload(
  original: Concert,
  draft: ConcertEditDraft,
): ConcertEditValidationResult {
  const cleanTitle = draft.title.trim();
  const cleanArtist = draft.artist.trim();
  const cleanVenue = draft.venue.trim();
  const cleanGenre = draft.genre.trim();
  const cleanDescription = draft.description.trim();

  if (
    cleanTitle.length < 2 ||
    cleanArtist.length < 2 ||
    cleanVenue.length < 2 ||
    cleanGenre.length < 2 ||
    cleanDescription.length < 4
  ) {
    return {
      valid: false,
      errorEn: 'Please complete title, artist, venue, genre (2+ chars), and description (4+ chars).',
      errorAr: 'يرجى استكمال اسم الحفل والفنان والمكان والتصنيف (حرفان على الأقل) والوصف (٤ أحرف على الأقل).',
    };
  }

  const scheduleCheck = normalizeScheduleDateTime(draft.isoDate, draft.isoTime);
  if (!scheduleCheck.valid) {
    return {
      valid: false,
      errorEn: 'Please pick a valid event date and start time.',
      errorAr: 'يرجى اختيار تاريخ ووقت بداية صحيحين للحفل.',
    };
  }
  const { isoDate: cleanIsoDate, isoTime: cleanIsoTime } = scheduleCheck;

  const totalParsed = parseBoundedIntInput(draft.totalSeats, 1, 50000);
  if (!totalParsed.valid) {
    return {
      valid: false,
      errorEn: 'Total capacity must be a whole number between 1 and 50,000.',
      errorAr: 'يجب أن تكون السعة الإجمالية عدداً صحيحاً بين 1 و 50,000.',
    };
  }

  const seatsLeftParsed = parseBoundedIntInput(draft.seatsLeft, 0, totalParsed.value);
  if (!seatsLeftParsed.valid) {
    return {
      valid: false,
      errorEn: `Seats left must be a whole number between 0 and ${totalParsed.value.toLocaleString('en-US')}.`,
      errorAr: `يجب أن تكون المقاعد المتبقية عدداً صحيحاً بين 0 و ${totalParsed.value.toLocaleString('en-US')}.`,
    };
  }

  const silverParsed = parseBoundedIntInput(draft.silver, 0, 100000);
  const goldParsed = parseBoundedIntInput(draft.gold, 0, 100000);
  const vipParsed = parseBoundedIntInput(draft.vip, 0, 100000);
  const loungeParsed = parseBoundedIntInput(draft.lounge, 0, 100000);
  if (!silverParsed.valid || !goldParsed.valid || !vipParsed.valid || !loungeParsed.valid) {
    return {
      valid: false,
      errorEn: 'All tier prices must be valid whole numbers between 0 and 100,000 EGP.',
      errorAr: 'يجب أن تكون أسعار جميع الفئات أعداداً صحيحة بين 0 و 100,000 ج.م.',
    };
  }

  const trimmedPoster = draft.posterUrl.trim();
  if (trimmedPoster.length > MAX_POSTER_DATA_URL_LENGTH) {
    return {
      valid: false,
      errorEn: 'Poster image or URL is too large. Please upload a smaller image or shorter HTTPS link.',
      errorAr: 'حجم صورة البوستر أو الرابط كبير جداً. يرجى رفع صورة أصغر أو رابط HTTPS أقصر.',
    };
  }
  if (trimmedPoster.length > 0 && !isSafeImageUrl(trimmedPoster)) {
    return {
      valid: false,
      errorEn: 'Poster URL must start with https:// or use Upload Image (JPG/PNG/WebP).',
      errorAr: 'يجب أن يبدأ رابط البوستر بـ https:// أو استخدام زر رفع صورة (JPG/PNG/WebP).',
    };
  }

  let resolvedTierColors: TierColors | undefined;
  if (draft.useCustomColors) {
    const colorCheck = validateTierColors(draft.hexDrafts);
    if (!colorCheck.valid || !colorCheck.normalized) {
      return {
        valid: false,
        errorEn: colorCheck.error || 'Please fix invalid hex colors before saving.',
        errorAr: 'يرجى تصحيح أكواد الألوان (Hex) غير الصالحة قبل الحفظ.',
      };
    }
    resolvedTierColors = colorCheck.normalized;
  }

  const formatted = formatDateTimeDisplay(cleanIsoDate, cleanIsoTime);

  return {
    valid: true,
    concert: {
      id: original.id,
      title: cleanTitle.slice(0, 120),
      artist: cleanArtist.slice(0, 120),
      venue: cleanVenue.slice(0, 140),
      genre: cleanGenre.slice(0, 60),
      isoDate: cleanIsoDate,
      isoTime: cleanIsoTime,
      date: formatted.date.slice(0, 40),
      time: formatted.time.slice(0, 20),
      doors: formatted.doors.slice(0, 20),
      priceEgp: silverParsed.value,
      tierPrices: {
        Silver: silverParsed.value,
        Gold: goldParsed.value,
        VIP: vipParsed.value,
        Lounge: loungeParsed.value,
      },
      tierColors: resolvedTierColors,
      totalSeats: totalParsed.value,
      seatsLeft: seatsLeftParsed.value,
      description: cleanDescription.slice(0, 800),
      posterUrl: trimmedPoster,
    },
  };
}

/**
 * Returns a booking merged with the latest live concert title, date, time, and venue
 * so edits published by organizers immediately reflect on fans' booked tickets and E-Passes.
 */
export function resolveBookingConcertDetails(booking: Booking, concert?: Concert | null): Booking {
  if (!concert) return booking;
  return {
    ...booking,
    concertTitle: concert.title || booking.concertTitle,
    concertDate: concert.date || booking.concertDate,
    concertTime: concert.time || booking.concertTime,
    concertVenue: concert.venue || booking.concertVenue,
  };
}

// =============================================================================
// PAYMENT NUMBERS CONFIGURATION (INSTAPAY & VODAFONE CASH / MOBILE WALLETS)
// =============================================================================

export const PAYMENT_CONFIG_DOC_ID = 'default';

export const DEFAULT_PAYMENT_CONFIG: PaymentConfig = {
  id: PAYMENT_CONFIG_DOC_ID,
  instapayNumber: PAYMENT_PHONE_NUMBER,
  walletNumber: PAYMENT_PHONE_NUMBER,
  updatedBy: '',
};

export function resolvePaymentConfig(raw?: Partial<PaymentConfig> | null): PaymentConfig {
  const instapay =
    typeof raw?.instapayNumber === 'string' && raw.instapayNumber.trim().length > 0
      ? raw.instapayNumber.trim()
      : PAYMENT_PHONE_NUMBER;
  const wallet =
    typeof raw?.walletNumber === 'string' && raw.walletNumber.trim().length > 0
      ? raw.walletNumber.trim()
      : PAYMENT_PHONE_NUMBER;
  const resolved: PaymentConfig = {
    id: PAYMENT_CONFIG_DOC_ID,
    instapayNumber: instapay,
    walletNumber: wallet,
    updatedBy: typeof raw?.updatedBy === 'string' ? raw.updatedBy : '',
  };
  if (raw?.createdAt !== undefined) {
    resolved.createdAt = raw.createdAt;
  }
  if (raw?.updatedAt !== undefined) {
    resolved.updatedAt = raw.updatedAt;
  }
  return resolved;
}

function normalizePaymentPhonePreservePrefix(raw: string): { valid: boolean; formatted: string } {
  const compact = toAsciiDigits(raw).trim().replace(/[\s\-()]/g, '');
  const mobileCheck = validateEgyptianMobile(compact, true);
  if (!mobileCheck.valid) {
    return { valid: false, formatted: compact };
  }
  if (compact.startsWith('+20')) {
    return { valid: true, formatted: `+20${mobileCheck.normalized.slice(1)}` };
  }
  return { valid: true, formatted: mobileCheck.normalized };
}

export type PaymentConfigValidationResult =
  | {
      valid: true;
      normalized: {
        instapayNumber: string;
        walletNumber: string;
      };
    }
  | {
      valid: false;
      errorEn: string;
      errorAr: string;
    };

export function validatePaymentConfigInput(input: {
  instapayNumber: string;
  walletNumber: string;
}): PaymentConfigValidationResult {
  const rawInsta = toAsciiDigits(input.instapayNumber).trim().replace(/\s+/g, '');
  const rawWallet = toAsciiDigits(input.walletNumber).trim();

  if (rawInsta.length < 5 || rawInsta.length > 80) {
    return {
      valid: false,
      errorEn:
        'Enter a valid InstaPay mobile number (e.g. +201040206700 or 01040206700) or IPA address (e.g. name@instapay).',
      errorAr:
        'يرجى إدخال رقم موبايل صحيح لإنستاباي (مثل 01040206700 أو +201040206700) أو عنوان IPA (مثل name@instapay).',
    };
  }

  let normalizedInsta = '';
  if (rawInsta.includes('@')) {
    if (!/^[a-zA-Z0-9._\-]{2,50}@[a-zA-Z0-9.\-]{2,28}$/.test(rawInsta)) {
      return {
        valid: false,
        errorEn: 'Enter a valid InstaPay IPA address (e.g. genzevents@instapay).',
        errorAr: 'يرجى إدخال عنوان إنستاباي (IPA) صحيح (مثل genzevents@instapay).',
      };
    }
    normalizedInsta = rawInsta;
  } else {
    const instaPhone = normalizePaymentPhonePreservePrefix(rawInsta);
    if (!instaPhone.valid) {
      return {
        valid: false,
        errorEn:
          'Enter a valid Egyptian mobile number for InstaPay (010, 011, 012, or 015) or an IPA address like name@instapay.',
        errorAr:
          'يرجى إدخال رقم موبايل مصري صحيح لإنستاباي (يبدأ بـ 010 أو 011 أو 012 أو 015) أو عنوان IPA مثل name@instapay.',
      };
    }
    normalizedInsta = instaPhone.formatted;
  }

  const walletPhone = normalizePaymentPhonePreservePrefix(rawWallet);
  if (!walletPhone.valid || walletPhone.formatted.length < 6 || walletPhone.formatted.length > 30) {
    return {
      valid: false,
      errorEn:
        'Enter a valid 11-digit Egyptian mobile number for Vodafone Cash / Mobile Wallets (010, 011, 012, or 015).',
      errorAr:
        'يرجى إدخال رقم موبايل مصري صحيح لفودافون كاش / المحافظ الإلكترونية (١١ رقماً يبدأ بـ 010 أو 011 أو 012 أو 015).',
    };
  }

  return {
    valid: true,
    normalized: {
      instapayNumber: normalizedInsta,
      walletNumber: walletPhone.formatted,
    },
  };
}


