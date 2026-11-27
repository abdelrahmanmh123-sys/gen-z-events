import type { Booking, Concert, SortOption, TierColors } from '../../types';
import { getTierUnitPrice, validateTierColors } from './pricing';
import { isSafeImageUrl, MAX_POSTER_DATA_URL_LENGTH, parseBoundedIntInput } from './validation';

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

export function getNextUpcomingConcert(concerts: Concert[], nowMs = Date.now()): Concert | null {
  if (concerts.length === 0) return null;
  const sorted = [...concerts].sort((a, b) =>
    `${a.isoDate}T${a.isoTime}`.localeCompare(`${b.isoDate}T${b.isoTime}`),
  );
  const upcoming = sorted.find((c) => !computeCountdown(c.isoDate, c.isoTime, nowMs).isPast);
  return upcoming || sorted[sorted.length - 1] || null;
}

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
