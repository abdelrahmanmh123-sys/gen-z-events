import type { Booking, Concert, Promo, WaitlistEntry } from '../types';
import {
  getBookingCheckedInCount,
  normalizeEgyptianMobile,
  toAsciiDigits,
  type StaffPermissions,
} from './bookingLogic';

export type QuickSearchScope = 'all' | 'bookings' | 'concerts' | 'promos' | 'waitlist';

export interface StaffQuickSearchDataset {
  bookings: Booking[];
  concerts: Concert[];
  promos: Promo[];
  waitlist: WaitlistEntry[];
}

export interface StaffQuickSearchResults {
  bookings: Booking[];
  concerts: Concert[];
  promos: Promo[];
  waitlist: WaitlistEntry[];
  totalCount: number;
  isDefaultPreview: boolean;
}

const MAX_RESULTS_PER_GROUP = 12;
const DEFAULT_PREVIEW_BOOKINGS = 8;

function normalizeSearchToken(raw: string): string {
  return toAsciiDigits(raw).trim().toLowerCase();
}

function digitsOnly(raw: string): string {
  return toAsciiDigits(raw).replace(/\D/g, '');
}

/**
 * Scores a booking against a normalized query (higher = more relevant, 0 = no match).
 * Supports exact/prefix booking codes, transfer references, Egyptian mobiles (+20/010),
 * customer name, email, concert title, tier, and approver name.
 */
export function scoreBookingMatch(booking: Booking, rawQuery: string): number {
  const q = normalizeSearchToken(rawQuery);
  if (!q) return 1;

  const code = booking.bookingCode.trim().toLowerCase();
  const ref = toAsciiDigits(booking.transferRef || '').trim().toLowerCase();
  const name = (booking.customerName || '').trim().toLowerCase();
  const email = (booking.customerEmail || '').trim().toLowerCase();
  const concert = (booking.concertTitle || '').trim().toLowerCase();
  const tier = (booking.tier || '').trim().toLowerCase();
  const approver = (booking.approvedBy || '').trim().toLowerCase();
  const mobileDigits = digitsOnly(booking.customerMobile || '');
  const refDigits = digitsOnly(booking.transferRef || '');
  const qDigits = digitsOnly(q);

  if (code === q) return 1000;
  if (code.startsWith(q)) return 850;
  if (ref && ref === q) return 820;
  if (qDigits.length >= 4 && mobileDigits && (mobileDigits === qDigits || mobileDigits.endsWith(qDigits))) {
    return 780;
  }
  if (qDigits.length >= 4 && mobileDigits.includes(qDigits)) return 700;
  if (qDigits.length >= 4 && refDigits.includes(qDigits)) return 680;
  if (code.includes(q)) return 650;
  if (ref.includes(q)) return 600;
  if (name === q) return 560;
  if (name.startsWith(q)) return 520;
  if (name.includes(q)) return 460;
  if (email.includes(q)) return 400;
  if (concert.includes(q)) return 320;
  if (approver.includes(q)) return 260;
  if (tier.includes(q)) return 200;

  // Multi-word AND matching across combined fields (e.g., "ahmed vip" or "qena paid")
  const tokens = q.split(/\s+/).filter(Boolean);
  if (tokens.length > 1) {
    const combined = `${code} ${name} ${mobileDigits} ${email} ${ref} ${concert} ${tier} ${booking.paymentStatus.toLowerCase()} ${booking.paymentMethod.toLowerCase()} ${approver}`;
    if (tokens.every((tok) => combined.includes(tok))) {
      return 350;
    }
  }

  return 0;
}

export function scoreConcertMatch(concert: Concert, rawQuery: string): number {
  const q = normalizeSearchToken(rawQuery);
  if (!q) return 1;
  const title = concert.title.toLowerCase();
  const artist = concert.artist.toLowerCase();
  const venue = concert.venue.toLowerCase();
  const genre = concert.genre.toLowerCase();
  const dateText = `${concert.isoDate} ${concert.date} ${concert.time}`.toLowerCase();

  if (title === q || artist === q) return 800;
  if (title.startsWith(q) || artist.startsWith(q)) return 650;
  if (title.includes(q) || artist.includes(q)) return 500;
  if (venue.includes(q)) return 380;
  if (genre.includes(q) || dateText.includes(q)) return 260;
  return 0;
}

