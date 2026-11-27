import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getStaffPermissions } from './bookingLogic';
import {
  buildStaffWhatsAppBookingUrl,
  buildStaffWhatsAppWaitlistUrl,
  runStaffQuickSearch,
  scoreBookingMatch,
  toWhatsAppPhoneDigits,
  type StaffQuickSearchDataset,
} from './staffQuickSearch';
import type { Booking, Concert, Promo, WaitlistEntry } from '../types';

const SAMPLE_CONCERTS: Concert[] = [
  {
    id: 'houda-qena',
    title: 'Houda x Qena',
    artist: 'Houda Bondok',
    venue: 'Qena Cultural Palace Arena',
    isoDate: '2026-12-20',
    isoTime: '20:00',
    date: 'Sun, Dec 20, 2026',
    time: '8:00 PM',
    doors: '6:30 PM',
    genre: 'Shaabi / Urban',
    priceEgp: 250,
    tierPrices: { Silver: 250, Gold: 350, VIP: 500, Lounge: 800 },
    totalSeats: 600,
    seatsLeft: 320,
    description: 'Live night in Qena.',
    posterUrl: '',
  },
];

const SAMPLE_BOOKINGS: Booking[] = [
  {
    bookingCode: 'GZ-PAY001',
    userId: 'u1',
    concertId: 'houda-qena',
    concertTitle: 'Houda x Qena',
    concertDate: 'Sun, Dec 20, 2026',
    concertTime: '8:00 PM',
    concertVenue: 'Qena Cultural Palace Arena',
    tier: 'VIP',
    quantity: 2,
    unitPrice: 500,
    promoCode: '',
    discountEgp: 0,
    totalEgp: 1000,
    paymentMethod: 'InstaPay',
    transferRef: 'REF-998877',
    paymentStatus: 'Pending',
    checkedIn: false,
    checkedInCount: 0,
    checkedInAt: '',
    approvedBy: '',
    approvalMethod: '',
    customerName: 'Ahmed Hassan',
    customerMobile: '01099887766',
    customerEmail: 'ahmed@example.com',
  },
  {
    bookingCode: 'GZ-RDY002',
    userId: 'u2',
    concertId: 'houda-qena',
    concertTitle: 'Houda x Qena',
    concertDate: 'Sun, Dec 20, 2026',
    concertTime: '8:00 PM',
    concertVenue: 'Qena Cultural Palace Arena',
    tier: 'Gold',
    quantity: 3,
    unitPrice: 350,
    promoCode: 'GENZ15',
    discountEgp: 158,
    totalEgp: 892,
    paymentMethod: 'Mobile Wallets',
    transferRef: '01122334455',
    paymentStatus: 'Paid',
    checkedIn: false,
    checkedInCount: 1,
    checkedInAt: '7:45 PM',
    approvedBy: 'Lead Organizer',
    approvalMethod: 'Desk Confirm',
    customerName: 'Salma Khaled',
    customerMobile: '01122334455',
    customerEmail: 'salma@example.com',
  },
];

const SAMPLE_PROMOS: Promo[] = [
  { code: 'GENZ15', type: 'percent', value: 15, tiers: [], label: '15% Off', active: true },
  { code: 'LOUNGE50', type: 'flat', value: 50, tiers: ['Lounge'], label: '50 EGP Off', active: true },
];

const SAMPLE_WAITLIST: WaitlistEntry[] = [
  {
    id: 'wl-1',
    userId: 'u3',
    concertId: 'houda-qena',
    concertTitle: 'Houda x Qena',
    name: 'Omar Nabil',
    mobile: '01233445566',
    email: 'omar@example.com',
  },
];

const DATASET: StaffQuickSearchDataset = {
  bookings: SAMPLE_BOOKINGS,
  concerts: SAMPLE_CONCERTS,
  promos: SAMPLE_PROMOS,
  waitlist: SAMPLE_WAITLIST,
};

