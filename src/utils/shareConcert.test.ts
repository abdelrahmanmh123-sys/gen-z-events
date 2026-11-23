import test from 'node:test';
import assert from 'node:assert/strict';
import type { Concert } from '../types';
import {
  buildConcertShareData,
  formatShareClipboardText,
  shareConcertDetails,
} from './shareConcert';

const SAMPLE_CONCERT: Concert = {
  id: 'concert-qena-1',
  title: 'Nile Nights Live',
  artist: 'Cairokee',
  genre: 'Alternative Rock',
  date: 'Dec 18, 2026',
  isoDate: '2026-12-18',
  time: '8:00 PM',
  isoTime: '20:00',
  doors: '6:30 PM',
  venue: 'Qena Sports Stadium',
  priceEgp: 450,
  tierPrices: { Silver: 450, Gold: 750, VIP: 1200, Lounge: 2000 },
  seatsLeft: 180,
  totalSeats: 500,
  posterUrl: '',
  description: 'Open-air winter concert in Qena.',
};

test('buildConcertShareData includes concert title, artist, date, time, venue, price, and URL in EN and AR', () => {
  const en = buildConcertShareData(SAMPLE_CONCERT, {
    lang: 'en',
    url: 'https://gen-z-events-z.vercel.app/#lineup',
  });
  assert.equal(en.title, 'Nile Nights Live — Cairokee');
  assert.ok(en.text.includes('Nile Nights Live'));
  assert.ok(en.text.includes('Dec 18, 2026'));
  assert.ok(en.text.includes('8:00 PM'));
  assert.ok(en.text.includes('Qena Sports Stadium'));
  assert.ok(en.text.includes('450 EGP'));
  assert.equal(en.url, 'https://gen-z-events-z.vercel.app/#lineup');

  const ar = buildConcertShareData(SAMPLE_CONCERT, {
    lang: 'ar',
    url: 'https://gen-z-events-z.vercel.app/#lineup',
  });
  assert.equal(ar.title, 'Nile Nights Live — Cairokee');
  assert.ok(ar.text.includes('Nile Nights Live'));
  assert.ok(ar.text.includes('Dec 18, 2026'));
  assert.ok(ar.text.includes('Qena Sports Stadium'));
  assert.ok(ar.text.includes('ج.م'));
  assert.equal(ar.url, 'https://gen-z-events-z.vercel.app/#lineup');
});

test('shareConcertDetails invokes Web Share API with title, text, and url when supported', async () => {
  let received: ShareData | null = null;
  let clipboardCalled = false;

  const outcome = await shareConcertDetails(SAMPLE_CONCERT, {
    lang: 'en',
    url: 'https://gen-z-events-z.vercel.app/#lineup',
    navigatorShare: async (data) => {
      received = data;
    },
    copyToClipboard: async () => {
      clipboardCalled = true;
      return true;
    },
  });

  assert.equal(outcome, 'shared');
  assert.equal(clipboardCalled, false);
  assert.ok(received);
  assert.equal((received as ShareData).title, 'Nile Nights Live — Cairokee');
  assert.ok(((received as ShareData).text || '').includes('Dec 18, 2026'));
  assert.equal((received as ShareData).url, 'https://gen-z-events-z.vercel.app/#lineup');
});

test('shareConcertDetails returns cancelled without clipboard fallback when user dismisses share sheet (AbortError)', async () => {
  let clipboardCalled = false;
  const abortErr = Object.assign(new Error('Share canceled'), { name: 'AbortError' });

  const outcome = await shareConcertDetails(SAMPLE_CONCERT, {
    lang: 'en',
    navigatorShare: async () => {
      throw abortErr;
    },
    copyToClipboard: async () => {
      clipboardCalled = true;
      return true;
    },
  });

  assert.equal(outcome, 'cancelled');
  assert.equal(clipboardCalled, false);
});

test('shareConcertDetails falls back to clipboard when Web Share API is unavailable or blocked', async () => {
  let copiedText = '';

  // Case 1: Web Share API blocked (NotAllowedError)
  const blockedOutcome = await shareConcertDetails(SAMPLE_CONCERT, {
    lang: 'en',
    url: 'https://gen-z-events-z.vercel.app/#lineup',
    navigatorShare: async () => {
      throw Object.assign(new Error('Blocked in iframe'), { name: 'NotAllowedError' });
    },
    copyToClipboard: async (text) => {
      copiedText = text;
      return true;
    },
  });

  assert.equal(blockedOutcome, 'copied');
  assert.ok(copiedText.includes('Nile Nights Live'));
  assert.ok(copiedText.includes('Dec 18, 2026'));
  assert.ok(copiedText.includes('https://gen-z-events-z.vercel.app/#lineup'));

  // Case 2: Web Share API unavailable (undefined in Node / desktop browser)
  let fallbackText = '';
  const noApiOutcome = await shareConcertDetails(SAMPLE_CONCERT, {
    lang: 'ar',
    url: 'https://gen-z-events-z.vercel.app/#lineup',
    copyToClipboard: async (text) => {
      fallbackText = text;
      return true;
    },
  });

  assert.equal(noApiOutcome, 'copied');
  const expected = formatShareClipboardText(
    buildConcertShareData(SAMPLE_CONCERT, {
      lang: 'ar',
      url: 'https://gen-z-events-z.vercel.app/#lineup',
    }),
  );
  assert.equal(fallbackText, expected);
});

test('shareConcertDetails returns failed when clipboard fallback cannot copy', async () => {
  const outcome = await shareConcertDetails(SAMPLE_CONCERT, {
    lang: 'en',
    copyToClipboard: async () => false,
  });
  assert.equal(outcome, 'failed');
});
