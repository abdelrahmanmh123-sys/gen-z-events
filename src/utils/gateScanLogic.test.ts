import test from 'node:test';
import assert from 'node:assert/strict';
import type { Booking } from '../types';
import {
  buildAlreadyUsedVerdict,
  buildGateScanSuccessVerdict,
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

test('evaluateGateQrScan approves valid paid unused tickets in EN and AR', () => {
  const en = evaluateGateQrScan('gz-valid1', BASE_BOOKINGS, {
    lang: 'en',
    canConfirmPayments: false,
  });
  assert.equal(en.status, 'valid_ready');
  assert.equal(en.isValid, true);
  assert.equal(en.tone, 'success');
  assert.ok(en.verdictBadge.includes('VALID'));
  assert.ok(en.headline.includes('Ahmed Hassan'));
  assert.ok(en.headline.includes('2x'));

  const ar = evaluateGateQrScan('GZ-VALID1', BASE_BOOKINGS, {
    lang: 'ar',
    canConfirmPayments: true,
  });
  assert.equal(ar.status, 'valid_ready');
  assert.equal(ar.isValid, true);
  assert.ok(ar.verdictBadge.includes('تذكرة صالحة'));
  assert.ok(ar.reason.includes('GZ-VALID1'));
});

test('evaluateGateQrScan rejects already-used tickets with exact prior timestamp and staff detail', () => {
  const en = evaluateGateQrScan('GZ-USED22', BASE_BOOKINGS, {
    lang: 'en',
    canConfirmPayments: false,
  });
  assert.equal(en.status, 'invalid_already_used');
  assert.equal(en.isValid, false);
  assert.equal(en.tone, 'error');
  assert.ok(en.verdictBadge.includes('ALREADY USED'));
  assert.ok(en.reason.includes('7:42 PM'));
  assert.ok(en.reason.includes('Gate Officer 1'));

  const ar = evaluateGateQrScan('GZ-USED22', BASE_BOOKINGS, {
    lang: 'ar',
    canConfirmPayments: false,
  });
  assert.equal(ar.status, 'invalid_already_used');
  assert.equal(ar.isValid, false);
  assert.ok(ar.verdictBadge.includes('مستخدمة مسبقاً'));
  assert.ok(ar.reason.includes('7:42 PM'));
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

test('evaluateGateQrScan allows a 5-ticket QR to be scanned 5 times showing (1/5) through (5/5) and rejects scan #6', () => {
  let multiBooking: Booking = {
    ...BASE_BOOKINGS[0],
    bookingCode: 'GZ-FIVE55',
    quantity: 5,
    checkedIn: false,
    checkedInCount: 0,
    checkedInAt: '',
    approvedBy: '',
  };

  for (let scanNum = 1; scanNum <= 5; scanNum++) {
    const en = evaluateGateQrScan('GZ-FIVE55', [multiBooking], {
      lang: 'en',
      canConfirmPayments: false,
    });
    assert.equal(en.status, 'valid_ready');
    assert.equal(en.isValid, true);
    assert.equal(en.tone, 'success');
    assert.equal(en.admittedCount, scanNum);
    assert.equal(en.totalQuantity, 5);
    assert.equal(en.remainingEntries, 5 - scanNum);
    assert.ok(en.verdictBadge.includes(`(${scanNum}/5)`), `Expected (${scanNum}/5) in EN badge: ${en.verdictBadge}`);
    assert.ok(en.headline.includes(`(${scanNum}/5)`), `Expected (${scanNum}/5) in EN headline: ${en.headline}`);
    assert.ok(en.reason.includes(`(${scanNum}/5)`), `Expected (${scanNum}/5) in EN reason: ${en.reason}`);
    assert.equal(en.booking?.checkedInCount, scanNum);
    assert.equal(en.booking?.checkedIn, scanNum === 5);

    const ar = evaluateGateQrScan('GZ-FIVE55', [multiBooking], {
      lang: 'ar',
      canConfirmPayments: false,
    });
    assert.equal(ar.isValid, true);
    assert.ok(ar.verdictBadge.includes(`(${scanNum}/5)`), `Expected (${scanNum}/5) in AR badge: ${ar.verdictBadge}`);
    assert.ok(ar.reason.includes(`(${scanNum}/5)`), `Expected (${scanNum}/5) in AR reason: ${ar.reason}`);

    // Simulate persisted Firestore state advancing to next scan
    multiBooking = {
      ...multiBooking,
      checkedInCount: scanNum,
      checkedIn: scanNum >= 5,
      checkedInAt: `8:0${scanNum} PM`,
      approvedBy: 'Gate Officer 2',
    };
  }

  // 6th scan must be rejected as fully used (5/5)
  const sixthEn = evaluateGateQrScan('GZ-FIVE55', [multiBooking], {
    lang: 'en',
    canConfirmPayments: false,
  });
  assert.equal(sixthEn.status, 'invalid_already_used');
  assert.equal(sixthEn.isValid, false);
  assert.equal(sixthEn.tone, 'error');
  assert.equal(sixthEn.admittedCount, 5);
  assert.equal(sixthEn.totalQuantity, 5);
  assert.equal(sixthEn.remainingEntries, 0);
  assert.ok(sixthEn.verdictBadge.includes('(5/5)'));
  assert.ok(sixthEn.reason.includes('(5/5)'));
  assert.ok(sixthEn.reason.includes('8:05 PM'));

  const sixthAr = evaluateGateQrScan('GZ-FIVE55', [multiBooking], {
    lang: 'ar',
    canConfirmPayments: false,
  });
  assert.equal(sixthAr.status, 'invalid_already_used');
  assert.equal(sixthAr.isValid, false);
  assert.ok(sixthAr.verdictBadge.includes('(5/5)'));
  assert.ok(sixthAr.reason.includes('(5/5)'));
});

test('multi-ticket scan verdict handles legacy bookings without checkedInCount and concurrent other-gate conflict', () => {
  const legacyFull: Booking = {
    ...BASE_BOOKINGS[0],
    bookingCode: 'GZ-LEG04',
    quantity: 4,
    checkedIn: true,
    checkedInAt: '7:30 PM',
    approvedBy: 'Lead Staff',
  };
  const rejected = evaluateGateQrScan('GZ-LEG04', [legacyFull], {
    lang: 'en',
    canConfirmPayments: false,
  });
  assert.equal(rejected.status, 'invalid_already_used');
  assert.equal(rejected.isValid, false);
  assert.ok(rejected.verdictBadge.includes('(4/4)'));

  const otherGate = buildAlreadyUsedVerdict(legacyFull, {
    lang: 'en',
    checkedAt: '8:11 PM',
    approvedBy: 'Gate B',
    scannedOnOtherGate: true,
  });
  assert.equal(otherGate.isValid, false);
  assert.ok(otherGate.reason.includes('another scanner'));
  assert.ok(otherGate.reason.includes('(4/4)'));

  const paidAndAdmitted = buildGateScanSuccessVerdict(
    { ...BASE_BOOKINGS[2], quantity: 5 },
    1,
    { lang: 'en', paidAndAdmitted: true },
  );
  assert.equal(paidAndAdmitted.isValid, true);
  assert.ok(paidAndAdmitted.verdictBadge.includes('(1/5)'));
  assert.equal(paidAndAdmitted.remainingEntries, 4);
  assert.equal(paidAndAdmitted.booking?.checkedIn, false);
});