describe('Staff Global Quick Search (Ctrl+K) — Ranking, RBAC & WhatsApp Suite', () => {
  it('ranks exact booking code highest and supports Arabic-Indic digits, transfer refs, and multi-word queries', () => {
    assert.ok(scoreBookingMatch(SAMPLE_BOOKINGS[0], 'GZ-PAY001') > scoreBookingMatch(SAMPLE_BOOKINGS[0], 'GZ-PAY'));
    assert.ok(scoreBookingMatch(SAMPLE_BOOKINGS[0], '٠١٠٩٩٨٨٧٧٦٦') >= 700);
    assert.ok(scoreBookingMatch(SAMPLE_BOOKINGS[0], 'REF-998877') >= 800);
    assert.ok(scoreBookingMatch(SAMPLE_BOOKINGS[0], 'ahmed vip pending') > 0);
    assert.equal(scoreBookingMatch(SAMPLE_BOOKINGS[0], 'nonexistent-xyz'), 0);

    const superPerms = getStaffPermissions('Super Admin');
    const byArabicMobile = runStaffQuickSearch(DATASET, '٠١٠٩٩٨٨', superPerms);
    assert.deepEqual(
      byArabicMobile.bookings.map((b) => b.bookingCode),
      ['GZ-PAY001'],
    );
  });

  it('strictly enforces Gate Staff RBAC isolation by hiding Promos and Waitlist results', () => {
    const superPerms = getStaffPermissions('Super Admin');
    const gatePerms = getStaffPermissions('Gate Staff');

    const superPromoRes = runStaffQuickSearch(DATASET, 'LOUNGE50', superPerms);
    assert.equal(superPromoRes.promos.length, 1);

    const gatePromoRes = runStaffQuickSearch(DATASET, 'LOUNGE50', gatePerms);
    assert.equal(gatePromoRes.promos.length, 0);

    const superWaitlistRes = runStaffQuickSearch(DATASET, 'Omar Nabil', superPerms);
    assert.equal(superWaitlistRes.waitlist.length, 1);

    const gateWaitlistRes = runStaffQuickSearch(DATASET, 'Omar Nabil', gatePerms);
    assert.equal(gateWaitlistRes.waitlist.length, 0);
  });

  it('surfaces Pending approvals first for Super Admin and Paid ready-to-admit first for Gate Staff when query is empty', () => {
    const superPerms = getStaffPermissions('Super Admin');
    const gatePerms = getStaffPermissions('Gate Staff');

    const superPreview = runStaffQuickSearch(DATASET, '', superPerms);
    assert.equal(superPreview.isDefaultPreview, true);
    assert.equal(superPreview.bookings[0]?.bookingCode, 'GZ-PAY001');

    const gatePreview = runStaffQuickSearch(DATASET, '', gatePerms);
    assert.equal(gatePreview.isDefaultPreview, true);
    assert.equal(gatePreview.bookings[0]?.bookingCode, 'GZ-RDY002');
  });

  it('normalizes Egyptian and Arabic-Indic mobiles into WhatsApp URLs with bilingual messages', () => {
    assert.equal(toWhatsAppPhoneDigits('01099887766'), '201099887766');
    assert.equal(toWhatsAppPhoneDigits('+٢٠١٠٩٩٨٨٧٧٦٦'), '201099887766');
    assert.equal(toWhatsAppPhoneDigits('123'), '');

    const paidUrlEn = buildStaffWhatsAppBookingUrl(SAMPLE_BOOKINGS[1], 'en');
    assert.ok(paidUrlEn?.startsWith('https://wa.me/201122334455?text='));
    assert.ok(decodeURIComponent(paidUrlEn!).includes('GZ-RDY002'));
    assert.ok(decodeURIComponent(paidUrlEn!).includes('confirmed'));

    const pendingUrlAr = buildStaffWhatsAppBookingUrl(SAMPLE_BOOKINGS[0], 'ar');
    assert.ok(pendingUrlAr?.startsWith('https://wa.me/201099887766?text='));
    assert.ok(decodeURIComponent(pendingUrlAr!).includes('GZ-PAY001'));
    assert.ok(decodeURIComponent(pendingUrlAr!).includes('إيصال التحويل'));

    const wlUrl = buildStaffWhatsAppWaitlistUrl(SAMPLE_WAITLIST[0], 'en');
    assert.ok(wlUrl?.startsWith('https://wa.me/201233445566?text='));
    assert.ok(decodeURIComponent(wlUrl!).includes('Houda x Qena'));
  });
});
