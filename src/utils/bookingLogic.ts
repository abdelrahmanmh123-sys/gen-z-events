import type { AdminSession, Booking, Concert, Promo, SortOption, TierId, TierPrices } from '../types';

export const MAX_QTY_PER_ORDER = 6;
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
  if (Array.isArray(found.tiers) && found.tiers.length > 0 && !found.tiers.includes(tier)) {
    return {
      valid: false,
      code,
      discountEgp: 0,
      message: `${found.code} applies only to ${found.tiers.join(' & ')} passes.`,
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

export function generateBookingCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  for (let i = 0; i < 6; i++) {
    suffix += chars[Math.floor(Math.random() * chars.length)];
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
      b.checkedIn ? 'Yes' : 'No',
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

export function computeAdminKpis(concerts: Concert[], bookings: Booking[]) {
  const liveEvents = concerts.length;
  const seatsRemaining = concerts.reduce((sum, c) => sum + Math.max(0, c.seatsLeft), 0);
  const paidBookings = bookings.filter((b) => b.paymentStatus === 'Paid');
  const pendingPayments = bookings.filter((b) => b.paymentStatus === 'Pending').length;
  const checkedIn = bookings.filter((b) => b.checkedIn).reduce((sum, b) => sum + b.quantity, 0);
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

export interface StorefrontCollectionInput {
  dbConcerts: Concert[];
  dbPromos: Promo[];
  defaultConcerts: Concert[];
  defaultPromos: Promo[];
  siteSeeded: boolean;
  allLoaded: boolean;
}

export interface ResolvedStorefrontCollections {
  concerts: Concert[];
  promos: Promo[];
  isLiveInDb: boolean;
  isLoadingInitial: boolean;
}

/**
 * Resolves fan-facing collections strictly from Firestore once the database has
 * been seeded or contains any live document, ensuring admin deletions
 * never fall back to hardcoded defaults.
 */
export function resolveStorefrontCollections(
  input: StorefrontCollectionInput,
): ResolvedStorefrontCollections {
  const hasAnyLiveDoc = input.dbConcerts.length > 0 || input.dbPromos.length > 0;
  const isLiveInDb = input.siteSeeded || hasAnyLiveDoc;

  if (!input.allLoaded) {
    return {
      concerts: input.dbConcerts,
      promos: input.dbPromos,
      isLiveInDb,
      isLoadingInitial: true,
    };
  }

  if (!isLiveInDb) {
    return {
      concerts: input.defaultConcerts,
      promos: input.defaultPromos,
      isLiveInDb: false,
      isLoadingInitial: false,
    };
  }

  return {
    concerts: input.dbConcerts,
    promos: input.dbPromos,
    isLiveInDb: true,
    isLoadingInitial: false,
  };
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

export function normalizeEgyptianMobile(raw: string): string {
  const cleaned = raw.trim().replace(/[\s\-()]/g, '');
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
    return { valid: false, normalized: '', error: 'Enter your Egyptian mobile number (e.g. 010XXXXXXXX).' };
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
  const trimmed = raw.trim();
  if (!trimmed || !/^\d+$/.test(trimmed)) {
    return { valid: false, value: min };
  }
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    return { valid: false, value: min };
  }
  return { valid: true, value: parsed };
}
