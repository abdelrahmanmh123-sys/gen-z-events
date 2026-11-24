import { formatCurrencyEgp } from '../i18n/translations';
import type { Concert } from '../types';
import { getTierUnitPrice } from './bookingLogic';
import { copyTextToClipboard } from './passExport';

export interface ConcertSharePayload {
  title: string;
  text: string;
  url: string;
}

export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'failed';

export interface ShareConcertOptions {
  lang: 'en' | 'ar';
  url?: string;
  navigatorShare?: (data: ShareData) => Promise<void>;
  copyToClipboard?: (text: string) => Promise<boolean>;
}

const DEFAULT_PUBLIC_URL = 'https://gen-z-events-z.vercel.app/#lineup';

/**
 * Resolves a clean, shareable page URL pointing directly to the live concert lineup.
 */
export function resolveShareUrl(explicitUrl?: string): string {
  if (explicitUrl && explicitUrl.trim()) {
    return explicitUrl.trim();
  }
  if (typeof window !== 'undefined' && window.location) {
    const { origin, pathname } = window.location;
    if (origin && origin !== 'null') {
      return `${origin}${pathname || '/'}#lineup`;
    }
  }
  return DEFAULT_PUBLIC_URL;
}

/**
 * Builds localized Web Share API payload containing concert title, artist, date, time, venue, starting price, and URL.
 */
export function buildConcertShareData(
  concert: Concert,
  options: { lang: 'en' | 'ar'; url?: string },
): ConcertSharePayload {
  const startingPrice = getTierUnitPrice(concert, 'Silver');
  const url = resolveShareUrl(options.url);

  if (options.lang === 'ar') {
    return {
      title: `${concert.title} — ${concert.artist}`,
      text: [
        `${concert.title} — ${concert.artist}`,
        `التاريخ: ${concert.date} · الساعة ${concert.time}`,
        `المكان: ${concert.venue}، قنا`,
        `التذاكر تبدأ من ${formatCurrencyEgp(startingPrice, 'ar')} عبر Gen Z Events`,
      ].join('\n'),
      url,
    };
  }

  return {
    title: `${concert.title} — ${concert.artist}`,
    text: [
      `${concert.title} — ${concert.artist}`,
      `Date: ${concert.date} at ${concert.time}`,
      `Venue: ${concert.venue}, Qena`,
      `Passes from ${formatCurrencyEgp(startingPrice, 'en')} on Gen Z Events`,
    ].join('\n'),
    url,
  };
}

/**
 * Formats the concert share payload into a clean multi-line message for clipboard fallback.
 */
export function formatShareClipboardText(payload: ConcertSharePayload): string {
  return `${payload.text}\n${payload.url}`;
}

function isAbortError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const name = (err as { name?: unknown }).name;
  return name === 'AbortError';
}

/**
 * Shares concert event details using the native Web Share API when available,
 * gracefully falling back to clipboard copy on unsupported or restricted browsers.
 */
export async function shareConcertDetails(
  concert: Concert,
  options: ShareConcertOptions,
): Promise<ShareOutcome> {
  const payload = buildConcertShareData(concert, {
    lang: options.lang,
    url: options.url,
  });

  const nativeShare =
    options.navigatorShare ??
    (typeof navigator !== 'undefined' && typeof navigator.share === 'function'
      ? (data: ShareData) => navigator.share(data)
      : undefined);

  if (nativeShare) {
    try {
      await nativeShare({
        title: payload.title,
        text: payload.text,
        url: payload.url,
      });
      return 'shared';
    } catch (err) {
      if (isAbortError(err)) {
        return 'cancelled';
      }
      // Fall through to clipboard fallback if Web Share API is blocked (e.g. iframe / permissions)
    }
  }

  const copyFn = options.copyToClipboard ?? copyTextToClipboard;
  try {
    const ok = await copyFn(formatShareClipboardText(payload));
    return ok ? 'copied' : 'failed';
  } catch {
    return 'failed';
  }
}
