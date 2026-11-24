import test from 'node:test';
import assert from 'node:assert/strict';
import type { Booking } from '../types';
import {
  buildUnreadableQrVerdict,
  evaluateGateQrScan,
  formatScannedCodePreview,
  isGenZTicketCodeFormat,
} from './gateScanLogic';

const BASE_BOOKINGS: Booking[] = [
  {
    bookingCode: 'GZ-VALID1',
    concertId: 'c1',
    concertTitle: 'Qena Winter Live',
    concertDate: 'Dec 18, 2026',
    concertTime: '8:00 PM',
    concertVenue: 'Qena Stadium',
    tier: 'VIP',
    quantity: 2,
    unitPrice: 1200,
    discountEgp: 0,
    totalEgp: 2400,
    promoCode: '',
    customerName: 'Ahmed Hassan',
    customerEmail: 'ahmed@example.com',
    customerMobile: '01012345678',
    paymentMethod: 'InstaPay',
    transferRef: 'IP-9988',
    paymentStatus: 'Paid',
    checkedIn: false,
    checkedInAt: '',
    scansUsed: 0,
    approvedBy: '',
    approvalMethod: '',
    userId: 'u1',
  },
  {
    bookingCode: 'GZ-USED22',
    concertId: 'c1',
    concertTitle: 'Qena Winter Live',
    concertDate: 'Dec 18, 2026',
    concertTime: '8:00 PM',
    concertVenue: 'Qena Stadium',
    tier: 'Gold',
    quantity: 1,
    unitPrice: 750,
    discountEgp: 0,
    totalEgp: 750,
    promoCode: '',
    customerName: 'Mariam Ali',
    customerEmail: 'mariam@example.com',
    customerMobile: '01122334455',
    paymentMethod: 'Mobile Wallets',
    transferRef: 'MW-1122',
    paymentStatus: 'Paid',
    checkedIn: true,
    checkedInAt: '7:42 PM',
    scansUsed: 1,
    approvedBy: 'Gate Officer 1',
    approvalMethod: 'Camera QR',
    userId: 'u2',
  },
  {
    bookingCode: 'GZ-PEND33',
    concertId: 'c1',
    concertTitle: 'Qena Winter Live',
    concertDate: 'Dec 18, 2026',
    concertTime: '8:00 PM',
    concertVenue: 'Qena Stadium',
    tier: 'Silver',
    quantity: 3,
    unitPrice: 400,
    discountEgp: 0,
    totalEgp: 1200,
    promoCode: '',
    customerName: 'Youssef Nabil',
    customerEmail: 'youssef@example.com',
    customerMobile: '01233445566',
    paymentMethod: 'InstaPay',
    transferRef: 'IP-4455',
    paymentStatus: 'Pending',
    checkedIn: false,
    checkedInAt: '',
    scansUsed: 0,
    approvedBy: '',
    approvalMethod: '',
    userId: 'u3',
  },
];

test('isGenZTicketCodeFormat accurately separates official ticket formats from foreign QRs', () => {
  assert.equal(isGenZTicketCodeFormat('GZ-ABC123'), true);
  assert.equal(isGenZTicketCodeFormat('OFF-BOOTH-09'), true);
  assert.equal(isGenZTicketCodeFormat('https://restaurant.example.com/menu'), false);
  assert.equal(isGenZTicketCodeFormat('WIFI:T:WPA;S:GuestNet;P:1234;;'), false);
  assert.equal(isGenZTicketCodeFormat('random text with spaces'), false);
  assert.equal(isGenZTicketCodeFormat('1234567890'), false);
});

test('evaluateGateQrScan approves valid paid unused tickets in EN and AR with scan count', () => {
  const en = evaluateGateQrScan('gz-valid1', BASE_BOOKINGS, {
    lang: 'en',
    canConfirmPayments: false,
  });
  assert.ok(en.status === 'valid_ready' || en.status === 'valid_partial');
  assert.equal(en.isValid, true);
  assert.equal(en.tone, 'success');
  assert.ok(en.verdictBadge.includes('VALID'));
  assert.ok(en.verdictBadge.includes('1/2'));
  assert.ok(en.headline.includes('Ahmed Hassan'));
  assert.ok(en.headline.includes('2x'));
  assert.ok(en.reason.includes('Scan 1 of 2'));

  const ar = evaluateGateQrScan('GZ-VALID1', BASE_BOOKINGS, {
    lang: 'ar',
    canConfirmPayments: true,
  });
  assert.ok(ar.status === 'valid_ready' || ar.status === 'valid_partial');
  assert.equal(ar.isValid, true);
  assert.ok(ar.verdictBadge.includes('تذكرة صالحة'));
  assert.ok(ar.reason.includes('GZ-VALID1'));
  assert.ok(ar.reason.includes('1'));
});