export function scorePromoMatch(promo: Promo, rawQuery: string): number {
  const q = normalizeSearchToken(rawQuery);
  if (!q) return 1;
  const code = promo.code.toLowerCase();
  const label = promo.label.toLowerCase();
  const tiers = promo.tiers.join(' ').toLowerCase();

  if (code === q) return 900;
  if (code.startsWith(q)) return 750;
  if (code.includes(q)) return 600;
  if (label.includes(q) || tiers.includes(q)) return 350;
  return 0;
}

export function scoreWaitlistMatch(entry: WaitlistEntry, rawQuery: string): number {
  const q = normalizeSearchToken(rawQuery);
  if (!q) return 1;
  const name = entry.name.toLowerCase();
  const mobileDigits = digitsOnly(entry.mobile);
  const email = entry.email.toLowerCase();
  const concert = entry.concertTitle.toLowerCase();
  const qDigits = digitsOnly(q);

  if (qDigits.length >= 4 && mobileDigits.includes(qDigits)) return 700;
  if (name.startsWith(q)) return 550;
  if (name.includes(q)) return 450;
  if (email.includes(q)) return 380;
  if (concert.includes(q)) return 300;
  return 0;
}

/**
 * Executes an RBAC-scoped search across all Staff Portal entities.
 * - Gate Staff strictly searches Bookings (and read-only Concerts) and NEVER sees Promos or Waitlist.
 * - When query is empty, surfaces actionable preview bookings (Pending approvals for Super Admin;
 *   Paid ready-to-admit passes for Gate Staff).
 */
export function runStaffQuickSearch(
  dataset: StaffQuickSearchDataset,
  rawQuery: string,
  permissions: StaffPermissions,
  scope: QuickSearchScope = 'all',
  limitPerGroup = MAX_RESULTS_PER_GROUP,
): StaffQuickSearchResults {
  const q = normalizeSearchToken(rawQuery);
  const allowPromos = permissions.canManagePromos;
  const allowWaitlist = permissions.isSuperAdmin;

  if (!q) {
    const wantBookings = scope === 'all' || scope === 'bookings';
    const wantConcerts = scope === 'concerts';
    const wantPromos = scope === 'promos' && allowPromos;
    const wantWaitlist = scope === 'waitlist' && allowWaitlist;

    let previewBookings: Booking[] = [];
    if (wantBookings) {
      if (permissions.canConfirmPayments) {
        // Super Admin default view: pending approvals first, then newest bookings
        const pending = dataset.bookings.filter((b) => b.paymentStatus === 'Pending');
        const paid = dataset.bookings.filter((b) => b.paymentStatus === 'Paid');
        previewBookings = [...pending, ...paid].slice(0, DEFAULT_PREVIEW_BOOKINGS);
      } else {
        // Gate Staff default view: Paid tickets still needing check-in first
        const ready = dataset.bookings.filter(
          (b) => b.paymentStatus === 'Paid' && getBookingCheckedInCount(b) < Math.max(1, b.quantity || 1),
        );
        const rest = dataset.bookings.filter(
          (b) => !(b.paymentStatus === 'Paid' && getBookingCheckedInCount(b) < Math.max(1, b.quantity || 1)),
        );
        previewBookings = [...ready, ...rest].slice(0, DEFAULT_PREVIEW_BOOKINGS);
      }
    }

    const previewConcerts = wantConcerts ? dataset.concerts.slice(0, limitPerGroup) : [];
    const previewPromos = wantPromos ? dataset.promos.slice(0, limitPerGroup) : [];
    const previewWaitlist = wantWaitlist ? dataset.waitlist.slice(0, limitPerGroup) : [];

    return {
      bookings: previewBookings,
      concerts: previewConcerts,
      promos: previewPromos,
      waitlist: previewWaitlist,
      totalCount:
        previewBookings.length +
        previewConcerts.length +
        previewPromos.length +
        previewWaitlist.length,
      isDefaultPreview: true,
    };
  }

  const bookings =
    scope === 'all' || scope === 'bookings'
      ? dataset.bookings
          .map((item) => ({ item, score: scoreBookingMatch(item, q) }))
          .filter((entry) => entry.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, limitPerGroup)
          .map((entry) => entry.item)
      : [];

  const concerts =
    scope === 'all' || scope === 'concerts'
      ? dataset.concerts
          .map((item) => ({ item, score: scoreConcertMatch(item, q) }))
          .filter((entry) => entry.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, limitPerGroup)
          .map((entry) => entry.item)
      : [];

  const promos =
    allowPromos && (scope === 'all' || scope === 'promos')
      ? dataset.promos
          .map((item) => ({ item, score: scorePromoMatch(item, q) }))
          .filter((entry) => entry.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, limitPerGroup)
          .map((entry) => entry.item)
      : [];

  const waitlist =
    allowWaitlist && (scope === 'all' || scope === 'waitlist')
      ? dataset.waitlist
          .map((item) => ({ item, score: scoreWaitlistMatch(item, q) }))
          .filter((entry) => entry.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, limitPerGroup)
          .map((entry) => entry.item)
      : [];

  return {
    bookings,
    concerts,
    promos,
    waitlist,
    totalCount: bookings.length + concerts.length + promos.length + waitlist.length,
    isDefaultPreview: false,
  };
}