test('evaluateGateQrScan rejects already-used tickets with exact prior timestamp and staff detail', () => {
  const en = evaluateGateQrScan('GZ-USED22', BASE_BOOKINGS, {
    lang: 'en',
    canConfirmPayments: false,
  });
  assert.equal(en.status, 'invalid_already_used');
  assert.equal(en.isValid, false);
  assert.equal(en.tone, 'error');
  assert.ok(en.verdictBadge.includes('ALL SCANS USED'));
  assert.ok(en.reason.includes('7:42 PM'));
  assert.ok(en.reason.includes('Gate Officer 1'));

  const ar = evaluateGateQrScan('GZ-USED22', BASE_BOOKINGS, {
    lang: 'ar',
    canConfirmPayments: false,
  });
  assert.equal(ar.status, 'invalid_already_used');
  assert.equal(ar.isValid, false);
  assert.ok(ar.verdictBadge.includes('جميع المسحات'));
  assert.ok(ar.reason.includes('7:42 PM'));
});

test('multi-scan: allows scanning quantity times showing (1/5) through (5/5) and blocks on 6th scan', () => {
  const multiPassBooking: Booking = {
    bookingCode: 'GZ-MULTI5',
    concertId: 'c1',
    concertTitle: 'Houda Live Qena',
    concertDate: 'Dec 18, 2026',
    concertTime: '8:00 PM',
    concertVenue: 'Qena Stadium',
    tier: 'VIP',
    quantity: 5,
    unitPrice: 500,
    discountEgp: 0,
    totalEgp: 2500,
    promoCode: '',
    customerName: 'Kareem Tarek',
    customerEmail: 'kareem@example.com',
    customerMobile: '01099887766',
    paymentMethod: 'InstaPay',
    transferRef: 'IP-5555',
    paymentStatus: 'Paid',
    checkedIn: false,
    checkedInAt: '',
    scansUsed: 0,
    approvedBy: '',
    approvalMethod: '',
    userId: 'u5',
  };

  const roster = [multiPassBooking];

  // Scan 1
  const scan1 = evaluateGateQrScan('GZ-MULTI5', roster, { lang: 'en', canConfirmPayments: false });
  assert.equal(scan1.status, 'valid_partial');
  assert.equal(scan1.isValid, true);
  assert.ok(scan1.verdictBadge.includes('(1/5)'));
  assert.equal(scan1.booking?.scansUsed, 1);
  assert.equal(scan1.booking?.checkedIn, false);

  // Update mock booking to 1 scan used
  roster[0] = { ...roster[0], scansUsed: 1 };
  const scan2 = evaluateGateQrScan('GZ-MULTI5', roster, { lang: 'en', canConfirmPayments: false });
  assert.equal(scan2.status, 'valid_partial');
  assert.equal(scan2.isValid, true);
  assert.ok(scan2.verdictBadge.includes('(2/5)'));
  assert.equal(scan2.booking?.scansUsed, 2);
  assert.equal(scan2.booking?.checkedIn, false);

  // Scan 5 (final valid scan)
  roster[0] = { ...roster[0], scansUsed: 4 };
  const scan5 = evaluateGateQrScan('GZ-MULTI5', roster, { lang: 'en', canConfirmPayments: false });
  assert.equal(scan5.status, 'valid_ready');
  assert.equal(scan5.isValid, true);
  assert.ok(scan5.verdictBadge.includes('(5/5)'));
  assert.equal(scan5.booking?.scansUsed, 5);
  assert.equal(scan5.booking?.checkedIn, true);

  // Scan 6 (exceeded)
  roster[0] = { ...roster[0], scansUsed: 5, checkedIn: true, checkedInAt: '8:15 PM', approvedBy: 'Gate Staff 2' };
  const scan6 = evaluateGateQrScan('GZ-MULTI5', roster, { lang: 'en', canConfirmPayments: false });
  assert.equal(scan6.status, 'invalid_already_used');
  assert.equal(scan6.isValid, false);
  assert.ok(scan6.verdictBadge.includes('(5/5)'));
  assert.ok(scan6.reason.includes('used all 5 available scans'));
});