/**
 * Converts a local Egyptian or international mobile string into a WhatsApp-ready E.164 digit string
 * (without leading '+'), or returns '' if invalid.
 */
export function toWhatsAppPhoneDigits(rawMobile: string): string {
  const normalizedEg = normalizeEgyptianMobile(rawMobile);
  if (/^01[0125]\d{8}$/.test(normalizedEg)) {
    return `20${normalizedEg.slice(1)}`;
  }
  const digits = digitsOnly(rawMobile);
  if (digits.startsWith('00') && digits.length >= 10) {
    return digits.slice(2);
  }
  if (digits.length >= 10 && digits.length <= 15) {
    return digits;
  }
  return '';
}

/**
 * Builds a pre-filled WhatsApp link for contacting a fan directly from Staff Quick Search.
 */
export function buildStaffWhatsAppBookingUrl(
  booking: Pick<
    Booking,
    'bookingCode' | 'customerName' | 'customerMobile' | 'concertTitle' | 'tier' | 'quantity' | 'totalEgp' | 'paymentStatus'
  >,
  lang: 'en' | 'ar',
): string | null {
  const phone = toWhatsAppPhoneDigits(booking.customerMobile);
  if (!phone) return null;

  const msg =
    booking.paymentStatus === 'Paid'
      ? lang === 'ar'
        ? `أهلاً ${booking.customerName}، تم تأكيد دفع حجزك (${booking.bookingCode}) لحفل ${booking.concertTitle} (${booking.quantity}× ${booking.tier}). يمكنك الآن فتح «تذاكري» على Gen Z Events لتحميل تذكرتك ورمز الـ QR.`
        : `Hi ${booking.customerName}, your payment for booking ${booking.bookingCode} (${booking.concertTitle} · ${booking.quantity}x ${booking.tier}) is confirmed! Open "My Tickets" on Gen Z Events to download your QR pass.`
      : lang === 'ar'
        ? `أهلاً ${booking.customerName}، بخصوص حجزك المعلق (${booking.bookingCode}) لحفل ${booking.concertTitle} بقيمة ${booking.totalEgp.toLocaleString('en-US')} ج.م — يرجى إرسال صورة إيصال التحويل لتأكيد التذكرة وفتح رمز الـ QR.`
        : `Hi ${booking.customerName}, regarding your pending booking ${booking.bookingCode} for ${booking.concertTitle} (${booking.totalEgp.toLocaleString('en-US')} EGP) — please send your transfer screenshot so we can confirm payment and unlock your QR pass.`;

  return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
}

export function buildStaffWhatsAppWaitlistUrl(
  entry: Pick<WaitlistEntry, 'name' | 'mobile' | 'concertTitle'>,
  lang: 'en' | 'ar',
): string | null {
  const phone = toWhatsAppPhoneDigits(entry.mobile);
  if (!phone) return null;

  const msg =
    lang === 'ar'
      ? `أهلاً ${entry.name}، خبر سار من Gen Z Events! توفرت تذاكر لحفل ${entry.concertTitle}. يمكنك الحجز الآن من الموقع.`
      : `Hi ${entry.name}, good news from Gen Z Events! Seats are now available for ${entry.concertTitle}. Book now on the website.`;

  return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
}