test('evaluateGateQrScan clearly flags foreign QR codes that are not from our tickets', () => {
  const foreignUrl = 'https://other-site.example.com/ticket/99812345678901234567890';
  const en = evaluateGateQrScan(foreignUrl, BASE_BOOKINGS, {
    lang: 'en',
    canConfirmPayments: false,
  });
  assert.equal(en.status, 'invalid_wrong_qr');
  assert.equal(en.isValid, false);
  assert.equal(en.tone, 'error');
  assert.ok(en.verdictBadge.includes('WRONG QR'));
  assert.ok(en.headline.includes('Not a Gen Z Events Ticket'));
  assert.ok((en.scannedCode || '').length <= 48);

  const ar = evaluateGateQrScan('WIFI:S:CoffeeShop;;', BASE_BOOKINGS, {
    lang: 'ar',
    canConfirmPayments: false,
  });
  assert.equal(ar.status, 'invalid_wrong_qr');
  assert.equal(ar.isValid, false);
  assert.ok(ar.headline.includes('ليس من تذاكر'));
});

test('evaluateGateQrScan flags unregistered GZ- codes as invalid and not found in our database', () => {
  const en = evaluateGateQrScan('GZ-FAKE99', BASE_BOOKINGS, {
    lang: 'en',
    canConfirmPayments: false,
  });
  assert.equal(en.status, 'invalid_not_found');
  assert.equal(en.isValid, false);
  assert.equal(en.tone, 'error');
  assert.ok(en.reason.includes('GZ-FAKE99'));
  assert.ok(en.reason.includes('not from our tickets'));

  const ar = evaluateGateQrScan('GZ-FAKE99', BASE_BOOKINGS, {
    lang: 'ar',
    canConfirmPayments: false,
  });
  assert.equal(ar.status, 'invalid_not_found');
  assert.equal(ar.isValid, false);
  assert.ok(ar.reason.includes('غير مسجل'));
});

test('evaluateGateQrScan rejects unpaid tickets with role-specific guidance and handles unreadable images', () => {
  const gate = evaluateGateQrScan('GZ-PEND33', BASE_BOOKINGS, {
    lang: 'en',
    canConfirmPayments: false,
  });
  assert.equal(gate.status, 'invalid_unpaid');
  assert.equal(gate.isValid, false);
  assert.equal(gate.tone, 'warn');
  assert.ok(gate.reason.includes('Super Admin'));

  const superAdmin = evaluateGateQrScan('GZ-PEND33', BASE_BOOKINGS, {
    lang: 'ar',
    canConfirmPayments: true,
  });
  assert.equal(superAdmin.status, 'invalid_unpaid');
  assert.equal(superAdmin.isValid, false);
  assert.ok(superAdmin.reason.includes('تأكيد الدفع بالأسفل'));

  const unreadable = buildUnreadableQrVerdict('ar');
  assert.equal(unreadable.status, 'invalid_unreadable');
  assert.equal(unreadable.isValid, false);
  assert.equal(formatScannedCodePreview('   abc   def   ', 10), 'abc def');
});

test('camera fallback chain, error classification, and mobile image downscaling work cleanly', async () => {
  const {
    getCameraConstraintFallbacks,
    classifyCameraError,
    computeDecodedImageDimensions,
  } = await import('./gateScanLogic');

  const fallbacks = getCameraConstraintFallbacks();
  assert.equal(fallbacks.length, 3);
  assert.deepEqual(fallbacks[2], { video: true, audio: false });

  const iframeBlocked = classifyCameraError(
    { name: 'NotAllowedError' },
    { lang: 'en', isEmbedded: true, isSecureContext: true },
  );
  assert.ok(iframeBlocked.title.includes('Embedded Frame'));
  assert.equal(iframeBlocked.canRetry, true);

  const browserDenied = classifyCameraError(
    { name: 'NotAllowedError' },
    { lang: 'ar', isEmbedded: false, isSecureContext: true },
  );
  assert.ok(browserDenied.title.includes('مرفوضة'));
  assert.ok(browserDenied.detail.includes('القفل'));

  const busy = classifyCameraError(
    { name: 'NotReadableError' },
    { lang: 'en', isEmbedded: false, isSecureContext: true },
  );
  assert.ok(busy.title.includes('Busy'));

  const insecure = classifyCameraError(
    { name: 'SecurityError' },
    { lang: 'en', isEmbedded: false, isSecureContext: false },
  );
  assert.equal(insecure.canRetry, false);

  // Downscales 4000x3000 Samsung Galaxy photo proportionally to max 1400px
  assert.deepEqual(computeDecodedImageDimensions(4000, 3000, 1400), {
    width: 1400,
    height: 1050,
  });
  assert.deepEqual(computeDecodedImageDimensions(800, 600, 1400), {
    width: 800,
    height: 600,
  });
});
