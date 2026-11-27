import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  ADMIN_SESSION_TTL_MS,
  buildAttendeesCsv,
  buildCalendarIcs,
  buildUndoPaymentPatch,
  calculateOrderTotals,
  canAccessAdminTab,
  canDisplayBookingQr,
  computeAdjustedSeatsLeft,
  computeAdminKpis,
  computeCountdown,
  computeRestoredSeatsLeft,
  DEFAULT_PAYMENT_CONFIG,
  emailToDocId,
  escapeCsvCell,
  evaluatePasswordStrength,
  evaluatePromo,
  filterAndSortConcerts,
  fitPosterDimensions,
  formatCheckInProgress,
  formatDateTimeDisplay,
  formatFriendlyFirebaseError,
  generateBookingCode,
  getBookingCheckedInCount,
  getBookingRemainingEntries,
  getDefaultUpcomingIsoDate,
  getNextUpcomingConcert,
  getStaffPermissions,
  getTierColorHex,
  getTierUnitPrice,
  hexToRgba,
  isAdminSessionActive,
  isBookingFullyCheckedIn,
  isEmailVerifiedAdminCandidate,
  isPendingEmailVerification,
  isSafeHttpsUrl,
  isSafeImageUrl,
  isValidHexColor,
  isVerifiedFanAccount,
  MAX_POSTER_DATA_URL_LENGTH,
  normalizeEgyptianMobile,
  normalizeHexColor,
  normalizeOfflineMobile,
  normalizePromoTiers,
  normalizeScheduleDateTime,
  normalizeTierValue,
  OFFLINE_USER_ID,
  parseBoundedIntInput,
  parseOfflineTicketRows,
  partitionAdminSessions,
  resolveBookingConcertDetails,
  resolvePaymentConfig,
  sanitizeId,
  sanitizeSpreadsheetCell,
  sortByCreatedAtDesc,
  sortByUpdatedAtDesc,
  suggestTierPrices,
  togglePromoTier,
  validateAndBuildConcertEditPayload,
  validateBookingInput,
  validateEgyptianMobile,
  validateEmailAddress,
  validateFullName,
  validatePaymentConfigInput,
  validateProfileUpdateInput,
  validateSignupInput,
  validateTierColors,
  validateWaitlistInput,
} from './bookingLogic.ts';
import type { AdminSession, Booking, Concert, Promo } from '../types.ts';
import { buildOfflineExportRows } from './excelOffline.ts';

const TEST_PROMOS: Promo[] = [
  { code: 'GENZ15', type: 'percent', value: 15, tiers: [], label: 'GENZ15 (15% Off)', active: true },
  { code: 'VIP100', type: 'flat', value: 100, tiers: ['VIP', 'Lounge'], label: 'VIP100 (100 EGP Off)', active: true },
];

const TEST_CONCERTS: Concert[] = [
  {
    id: 'qena-01',
    title: 'Upper Egypt Rising',
    artist: 'Qena Collective',
    venue: 'Qena Cultural Palace, Hall A',
    isoDate: '2026-12-04',
    isoTime: '20:00',
    date: 'Fri, Dec 4, 2026',
    time: '8:00 PM',
    doors: '6:30 PM',
    genre: 'Indie Pop / Rap',
    priceEgp: 220,
    tierPrices: { Silver: 220, Gold: 320, VIP: 450, Lounge: 700 },
    totalSeats: 600,
    seatsLeft: 420,
    description: 'Live concert night in Qena.',
    posterUrl: '',
  },
  {
    id: 'qena-02',
    title: 'Nile Echoes Live',
    artist: 'South Nile Ensemble',
    venue: 'Qena Corniche Open Air',
    isoDate: '2026-12-11',
    isoTime: '20:30',
    date: 'Fri, Dec 11, 2026',
    time: '8:30 PM',
    doors: '7:00 PM',
    genre: 'Acoustic / Fusion',
    priceEgp: 260,
    tierPrices: { Silver: 260, Gold: 380, VIP: 540, Lounge: 820 },
    totalSeats: 500,
    seatsLeft: 310,
    description: 'Riverside acoustic fusion night.',
    posterUrl: '',
  },
  {
    id: 'qena-03',
    title: 'Desert Bass Arena',
    artist: 'Luxor & Qena DJs',
    venue: 'Qena Sports Stadium',
    isoDate: '2026-12-18',
    isoTime: '19:00',
    date: 'Fri, Dec 18, 2026',
    time: '7:00 PM',
    doors: '5:30 PM',
    genre: 'Electronic / Afro',
    priceEgp: 300,
    tierPrices: { Silver: 300, Gold: 440, VIP: 630, Lounge: 960 },
    totalSeats: 1200,
    seatsLeft: 890,
    description: 'High-energy stadium concert.',
    posterUrl: '',
  },
  {
    id: 'qena-06',
    title: 'Campus Acoustic Unplugged',
    artist: 'SVU Indie Band',
    venue: 'South Valley Stage',
    isoDate: '2026-12-25',
    isoTime: '18:30',
    date: 'Fri, Dec 25, 2026',
    time: '6:30 PM',
    doors: '5:00 PM',
    genre: 'Acoustic / Fusion',
    priceEgp: 150,
    tierPrices: { Silver: 150, Gold: 220, VIP: 320, Lounge: 480 },
    totalSeats: 400,
    seatsLeft: 250,
    description: 'Student unplugged session.',
    posterUrl: '',
  },
];

describe('Gen Z Events — Exhaustive Business, Auth & Security Logic Suite', () => {
  it('normalizes email to Firestore-safe doc ID consistently across edge characters', () => {
    assert.equal(emailToDocId('WeenTamalak@Gmail.com'), 'weentamalak_at_gmail_dot_com');
    assert.equal(emailToDocId('  staff.gate+qena@genzevents.eg  '), 'staff_dot_gate_qena_at_genzevents_dot_eg');
    assert.equal(emailToDocId('a_b-c@sub.domain.org'), 'a_b-c_at_sub_dot_domain_dot_org');
  });

  it('sanitizes arbitrary IDs into Firestore-safe slugs with fallback for short inputs', () => {
    assert.equal(sanitizeId('  Upper Egypt Rising!! 2026  '), 'upper-egypt-rising-2026');
    assert.equal(sanitizeId('---hello_world---'), 'hello_world');
    const fallback = sanitizeId('!@#', 'show');
    assert.match(fallback, /^show-[a-z0-9]{4,8}$/);
    assert.ok(sanitizeId('a'.repeat(120)).length <= 48);
  });

  it('suggests tier prices rounded to nearest 10 EGP and resolves explicit vs fallback tier pricing', () => {
    const prices = suggestTierPrices(200);
    assert.deepEqual(prices, { Silver: 200, Gold: 290, VIP: 420, Lounge: 640 });

    const floored = suggestTierPrices(10);
    assert.equal(floored.Silver, 50);

    assert.equal(getTierUnitPrice(TEST_CONCERTS[0], 'VIP'), TEST_CONCERTS[0].tierPrices.VIP);
    assert.equal(
      getTierUnitPrice({ priceEgp: 300, tierPrices: { Silver: 300, Gold: NaN, VIP: -5, Lounge: 900 } }, 'Gold'),
      440,
    );
    assert.equal(
      getTierUnitPrice({ priceEgp: 300, tierPrices: { Silver: 300, Gold: NaN, VIP: -5, Lounge: 900 } }, 'VIP'),
      630,
    );
  });

  it('evaluates percentage, flat, capped, inactive, and tier-restricted promo codes accurately', () => {
    const pct = evaluatePromo('  genz15 ', 'Silver', 400, TEST_PROMOS);
    assert.equal(pct.valid, true);
    assert.equal(pct.discountEgp, 60);

    const vipOnSilver = evaluatePromo('VIP100', 'Silver', 400, TEST_PROMOS);
    assert.equal(vipOnSilver.valid, false);
    assert.equal(vipOnSilver.discountEgp, 0);

    const vipOnLounge = evaluatePromo('VIP100', 'Lounge', 700, TEST_PROMOS);
    assert.equal(vipOnLounge.valid, true);
    assert.equal(vipOnLounge.discountEgp, 100);

    const customPromos: Promo[] = [
      { code: 'MEGA99', type: 'percent', value: 99, tiers: [], label: 'Mega', active: true },
      { code: 'HUGEFLAT', type: 'flat', value: 5000, tiers: [], label: 'Flat', active: true },
      { code: 'PAUSED', type: 'percent', value: 20, tiers: [], label: 'Paused', active: false },
    ];
    assert.equal(evaluatePromo('MEGA99', 'Silver', 1000, customPromos).discountEgp, 900);
    assert.equal(evaluatePromo('HUGEFLAT', 'Silver', 350, customPromos).discountEgp, 350);
    assert.equal(evaluatePromo('PAUSED', 'Silver', 1000, customPromos).valid, false);
    assert.equal(evaluatePromo('   ', 'Silver', 1000, customPromos).message, '');
  });

  it('calculates order totals, clamps quantity to 1..20, and prevents negative totals', () => {
    const res = calculateOrderTotals(TEST_CONCERTS[0], 'VIP', 2, 'VIP100', TEST_PROMOS);
    assert.equal(res.unitPrice, 450);
    assert.equal(res.subtotalEgp, 900);
    assert.equal(res.discountEgp, 100);
    assert.equal(res.totalEgp, 800);

    assert.equal(calculateOrderTotals(TEST_CONCERTS[0], 'Silver', 99, '', TEST_PROMOS).quantity, 20);
    assert.equal(calculateOrderTotals(TEST_CONCERTS[0], 'Silver', 0, '', TEST_PROMOS).quantity, 1);
    assert.equal(calculateOrderTotals(TEST_CONCERTS[0], 'Silver', -4, '', TEST_PROMOS).quantity, 1);
    assert.equal(calculateOrderTotals(TEST_CONCERTS[0], 'Silver', 2.9, '', TEST_PROMOS).quantity, 2);

    const freePromo: Promo[] = [{ code: 'FREE', type: 'flat', value: 99999, tiers: [], label: 'Free', active: true }];
    assert.equal(calculateOrderTotals(TEST_CONCERTS[0], 'Silver', 1, 'FREE', freePromo).totalEgp, 0);
  });

  it('generates valid, unambiguous GZ- booking codes with high uniqueness', () => {
    const codes = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const code = generateBookingCode();
      assert.match(code, /^GZ-[A-HJ-NP-Z2-9]{6}$/);
      codes.add(code);
    }
    assert.ok(codes.size >= 195);
  });

  it('formats concert dates, times, and 90-min-earlier doors including midnight wraparound', () => {
    const evening = formatDateTimeDisplay('2026-12-04', '20:00');
    assert.equal(evening.date, 'Fri, Dec 4, 2026');
    assert.equal(evening.time, '8:00 PM');
    assert.equal(evening.doors, '6:30 PM');

    const midnight = formatDateTimeDisplay('2026-12-05', '00:00');
    assert.equal(midnight.time, '12:00 AM');
    assert.equal(midnight.doors, '10:30 PM');

    const afterMidnight = formatDateTimeDisplay('2026-12-05', '00:45');
    assert.equal(afterMidnight.time, '12:45 AM');
    assert.equal(afterMidnight.doors, '11:15 PM');

    const oneThirty = formatDateTimeDisplay('2026-12-05', '01:30');
    assert.equal(oneThirty.time, '1:30 AM');
    assert.equal(oneThirty.doors, '12:00 AM');

    const noon = formatDateTimeDisplay('2026-12-05', '12:00');
    assert.equal(noon.time, '12:00 PM');
    assert.equal(noon.doors, '10:30 AM');

    const fallback = formatDateTimeDisplay('bad-date', 'bad-time');
    assert.equal(fallback.date, 'Fri, Dec 4, 2026');
    assert.equal(fallback.time, '8:00 PM');
  });

  it('computes live countdown precisely and detects boundary & past shows', () => {
    const before = new Date('2026-12-03T18:29:15+02:00').getTime();
    const cd = computeCountdown('2026-12-04', '20:00', before);
    assert.equal(cd.isPast, false);
    assert.equal(cd.days, 1);
    assert.equal(cd.hours, 1);
    assert.equal(cd.mins, 30);
    assert.equal(cd.secs, 45);

    const exact = new Date('2026-12-04T20:00:00+02:00').getTime();
    assert.equal(computeCountdown('2026-12-04', '20:00', exact).isPast, true);

    const after = new Date('2027-12-05T00:00:00+02:00').getTime();
    assert.equal(computeCountdown('2026-12-04', '20:00', after).isPast, true);
    assert.equal(computeCountdown('not-a-date', '20:00', before).isPast, true);
  });

  it('filters by search, genre, favorites and sorts without mutating the source array', () => {
    const snapshot = TEST_CONCERTS.map((c) => c.id);
    const byPriceAsc = filterAndSortConcerts(TEST_CONCERTS, {
      search: '',
      genre: 'All',
      sortBy: 'price-asc',
      savedOnly: false,
      favorites: [],
    });
    assert.equal(byPriceAsc[0].id, 'qena-06');

    const byPriceDesc = filterAndSortConcerts(TEST_CONCERTS, {
      search: '',
      genre: 'All',
      sortBy: 'price-desc',
      savedOnly: false,
      favorites: [],
    });
    assert.ok(byPriceDesc[0].priceEgp >= byPriceDesc[byPriceDesc.length - 1].priceEgp);

    const saved = filterAndSortConcerts(TEST_CONCERTS, {
      search: 'nile',
      genre: 'All',
      sortBy: 'date-asc',
      savedOnly: true,
      favorites: ['qena-02'],
    });
    assert.equal(saved.length, 1);
    assert.equal(saved[0].id, 'qena-02');

    const byGenre = filterAndSortConcerts(TEST_CONCERTS, {
      search: '',
      genre: TEST_CONCERTS[0].genre,
      sortBy: 'date-asc',
      savedOnly: false,
      favorites: [],
    });
    assert.ok(byGenre.every((c) => c.genre === TEST_CONCERTS[0].genre));

    assert.deepEqual(
      TEST_CONCERTS.map((c) => c.id),
      snapshot,
    );
  });

  it('validates booking inputs strictly and never leaks remaining seat numbers', () => {
    const ok = validateBookingInput({
      customerName: 'Nour Hassan',
      customerMobile: '+20 101 234 5678',
      customerEmail: 'nour@gmail.com',
      transferRef: 'IP-981273',
      quantity: 2,
      seatsLeft: 10,
    });
    assert.equal(ok.valid, true);

    assert.equal(
      validateBookingInput({
        customerName: 'Nour Hassan',
        customerMobile: '01234567890',
        customerEmail: '',
        transferRef: 'VF-554210',
        quantity: 1,
        seatsLeft: 5,
      }).valid,
      false,
    );

    assert.equal(
      validateBookingInput({
        customerName: 'Nour Hassan',
        customerMobile: '01912345678',
        customerEmail: 'nour@gmail.com',
        transferRef: 'VF-554210',
        quantity: 1,
        seatsLeft: 5,
      }).valid,
      false,
    );

    assert.equal(
      validateBookingInput({
        customerName: 'Nour Hassan',
        customerMobile: '01012345678',
        customerEmail: 'nour@gmail.com',
        transferRef: '12',
        quantity: 1,
        seatsLeft: 5,
      }).valid,
      false,
    );

    const overSeats = validateBookingInput({
      customerName: 'Nour Hassan',
      customerMobile: '01012345678',
      customerEmail: 'nour@gmail.com',
      transferRef: 'IP-981273',
      quantity: 5,
      seatsLeft: 2,
    });
    assert.equal(overSeats.valid, false);
    assert.ok(overSeats.error && !/\d/.test(overSeats.error), 'Over-capacity error must not leak numeric seatsLeft');
  });

  it('validates waitlist entries strictly with normalized Egyptian mobile', () => {
    const ok = validateWaitlistInput({
      name: '  Salma   Tarek  ',
      mobile: '+20 112 345 6789',
      email: 'SALMA@GMAIL.COM',
    });
    assert.equal(ok.valid, true);
    assert.deepEqual(ok.normalized, { name: 'Salma Tarek', mobile: '01123456789', email: 'salma@gmail.com' });

    assert.equal(validateWaitlistInput({ name: 'A', mobile: '01012345678', email: '' }).valid, false);
    assert.equal(validateWaitlistInput({ name: 'Salma Tarek', mobile: '01000000000', email: '' }).valid, false);
    assert.equal(validateWaitlistInput({ name: 'Salma Tarek', mobile: '01012345678', email: 'bad@' }).valid, false);
  });

  it('hardens CSV export against formula injection while preserving safe placeholders', () => {
    assert.equal(escapeCsvCell('Hello, "Qena"'), '"Hello, ""Qena"""');
    assert.equal(escapeCsvCell('-'), '-');
    assert.equal(escapeCsvCell('=CMD|"/C calc"!A0'), '"\'=CMD|""/C calc""!A0"');
    assert.equal(escapeCsvCell('+201012345678'), "'+201012345678");
    assert.equal(escapeCsvCell('-1+1'), "'-1+1");
    assert.equal(escapeCsvCell('@SUM(A1:A2)'), "'@SUM(A1:A2)");
    assert.equal(escapeCsvCell('\tmalicious'), "'\tmalicious");
  });

  it('generates attendees CSV, midnight-safe RFC ICS calendar files, and accurate Admin KPIs', () => {
    const paidBooking: Booking = {
      bookingCode: 'GZ-ABC123',
      userId: 'uid-1',
      concertId: 'qena-01',
      concertTitle: 'Upper Egypt Rising',
      concertDate: 'Fri, Dec 4, 2026',
      concertTime: '8:00 PM',
      concertVenue: 'Qena Cultural Palace, Hall A',
      tier: 'VIP',
      quantity: 2,
      unitPrice: 450,
      promoCode: 'VIP100',
      discountEgp: 100,
      totalEgp: 800,
      paymentMethod: 'InstaPay',
      transferRef: 'IP-5541',
      paymentStatus: 'Paid',
      checkedIn: true,
      checkedInAt: '8:05 PM',
      approvedBy: 'Main Admin',
      approvalMethod: 'QR Scan',
      customerName: '=Nour, Jr.',
      customerMobile: '01012345678',
      customerEmail: 'nour@gmail.com',
    };
    const pendingBooking: Booking = {
      ...paidBooking,
      bookingCode: 'GZ-DEF456',
      quantity: 3,
      totalEgp: 1200,
      paymentStatus: 'Pending',
      checkedIn: false,
      checkedInAt: '',
      approvedBy: '',
      approvalMethod: '',
      promoCode: '',
      customerName: 'Karim Adel',
    };

    const csv = buildAttendeesCsv([paidBooking, pendingBooking]);
    assert.ok(csv.includes('"\'=Nour, Jr."'));
    assert.ok(csv.includes(',-,'));
    assert.ok(csv.includes('GZ-ABC123'));
    assert.ok(csv.includes('GZ-DEF456'));

    const ics = buildCalendarIcs(paidBooking, TEST_CONCERTS[0]);
    assert.ok(ics.includes('BEGIN:VCALENDAR'));
    assert.ok(ics.includes('UID:GZ-ABC123@genzevents.eg'));
    assert.ok(ics.includes('DTSTART:20261204T200000'));
    assert.ok(ics.includes('DTEND:20261204T230000'));
    assert.ok(ics.includes('LOCATION:Qena Cultural Palace\\, Hall A\\, Qena\\, Egypt'));

    const nyeIcs = buildCalendarIcs(paidBooking, {
      ...TEST_CONCERTS[0],
      isoDate: '2026-12-31',
      isoTime: '22:30',
    });
    assert.ok(nyeIcs.includes('DTSTART:20261231T223000'));
    assert.ok(nyeIcs.includes('DTEND:20270101T013000'));

    const kpis = computeAdminKpis(TEST_CONCERTS, [paidBooking, pendingBooking]);
    assert.equal(kpis.liveEvents, 4);
    assert.equal(kpis.ticketsSold, 2);
    assert.equal(kpis.totalRevenueEgp, 800);
    assert.equal(kpis.pendingPayments, 1);
    assert.equal(kpis.checkedIn, 2);
  });

  it('enforces strict two-tier staff RBAC permissions for Gate Staff vs Super Admin', () => {
    const superPerms = getStaffPermissions('Super Admin');
    assert.equal(superPerms.isSuperAdmin, true);
    assert.equal(superPerms.isGateStaff, false);
    assert.equal(superPerms.defaultTab, 'dashboard');
    assert.deepEqual(superPerms.allowedTabs, [
      'dashboard',
      'checkin',
      'offline',
      'schedule',
      'manage',
      'promos',
      'team',
      'audit',
    ]);
    assert.equal(superPerms.canConfirmPayments, true);
    assert.equal(superPerms.canUndoPayments, true);
    assert.equal(superPerms.canGateCheckIn, true);
    assert.equal(superPerms.canAccessOfflineTickets, true);
    assert.equal(superPerms.canViewRecentApprovals, true);
    assert.equal(superPerms.canViewRevenueAnalytics, true);
    assert.equal(superPerms.canDeleteBookings, true);
    assert.equal(superPerms.canManageConcerts, true);
    assert.equal(superPerms.canManagePromos, true);
    assert.equal(superPerms.canManageTeam, true);
    assert.equal(superPerms.canViewAuditLog, true);

    const gatePerms = getStaffPermissions('Gate Staff');
    assert.equal(gatePerms.isSuperAdmin, false);
    assert.equal(gatePerms.isGateStaff, true);
    assert.equal(gatePerms.defaultTab, 'checkin');
    assert.deepEqual(gatePerms.allowedTabs, ['checkin', 'offline', 'dashboard']);
    assert.equal(gatePerms.canGateCheckIn, true);
    assert.equal(gatePerms.canAccessOfflineTickets, true);
    assert.equal(gatePerms.canViewRecentApprovals, true);
    assert.equal(gatePerms.canConfirmPayments, false);
    assert.equal(gatePerms.canUndoPayments, false);
    assert.equal(gatePerms.canViewRevenueAnalytics, false);
    assert.equal(gatePerms.canDeleteBookings, false);
    assert.equal(gatePerms.canManageConcerts, false);
    assert.equal(gatePerms.canManagePromos, false);
    assert.equal(gatePerms.canManageTeam, false);
    assert.equal(gatePerms.canViewAuditLog, false);

    assert.equal(canAccessAdminTab('Gate Staff', 'checkin'), true);
    assert.equal(canAccessAdminTab('Gate Staff', 'offline'), true);
    assert.equal(canAccessAdminTab('Gate Staff', 'dashboard'), true);
    assert.equal(canAccessAdminTab('Gate Staff', 'schedule'), false);
    assert.equal(canAccessAdminTab('Gate Staff', 'manage'), false);
    assert.equal(canAccessAdminTab('Gate Staff', 'promos'), false);
    assert.equal(canAccessAdminTab('Gate Staff', 'team'), false);
    assert.equal(canAccessAdminTab('Gate Staff', 'audit'), false);
    assert.equal(canAccessAdminTab('Super Admin', 'audit'), true);

    const noPerms = getStaffPermissions(null);
    assert.deepEqual(noPerms.allowedTabs, []);
    assert.equal(noPerms.canGateCheckIn, false);
    assert.equal(noPerms.canConfirmPayments, false);
    assert.equal(noPerms.canUndoPayments, false);
    assert.equal(noPerms.canViewAuditLog, false);
    assert.equal(canAccessAdminTab(null, 'checkin'), false);
    assert.equal(canAccessAdminTab(null, 'audit'), false);
  });

  it('contains zero database seeding helpers or default concert/promo seed datasets in production source', () => {
    const forbidden = [
      'seedInitialDatabase',
      'attachSiteSeededFlag',
      'DEFAULT_CONCERTS',
      'DEFAULT_PROMOS',
      'resolveStorefrontCollections',
      'siteSeeded',
      'seedDefaultLineup',
    ];
    const walk = (dir: string): string[] => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      const out: string[] = [];
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          out.push(...walk(full));
        } else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.test.ts')) {
          out.push(full);
        }
      }
      return out;
    };
    const sourceFiles = walk(path.resolve('src'));
    assert.ok(sourceFiles.length > 10, 'Expected production source files under src/');
    for (const file of sourceFiles) {
      const content = fs.readFileSync(file, 'utf8');
      for (const token of forbidden) {
        assert.equal(
          content.includes(token),
          false,
          `Found removed seed token "${token}" in ${path.relative(process.cwd(), file)}`,
        );
      }
    }
  });

  it('normalizes Egyptian mobile numbers across all prefix styles', () => {
    assert.equal(normalizeEgyptianMobile('+20 101-234-5678'), '01012345678');
    assert.equal(normalizeEgyptianMobile('+20 01012345678'), '01012345678');
    assert.equal(normalizeEgyptianMobile('0020 (112) 345 6789'), '01123456789');
    assert.equal(normalizeEgyptianMobile('0020 01123456789'), '01123456789');
    assert.equal(normalizeEgyptianMobile('1012345678'), '01012345678');
    assert.equal(normalizeEgyptianMobile('01598765432'), '01598765432');
  });

  it('enforces exact email-verified fan, pending-verification, and admin-candidate predicates', () => {
    assert.equal(isVerifiedFanAccount(null), false);
    assert.equal(isPendingEmailVerification(null), false);
    assert.equal(isEmailVerifiedAdminCandidate(null), false);

    const anon = { isAnonymous: true, emailVerified: false, email: null };
    assert.equal(isVerifiedFanAccount(anon), false);
    assert.equal(isPendingEmailVerification(anon), false);
    assert.equal(isEmailVerifiedAdminCandidate(anon), false);

    const unverifiedEmail = { isAnonymous: false, emailVerified: false, email: 'fan@gmail.com' };
    assert.equal(isVerifiedFanAccount(unverifiedEmail), false);
    assert.equal(isPendingEmailVerification(unverifiedEmail), true);
    assert.equal(isEmailVerifiedAdminCandidate(unverifiedEmail), false);

    const verifiedEmail = { isAnonymous: false, emailVerified: true, email: 'weentamalak@gmail.com' };
    assert.equal(isVerifiedFanAccount(verifiedEmail), true);
    assert.equal(isPendingEmailVerification(verifiedEmail), false);
    assert.equal(isEmailVerifiedAdminCandidate(verifiedEmail), true);
  });

  it('strictly validates email signup and profile updates', () => {
    const okEn = validateSignupInput({
      fullName: 'Nour   Hassan',
      email: 'Nour.Hassan@Gmail.com',
      password: 'QenaLive2026',
      confirmPassword: 'QenaLive2026',
      mobile: '+20 101 234 5678',
    });
    assert.equal(okEn.valid, true);
    assert.equal(okEn.normalized?.fullName, 'Nour Hassan');
    assert.equal(okEn.normalized?.email, 'nour.hassan@gmail.com');
    assert.equal(okEn.normalized?.mobile, '01012345678');

    assert.equal(validateFullName('أحمد محمود').valid, true);
    assert.equal(validateFullName("O'Connor Al-Masry").valid, true);
    assert.equal(validateFullName('Nour').valid, false);
    assert.equal(validateFullName('Nour 1234').valid, false);
    assert.equal(validateFullName('asdf qwerty').valid, false);
    assert.equal(validateFullName('Aaaa Bbbb').valid, false);

    assert.equal(validateEmailAddress('user@example.com').valid, false);
    assert.equal(validateEmailAddress('user@example.com', { allowDisposable: true }).valid, true);
    assert.equal(validateEmailAddress('user@test.com').valid, false);
    assert.equal(validateEmailAddress('user@mailinator.com').valid, false);
    assert.equal(validateEmailAddress('bad..email@gmail.com').valid, false);

    assert.equal(validateEgyptianMobile('', true).valid, false);
    assert.equal(validateEgyptianMobile('', false).valid, true);
    assert.equal(validateEgyptianMobile('01912345678', true).valid, false);
    assert.equal(validateEgyptianMobile('01000000000', true).valid, false);
    assert.equal(validateEgyptianMobile('12345', true).valid, false);

    assert.equal(evaluatePasswordStrength('short1').valid, false);
    assert.equal(evaluatePasswordStrength('lettersonly').valid, false);
    assert.equal(evaluatePasswordStrength('12345678').valid, false);
    assert.equal(evaluatePasswordStrength('password123').valid, false);
    assert.equal(evaluatePasswordStrength('aaaaaaaa').valid, false);
    assert.equal(evaluatePasswordStrength('QenaStage99').valid, true);

    assert.equal(
      validateSignupInput({
        fullName: 'Nour Hassan',
        email: 'nour.hassan@gmail.com',
        password: 'QenaStage99',
        confirmPassword: 'QenaStage88',
        mobile: '01012345678',
      }).valid,
      false,
    );

    assert.equal(
      validateProfileUpdateInput({
        displayName: 'Nour Hassan',
        mobile: '01123456789',
        city: 'Qena',
        bio: 'Front row fan',
      }).valid,
      true,
    );
    assert.equal(
      validateProfileUpdateInput({ displayName: 'asdf', mobile: '01123456789', city: 'Qena', bio: '' }).valid,
      false,
    );
    assert.equal(
      validateProfileUpdateInput({ displayName: 'Nour Hassan', mobile: '01123456789', city: '12345', bio: '' }).valid,
      false,
    );
  });

  it('selects the next upcoming concert and falls back gracefully when empty or all past', () => {
    assert.equal(getNextUpcomingConcert([]), null);

    const pastAndFuture = [
      { ...TEST_CONCERTS[0], id: 'past-show', isoDate: '2025-01-01', isoTime: '20:00' },
      { ...TEST_CONCERTS[2], id: 'later-show', isoDate: '2026-12-18', isoTime: '19:00' },
      { ...TEST_CONCERTS[1], id: 'soon-show', isoDate: '2026-12-11', isoTime: '20:30' },
    ];
    const nowMs = new Date('2026-11-21T12:00:00+02:00').getTime();
    assert.equal(getNextUpcomingConcert(pastAndFuture, nowMs)?.id, 'soon-show');

    const farFutureMs = new Date('2028-01-01T00:00:00+02:00').getTime();
    assert.equal(getNextUpcomingConcert(pastAndFuture, farFutureMs)?.id, 'later-show');
  });

  it('sorts bookings newest-first across null server timestamps, Firestore Timestamps, Dates, and numbers', () => {
    const items = [
      { id: 'old-sec', createdAt: { seconds: 1000 } },
      { id: 'pending', createdAt: null },
      { id: 'date', createdAt: new Date(1_500_000) },
      { id: 'newer-fn', createdAt: { toMillis: () => 2_000_000 } },
      { id: 'num', createdAt: 1_200_000 },
    ];
    const sorted = sortByCreatedAtDesc(items);
    assert.deepEqual(
      sorted.map((i) => i.id),
      ['pending', 'newer-fn', 'date', 'num', 'old-sec'],
    );
  });

  it('scales poster dimensions without upscaling and keeps poster cap safely below Firestore 400KB rule', () => {
    assert.ok(MAX_POSTER_DATA_URL_LENGTH < 400000);
    assert.deepEqual(fitPosterDimensions(1520, 760, 760), { width: 760, height: 380 });
    assert.deepEqual(fitPosterDimensions(400, 300, 760), { width: 400, height: 300 });
    assert.deepEqual(fitPosterDimensions(0, 0, 760), { width: 1, height: 1 });
  });

  it('partitions active vs stale admin sessions accurately including pending server timestamps', () => {
    const now = 2_000_000;
    const base: Omit<AdminSession, 'id' | 'lastSeen' | 'createdAt'> = {
      userId: 'uid-admin',
      name: 'Organizer',
      email: 'weentamalak@gmail.com',
      role: 'Super Admin',
    };
    const sessions: AdminSession[] = [
      { ...base, id: 'fresh-ts', lastSeen: { toMillis: () => now - 60_000 }, createdAt: now - 120_000 },
      { ...base, id: 'pending-write', lastSeen: null, createdAt: null },
      { ...base, id: 'boundary-active', lastSeen: now - ADMIN_SESSION_TTL_MS, createdAt: now - ADMIN_SESSION_TTL_MS },
      { ...base, id: 'stale-orphaned', lastSeen: { seconds: Math.floor((now - ADMIN_SESSION_TTL_MS - 5_000) / 1000) }, createdAt: now - ADMIN_SESSION_TTL_MS - 10_000 },
    ];

    assert.equal(isAdminSessionActive(sessions[0], now), true);
    assert.equal(isAdminSessionActive(sessions[1], now), true);
    assert.equal(isAdminSessionActive(sessions[2], now), true);
    assert.equal(isAdminSessionActive(sessions[3], now), false);

    const { active, stale } = partitionAdminSessions(sessions, now);
    assert.deepEqual(
      active.map((s) => s.id),
      ['fresh-ts', 'pending-write', 'boundary-active'],
    );
    assert.deepEqual(
      stale.map((s) => s.id),
      ['stale-orphaned'],
    );
  });

  it('computes dynamic default upcoming ISO dates and strictly parses bounded integer form inputs', () => {
    const fixedNow = new Date(2026, 10, 21, 12, 0, 0); // Nov 21, 2026
    assert.equal(getDefaultUpcomingIsoDate(fixedNow, 14), '2026-12-05');
    assert.match(getDefaultUpcomingIsoDate(), /^\d{4}-\d{2}-\d{2}$/);

    assert.deepEqual(parseBoundedIntInput('250', 0, 100000), { valid: true, value: 250 });
    assert.deepEqual(parseBoundedIntInput('0', 0, 100000), { valid: true, value: 0 });
    assert.equal(parseBoundedIntInput('', 0, 100000).valid, false);
    assert.equal(parseBoundedIntInput('   ', 0, 100000).valid, false);
    assert.equal(parseBoundedIntInput('-5', 0, 100000).valid, false);
    assert.equal(parseBoundedIntInput('12.5', 0, 100000).valid, false);
    assert.equal(parseBoundedIntInput('9', 10, 50000).valid, false);
    assert.equal(parseBoundedIntInput('50001', 10, 50000).valid, false);
  });

  it('validates, normalizes, and resolves custom per-concert ticket category colors accurately', () => {
    assert.equal(isValidHexColor('#FBBF24'), true);
    assert.equal(isValidHexColor('#fbbf24'), true);
    assert.equal(isValidHexColor('#FFF'), false);
    assert.equal(isValidHexColor('FBBF24'), false);
    assert.equal(isValidHexColor('#ZZZZZZ'), false);

    assert.equal(normalizeHexColor('fbbf24'), '#FBBF24');
    assert.equal(normalizeHexColor('  #0fa  '), '#00FFAA');
    assert.equal(normalizeHexColor('f0a'), '#FF00AA');
    assert.equal(normalizeHexColor('#12345'), null);
    assert.equal(normalizeHexColor('not-a-color'), null);

    const validPalette = validateTierColors({
      Silver: '#e2e8f0',
      Gold: 'f59e0b',
      VIP: '#f43',
      Lounge: '#22d3ee',
    });
    assert.equal(validPalette.valid, true);
    assert.deepEqual(validPalette.normalized, {
      Silver: '#E2E8F0',
      Gold: '#F59E0B',
      VIP: '#FF4433',
      Lounge: '#22D3EE',
    });

    assert.equal(validateTierColors({ Silver: '#112233', Gold: '#223344', VIP: '#GGGGGG', Lounge: '#445566' }).valid, false);
    assert.equal(validateTierColors({ Silver: '#112233' }).valid, false);

    const customConcert = {
      ...TEST_CONCERTS[0],
      tierColors: {
        Silver: '#A855F7',
        Gold: '#34D399',
        VIP: '#FB7185',
        Lounge: '#38BDF8',
      },
    };
    assert.equal(getTierColorHex(customConcert, 'Silver'), '#A855F7');
    assert.equal(getTierColorHex(customConcert, 'Lounge'), '#38BDF8');
    assert.equal(getTierColorHex(TEST_CONCERTS[0], 'Gold'), '#FBBF24');
    assert.equal(getTierColorHex(null, 'VIP'), '#F43F5E');

    assert.equal(hexToRgba('#FF0080', 0.25), 'rgba(255, 0, 128, 0.25)');
    assert.equal(hexToRgba('invalid', 0.5), 'rgba(148, 163, 184, 0.5)');
  });

  it('parses offline ticket spreadsheets across English and Arabic headers, deduplicates codes, and reports exact row errors', () => {
    assert.equal(normalizeTierValue('gold'), 'Gold');
    assert.equal(normalizeTierValue('V'), 'VIP');
    assert.equal(normalizeTierValue('لاونج'), 'Lounge');
    assert.equal(normalizeTierValue('فضي'), 'Silver');
    assert.equal(normalizeTierValue('Balcony'), null);

    assert.equal(normalizeOfflineMobile('1012345678'), '01012345678');
    assert.equal(normalizeOfflineMobile('+20 112 345 6789'), '01123456789');

    const rows: Record<string, unknown>[] = [
      // Row 2: English headers, auto-calculated price, Excel stripped leading zero on mobile
      {
        'Customer Name': 'Omar Khaled',
        Mobile: 1012345678,
        Tier: 'Gold',
        Quantity: 2,
        Outlet: 'Qena Booth #1',
      },
      // Row 3: Blank row (ignored silently)
      {
        'Customer Name': '',
        Mobile: '',
        Tier: '',
      },
      // Row 4: Arabic headers, custom discounted total, Checked In = نعم, explicit custom code
      {
        الاسم: 'سارة علي',
        الموبايل: '01123456789',
        الفئة: 'في اي بي',
        العدد: 3,
        المبلغ: '1200 EGP',
        المنفذ: 'شباك قنا',
        الكود: 'OFF-10001',
        الدخول: 'نعم',
      },
      // Row 5: Duplicate code from Row 4 + Pending status (should auto-generate fresh unique code & not count in paidTickets)
      {
        Name: 'Karim Adel',
        Phone: '01234567890',
        Category: 'Silver',
        Qty: 2,
        Code: 'OFF-10001',
        Status: 'Pending',
      },
      // Row 6: Invalid amount string ('ABC' must NOT coerce to 0)
      {
        Name: 'Mona Saeed',
        Phone: '01512345678',
        Tier: 'Silver',
        Qty: 1,
        'Total EGP': 'ABC',
      },
      // Row 7: Unknown category
      {
        Name: 'Tarek Hany',
        Phone: '01098765432',
        Tier: 'Backstage',
        Qty: 1,
      },
      // Row 8: Missing mobile
      {
        Name: 'Heba Nabil',
        Phone: '123',
        Tier: 'Silver',
        Qty: 1,
      },
    ];

    const result = parseOfflineTicketRows(rows, TEST_CONCERTS[0], 'Lead Organizer', ['GZ-EXIST1']);

    assert.equal(result.validBookings.length, 3);
    assert.equal(result.errors.length, 3);
    assert.equal(result.totalTickets, 7);
    assert.equal(result.paidTickets, 5);

    // Verify Row 2
    const b1 = result.validBookings[0];
    assert.equal(b1.userId, OFFLINE_USER_ID);
    assert.equal(b1.paymentMethod, 'Offline');
    assert.equal(b1.customerMobile, '01012345678');
    assert.equal(b1.tier, 'Gold');
    assert.equal(b1.quantity, 2);
    assert.equal(b1.totalEgp, getTierUnitPrice(TEST_CONCERTS[0], 'Gold') * 2);
    assert.equal(b1.customerEmail, '');
    assert.equal(b1.transferRef, 'Qena Booth #1');

    // Verify Row 4 (Arabic)
    const b2 = result.validBookings[1];
    assert.equal(b2.bookingCode, 'OFF-10001');
    assert.equal(b2.tier, 'VIP');
    assert.equal(b2.totalEgp, 1200);
    assert.equal(b2.discountEgp, getTierUnitPrice(TEST_CONCERTS[0], 'VIP') * 3 - 1200);
    assert.equal(b2.checkedIn, true);
    assert.equal(b2.paymentStatus, 'Paid');

    // Verify Row 5 (deduplicated code + Pending)
    const b3 = result.validBookings[2];
    assert.notEqual(b3.bookingCode, 'OFF-10001');
    assert.match(b3.bookingCode, /^GZ-[A-HJ-NP-Z2-9]{6}$/);
    assert.equal(b3.paymentStatus, 'Pending');

    // Verify exact Excel row numbers for errors (rows 6, 7, 8)
    assert.deepEqual(
      result.errors.map((e) => e.rowNumber),
      [6, 7, 8],
    );
  });

  it('parses Arabic-Indic numerals in offline Excel quantity/amount and Arabic pending statuses cleanly', () => {
    const arRows: Record<string, unknown>[] = [
      {
        الاسم: 'مصطفى علي',
        الموبايل: '٠١٠٢٣٤٥٦٧٨٩',
        الفئة: 'جولد',
        العدد: '٢',
        المبلغ: '٨٥٠ ج.م',
        المنفذ: 'كشك الجامعة',
        الحالة: 'قيد المراجعة',
      },
      {
        الاسم: 'ندى حسن',
        الموبايل: '٠١١٩٨٧٦٥٤٣٢',
        الفئة: 'فان بيت',
        العدد: '٣',
        المبلغ: '١٥٠٠',
        المنفذ: 'مكتب قنا',
        الحالة: 'مدفوع',
      },
    ];
    const parsed = parseOfflineTicketRows(arRows, TEST_CONCERTS[0], 'Gate Staff', []);
    assert.equal(parsed.errors.length, 0);
    assert.equal(parsed.validBookings.length, 2);
    assert.equal(parsed.validBookings[0].customerMobile, '01023456789');
    assert.equal(parsed.validBookings[0].quantity, 2);
    assert.equal(parsed.validBookings[0].totalEgp, 850);
    assert.equal(parsed.validBookings[0].paymentStatus, 'Pending');
    assert.equal(parsed.validBookings[1].tier, 'VIP');
    assert.equal(parsed.validBookings[1].quantity, 3);
    assert.equal(parsed.validBookings[1].totalEgp, 1500);
    assert.equal(parsed.validBookings[1].paymentStatus, 'Paid');
    assert.equal(parsed.paidTickets, 3);
    assert.equal(parsed.totalRevenueEgp, 1500);
  });

  it('enforces safe HTTPS and image URL schemes and neutralizes Excel formula injection', () => {
    assert.equal(isSafeHttpsUrl('https://docs.google.com/forms/d/abc/viewform'), true);
    assert.equal(isSafeHttpsUrl('http://insecure.example.com'), false);
    assert.equal(isSafeHttpsUrl('javascript:alert(1)'), false);
    assert.equal(isSafeHttpsUrl('data:text/html,<script>alert(1)</script>'), false);

    assert.equal(isSafeImageUrl(''), true);
    assert.equal(isSafeImageUrl('/assets/hero-qena.jpg'), true);
    assert.equal(isSafeImageUrl('https://cdn.example.com/poster.webp'), true);
    assert.equal(isSafeImageUrl('data:image/jpeg;base64,/9j/4AAQSkZJRg=='), true);
    assert.equal(isSafeImageUrl('data:image/png;base64,iVBORw0KGgo='), true);
    assert.equal(isSafeImageUrl('data:image/svg+xml;base64,PHN2Zz4='), false);
    assert.equal(isSafeImageUrl('javascript:alert(1)'), false);
    assert.equal(isSafeImageUrl('/assets/../../etc/passwd'), false);

    assert.equal(sanitizeSpreadsheetCell('=HYPERLINK("http://evil","x")'), "'=HYPERLINK(\"http://evil\",\"x\")");
    assert.equal(sanitizeSpreadsheetCell('+CMD|calc'), "'+CMD|calc");
    assert.equal(sanitizeSpreadsheetCell('-1+1'), "'-1+1");
    assert.equal(sanitizeSpreadsheetCell('@SUM(A1:A2)'), "'@SUM(A1:A2)");
    assert.equal(sanitizeSpreadsheetCell('Ahmed Hassan'), 'Ahmed Hassan');

    // Verify cryptographically generated booking codes match strict GZ-XXXXXX format and have high uniqueness
    const codes = new Set(Array.from({ length: 50 }, () => generateBookingCode()));
    assert.ok(codes.size >= 48);
    for (const c of codes) {
      assert.match(c, /^GZ-[A-HJ-NP-Z2-9]{6}$/);
    }
  });

  it('adjusts seatsLeft proportionally when organizer updates published concert capacity', () => {
    // 140 total, 90 left => 50 seats already booked
    assert.equal(computeAdjustedSeatsLeft(140, 90, 200), 150);
    assert.equal(computeAdjustedSeatsLeft(140, 90, 100), 50);
    // Dropping capacity below already-booked seats clamps seatsLeft safely to 0
    assert.equal(computeAdjustedSeatsLeft(140, 90, 40), 0);
    // Sold-out show (0 left out of 100) expanded to 125 opens 25 new seats
    assert.equal(computeAdjustedSeatsLeft(100, 0, 125), 25);
  });

  it('validates and builds full published concert edit payloads including title, artist, venue, genre, date, start time, capacity, pricing, and colors', () => {
    const original = TEST_CONCERTS[0];
    const baseDraft = {
      title: 'Nile Pulse Winter Gala',
      artist: 'Amr Diab & Guests',
      venue: 'Qena Nile Corniche Amphitheater',
      genre: 'Hip-Hop / Pop',
      isoDate: '2026-12-20',
      isoTime: '21:30:00',
      totalSeats: '350',
      seatsLeft: '280',
      silver: '350',
      gold: '550',
      vip: '850',
      lounge: '1300',
      useCustomColors: true,
      hexDrafts: {
        Silver: '#cbd5e1',
        Gold: '#f59e0b',
        VIP: '#e11d48',
        Lounge: '#06b6d4',
      },
      posterUrl: 'https://cdn.example.com/nile-pulse.jpg',
      description: 'Updated winter gala headliner live by the Nile in Qena with full stage lighting.',
    };

    const ok = validateAndBuildConcertEditPayload(original, baseDraft);
    assert.equal(ok.valid, true);
    if (ok.valid) {
      assert.equal(ok.concert.id, original.id);
      assert.equal(ok.concert.title, 'Nile Pulse Winter Gala');
      assert.equal(ok.concert.artist, 'Amr Diab & Guests');
      assert.equal(ok.concert.venue, 'Qena Nile Corniche Amphitheater');
      assert.equal(ok.concert.genre, 'Hip-Hop / Pop');
      assert.equal(ok.concert.isoDate, '2026-12-20');
      assert.equal(ok.concert.isoTime, '21:30');
      assert.equal(ok.concert.date, 'Sun, Dec 20, 2026');
      assert.equal(ok.concert.time, '9:30 PM');
      assert.equal(ok.concert.doors, '8:00 PM');
      assert.equal(ok.concert.totalSeats, 350);
      assert.equal(ok.concert.seatsLeft, 280);
      assert.equal(ok.concert.priceEgp, 350);
      assert.deepEqual(ok.concert.tierPrices, {
        Silver: 350,
        Gold: 550,
        VIP: 850,
        Lounge: 1300,
      });
      assert.deepEqual(ok.concert.tierColors, {
        Silver: '#CBD5E1',
        Gold: '#F59E0B',
        VIP: '#E11D48',
        Lounge: '#06B6D4',
      });
    }

    // Disabling custom colors clears tierColors cleanly
    const defaultColors = validateAndBuildConcertEditPayload(original, {
      ...baseDraft,
      useCustomColors: false,
      totalSeats: '٢٥٠',
      seatsLeft: '٢٠٠',
    });
    assert.equal(defaultColors.valid, true);
    if (defaultColors.valid) {
      assert.equal(defaultColors.concert.tierColors, undefined);
      assert.equal(defaultColors.concert.totalSeats, 250);
      assert.equal(defaultColors.concert.seatsLeft, 200);
    }

    // Rejects seatsLeft > totalSeats (must match firestore.rules invariant)
    const overflowSeats = validateAndBuildConcertEditPayload(original, {
      ...baseDraft,
      totalSeats: '100',
      seatsLeft: '101',
    });
    assert.equal(overflowSeats.valid, false);

    // Rejects invalid calendar date (Feb 30) and invalid clock time (25:00)
    const badDate = validateAndBuildConcertEditPayload(original, {
      ...baseDraft,
      isoDate: '2026-02-30',
    });
    assert.equal(badDate.valid, false);

    const badTime = validateAndBuildConcertEditPayload(original, {
      ...baseDraft,
      isoTime: '25:00',
    });
    assert.equal(badTime.valid, false);

    // Rejects short required text fields, unsafe poster URL, and invalid hex color
    const badVenue = validateAndBuildConcertEditPayload(original, { ...baseDraft, venue: 'Q' });
    assert.equal(badVenue.valid, false);

    const badPoster = validateAndBuildConcertEditPayload(original, {
      ...baseDraft,
      posterUrl: 'javascript:alert(1)',
    });
    assert.equal(badPoster.valid, false);

    const badColor = validateAndBuildConcertEditPayload(original, {
      ...baseDraft,
      useCustomColors: true,
      hexDrafts: { ...baseDraft.hexDrafts, Gold: 'not-a-hex' },
    });
    assert.equal(badColor.valid, false);
  });

  it('merges updated live concert title, date, time, and venue onto existing bookings', () => {
    const staleBooking: Booking = {
      bookingCode: 'GZ-LIVE99',
      userId: 'uid-1',
      concertId: TEST_CONCERTS[0].id,
      concertTitle: 'Old Concert Title',
      concertDate: 'Fri, Dec 1, 2026',
      concertTime: '7:00 PM',
      concertVenue: 'Old Qena Venue',
      tier: 'Gold',
      quantity: 2,
      unitPrice: 300,
      promoCode: '',
      discountEgp: 0,
      totalEgp: 600,
      paymentMethod: 'InstaPay',
      transferRef: '01012345678',
      paymentStatus: 'Paid',
      checkedIn: false,
      checkedInAt: '',
      approvedBy: 'Admin',
      approvalMethod: 'Manual',
      customerName: 'Nour Hassan',
      customerMobile: '01012345678',
      customerEmail: 'nour@example.com',
    };

    const updatedConcert: Concert = {
      ...TEST_CONCERTS[0],
      title: 'Updated Qena Arena Show',
      date: 'Sun, Dec 20, 2026',
      time: '9:30 PM',
      venue: 'New Qena Stadium',
    };

    const synced = resolveBookingConcertDetails(staleBooking, updatedConcert);
    assert.equal(synced.concertTitle, 'Updated Qena Arena Show');
    assert.equal(synced.concertDate, 'Sun, Dec 20, 2026');
    assert.equal(synced.concertTime, '9:30 PM');
    assert.equal(synced.concertVenue, 'New Qena Stadium');
    assert.equal(synced.bookingCode, 'GZ-LIVE99');

    // Falls back safely to snapshot when concert is no longer in catalog
    const fallback = resolveBookingConcertDetails(staleBooking, undefined);
    assert.equal(fallback.concertTitle, 'Old Concert Title');
    assert.equal(fallback.concertVenue, 'Old Qena Venue');
  });

  it('validates and resolves InstaPay & Vodafone Cash payment config numbers cleanly', () => {
    // Default resolution when missing or blank
    assert.deepEqual(resolvePaymentConfig(null), DEFAULT_PAYMENT_CONFIG);
    assert.equal(resolvePaymentConfig({ instapayNumber: '  ', walletNumber: '' }).instapayNumber, '+201040206700');

    // Valid Egyptian mobiles preserving +20 or 01x format & normalizing Arabic-Indic digits
    const validPhones = validatePaymentConfigInput({
      instapayNumber: '+20 101 234 5678',
      walletNumber: '٠١٠٩٨٧٦٥٤٣٢',
    });
    assert.equal(validPhones.valid, true);
    if (validPhones.valid) {
      assert.equal(validPhones.normalized.instapayNumber, '+201012345678');
      assert.equal(validPhones.normalized.walletNumber, '01098765432');
    }

    // Valid InstaPay IPA handle + Vodafone Cash mobile
    const validIpa = validatePaymentConfigInput({
      instapayNumber: 'genz.events@instapay',
      walletNumber: '+201040206700',
    });
    assert.equal(validIpa.valid, true);
    if (validIpa.valid) {
      assert.equal(validIpa.normalized.instapayNumber, 'genz.events@instapay');
      assert.equal(validIpa.normalized.walletNumber, '+201040206700');
    }

    // Rejects invalid/malicious InstaPay and invalid Vodafone Cash numbers
    assert.equal(
      validatePaymentConfigInput({ instapayNumber: '<script>@x', walletNumber: '01040206700' }).valid,
      false,
    );
    assert.equal(
      validatePaymentConfigInput({ instapayNumber: '1234', walletNumber: '01040206700' }).valid,
      false,
    );
    assert.equal(
      validatePaymentConfigInput({ instapayNumber: 'genz@instapay', walletNumber: '09912345678' }).valid,
      false,
    );
    assert.equal(
      validatePaymentConfigInput({ instapayNumber: 'genz@instapay', walletNumber: '01000000000' }).valid,
      false,
    );
  });

  it('tracks multi-ticket check-in progress, legacy fallback, partial KPIs, and CSV formatting', () => {
    // Legacy bookings without checkedInCount
    assert.equal(getBookingCheckedInCount({ quantity: 5, checkedIn: false }), 0);
    assert.equal(getBookingCheckedInCount({ quantity: 5, checkedIn: true }), 5);
    assert.equal(getBookingRemainingEntries({ quantity: 5, checkedIn: false }), 5);
    assert.equal(isBookingFullyCheckedIn({ quantity: 5, checkedIn: true }), true);

    // Partial multi-ticket scans
    assert.equal(getBookingCheckedInCount({ quantity: 5, checkedIn: false, checkedInCount: 2 }), 2);
    assert.equal(getBookingRemainingEntries({ quantity: 5, checkedIn: false, checkedInCount: 2 }), 3);
    assert.equal(isBookingFullyCheckedIn({ quantity: 5, checkedIn: false, checkedInCount: 2 }), false);
    assert.equal(isBookingFullyCheckedIn({ quantity: 5, checkedIn: true, checkedInCount: 5 }), true);

    // Clamping and progress label formatting
    assert.equal(getBookingCheckedInCount({ quantity: 5, checkedIn: false, checkedInCount: 99 }), 5);
    assert.equal(getBookingCheckedInCount({ quantity: 5, checkedIn: false, checkedInCount: -3 }), 0);
    assert.equal(formatCheckInProgress(1, 5), '(1/5)');
    assert.equal(formatCheckInProgress(2, 5), '(2/5)');
    assert.equal(formatCheckInProgress(5, 5), '(5/5)');

    // KPI aggregation counts partial check-ins accurately (2 of 5 + legacy 3 of 3 = 5 guests)
    const partialBooking: Booking = {
      bookingCode: 'GZ-PART5',
      userId: 'u1',
      concertId: TEST_CONCERTS[0].id,
      concertTitle: TEST_CONCERTS[0].title,
      concertDate: TEST_CONCERTS[0].date,
      concertTime: TEST_CONCERTS[0].time,
      concertVenue: TEST_CONCERTS[0].venue,
      tier: 'Gold',
      quantity: 5,
      unitPrice: 750,
      promoCode: '',
      discountEgp: 0,
      totalEgp: 3750,
      paymentMethod: 'InstaPay',
      transferRef: 'IP-5555',
      paymentStatus: 'Paid',
      checkedIn: false,
      checkedInCount: 2,
      checkedInAt: '8:10 PM',
      approvedBy: 'Gate 1',
      approvalMethod: 'Camera QR',
      customerName: 'Nour Adel',
      customerMobile: '01012345678',
      customerEmail: 'nour@example.com',
    };
    const legacyBooking: Booking = {
      ...partialBooking,
      bookingCode: 'GZ-LEG03',
      quantity: 3,
      totalEgp: 2250,
      checkedIn: true,
      checkedInCount: undefined,
    };
    const kpis = computeAdminKpis(TEST_CONCERTS, [partialBooking, legacyBooking]);
    assert.equal(kpis.checkedIn, 5);
    assert.equal(kpis.ticketsSold, 8);

    const csv = buildAttendeesCsv([partialBooking, legacyBooking]);
    assert.ok(csv.includes('2/5'));
    assert.ok(csv.includes('3/3'));
  });

  it('undoes confirmed payments cleanly: keeps reservation intact, hides fan QR, resets check-ins, and restores seats safely', () => {
    const paidBooking: Booking = {
      bookingCode: 'GZ-UNDO01',
      userId: 'fan-uid-1',
      concertId: TEST_CONCERTS[0].id,
      concertTitle: TEST_CONCERTS[0].title,
      concertDate: TEST_CONCERTS[0].date,
      concertTime: TEST_CONCERTS[0].time,
      concertVenue: TEST_CONCERTS[0].venue,
      tier: 'VIP',
      quantity: 3,
      unitPrice: 450,
      promoCode: '',
      discountEgp: 0,
      totalEgp: 1350,
      paymentMethod: 'InstaPay',
      transferRef: '01012345678',
      paymentStatus: 'Paid',
      checkedIn: false,
      checkedInCount: 2,
      checkedInAt: '8:15 PM',
      approvedBy: 'Lead Organizer',
      approvalMethod: 'Desk Confirm',
      customerName: 'Nour Hassan',
      customerMobile: '01012345678',
      customerEmail: 'nour@gmail.com',
    };

    assert.equal(canDisplayBookingQr(paidBooking), true);
    assert.equal(canDisplayBookingQr(null), false);

    const patch = buildUndoPaymentPatch();
    assert.deepEqual(patch, {
      paymentStatus: 'Pending',
      checkedIn: false,
      checkedInCount: 0,
      checkedInAt: '',
      approvedBy: '',
      approvalMethod: '',
    });

    const reverted: Booking = { ...paidBooking, ...patch };
    // Reservation ownership & details remain intact, while QR visibility and check-ins reset immediately
    assert.equal(reverted.bookingCode, 'GZ-UNDO01');
    assert.equal(reverted.userId, 'fan-uid-1');
    assert.equal(reverted.quantity, 3);
    assert.equal(reverted.totalEgp, 1350);
    assert.equal(canDisplayBookingQr(reverted), false);
    assert.equal(getBookingCheckedInCount(reverted), 0);
    assert.equal(isBookingFullyCheckedIn(reverted), false);

    // KPIs drop reverted tickets from paid revenue / sold / checked-in and count as pending
    const kpis = computeAdminKpis(TEST_CONCERTS, [reverted]);
    assert.equal(kpis.ticketsSold, 0);
    assert.equal(kpis.totalRevenueEgp, 0);
    assert.equal(kpis.checkedIn, 0);
    assert.equal(kpis.pendingPayments, 1);

    // Restoring concert seats clamps cleanly within [0, totalSeats]
    assert.equal(computeRestoredSeatsLeft(417, 600, 3), 420);
    assert.equal(computeRestoredSeatsLeft(599, 600, 5), 600);
    assert.equal(computeRestoredSeatsLeft(-10, 600, 3), 3);
    assert.equal(computeRestoredSeatsLeft(420, 600, -5), 420);
  });

  it('normalizes mobile HH:MM:SS schedule times and prevents unpaid offline rows from importing as checked-in or approved', () => {
    assert.deepEqual(normalizeScheduleDateTime('2026-12-20', '21:30:00'), {
      valid: true,
      isoDate: '2026-12-20',
      isoTime: '21:30',
    });
    assert.equal(normalizeScheduleDateTime('2026-02-30', '20:00').valid, false);
    assert.equal(normalizeScheduleDateTime('2026-12-20', '24:00').valid, false);

    const parsed = parseOfflineTicketRows(
      [
        {
          Name: 'Pending Guest',
          Mobile: '01011112222',
          Tier: 'Silver',
          Qty: 2,
          Status: 'Pending',
          'Checked In': 'Yes',
        },
      ],
      TEST_CONCERTS[0],
      'Lead Organizer',
      [],
    );
    assert.equal(parsed.validBookings.length, 1);
    const pendingRow = parsed.validBookings[0];
    assert.equal(pendingRow.paymentStatus, 'Pending');
    assert.equal(pendingRow.checkedIn, false);
    assert.equal(pendingRow.checkedInCount, 0);
    assert.equal(pendingRow.checkedInAt, '');
    assert.equal(pendingRow.approvedBy, '');
    assert.equal(pendingRow.approvalMethod, '');
  });

  it('normalizes, toggles, and evaluates individual and multi-tier promo code scopes cleanly', () => {
    // Normalization preserves canonical order, deduplicates, and collapses empty or all-4 to []
    assert.deepEqual(normalizePromoTiers([]), []);
    assert.deepEqual(normalizePromoTiers(['Lounge', 'Silver', 'Lounge']), ['Silver', 'Lounge']);
    assert.deepEqual(normalizePromoTiers(['Silver', 'Gold', 'VIP', 'Lounge']), []);

    // Toggling from All Pass Tiers ([]) selects just that individual tier
    assert.deepEqual(togglePromoTier([], 'Silver'), ['Silver']);
    assert.deepEqual(togglePromoTier([], 'Gold'), ['Gold']);
    assert.deepEqual(togglePromoTier([], 'VIP'), ['VIP']);
    assert.deepEqual(togglePromoTier([], 'Lounge'), ['Lounge']);

    // Multi-tier toggle adds/removes tiers and snaps back to [] when empty or all 4 are picked
    assert.deepEqual(togglePromoTier(['Silver'], 'Gold'), ['Silver', 'Gold']);
    assert.deepEqual(togglePromoTier(['Silver', 'Gold'], 'Silver'), ['Gold']);
    assert.deepEqual(togglePromoTier(['Gold'], 'Gold'), []);
    assert.deepEqual(togglePromoTier(['Silver', 'Gold', 'VIP'], 'Lounge'), []);

    // Individual tier promos strictly match only their target tier
    const individualPromos: Promo[] = [
      { code: 'SILVER10', type: 'percent', value: 10, tiers: ['Silver'], label: '10% Off', active: true },
      { code: 'GOLD15', type: 'percent', value: 15, tiers: ['Gold'], label: '15% Off', active: true },
      { code: 'FANPIT50', type: 'flat', value: 50, tiers: ['VIP'], label: '50 EGP Off', active: true },
      { code: 'LOUNGE100', type: 'flat', value: 100, tiers: ['Lounge'], label: '100 EGP Off', active: true },
      { code: 'TRIO20', type: 'percent', value: 20, tiers: ['Silver', 'Gold', 'VIP'], label: '20% Off', active: true },
    ];

    assert.equal(evaluatePromo('SILVER10', 'Silver', 200, individualPromos).valid, true);
    assert.equal(evaluatePromo('SILVER10', 'Gold', 300, individualPromos).valid, false);
    assert.equal(
      evaluatePromo('SILVER10', 'Gold', 300, individualPromos).message,
      'SILVER10 applies only to Silver passes.',
    );

    assert.equal(evaluatePromo('GOLD15', 'Gold', 400, individualPromos).valid, true);
    assert.equal(evaluatePromo('GOLD15', 'Silver', 200, individualPromos).valid, false);

    assert.equal(evaluatePromo('FANPIT50', 'VIP', 500, individualPromos).valid, true);
    assert.equal(evaluatePromo('FANPIT50', 'Lounge', 700, individualPromos).valid, false);

    assert.equal(evaluatePromo('LOUNGE100', 'Lounge', 700, individualPromos).valid, true);
    assert.equal(evaluatePromo('LOUNGE100', 'VIP', 500, individualPromos).valid, false);

    const trioMiss = evaluatePromo('TRIO20', 'Lounge', 700, individualPromos);
    assert.equal(trioMiss.valid, false);
    assert.equal(trioMiss.message, 'TRIO20 applies only to Silver, Gold & VIP passes.');
    assert.equal(evaluatePromo('TRIO20', 'Gold', 400, individualPromos).valid, true);
  });

  it('unwraps JSON Firestore error payloads without leaking authInfo UID/email and maps transaction errors', () => {
    const wrappedNotFound = new Error(
      JSON.stringify({
        error: 'Booking no longer exists.',
        operationType: 'update',
        path: 'bookings/GZ-ABC123',
        authInfo: { userId: 'secret-uid-123', email: 'private@admin.com' },
      }),
    );
    const notFoundMsg = formatFriendlyFirebaseError(wrappedNotFound);
    assert.equal(notFoundMsg, 'This booking no longer exists or was already deleted.');
    assert.ok(!notFoundMsg.includes('secret-uid-123'));
    assert.ok(!notFoundMsg.includes('private@admin.com'));

    const wrappedUnknown = new Error(
      JSON.stringify({
        error: 'Custom server error message',
        operationType: 'write',
        path: 'bookings/GZ-111111',
        authInfo: { userId: 'uid-must-not-leak', email: 'leak@test.com' },
      }),
    );
    const unknownMsg = formatFriendlyFirebaseError(wrappedUnknown);
    assert.equal(unknownMsg, 'Custom server error message');
    assert.ok(!unknownMsg.includes('uid-must-not-leak'));

    assert.equal(
      formatFriendlyFirebaseError(new Error('Booking code already exists. Please try again.')),
      'Booking code already exists. Please try again.',
    );
    assert.equal(
      formatFriendlyFirebaseError(new Error('PAYMENT_NOT_PAID')),
      'This ticket has not been confirmed as paid yet.',
    );
    assert.equal(
      formatFriendlyFirebaseError(new Error('ALREADY_CHECKED_IN|2|2|8:05 PM|Gate Staff')),
      'This ticket is already fully checked in.',
    );
    assert.equal(
      formatFriendlyFirebaseError(
        new Error('Failed to get document because the client is offline.'),
      ),
      'Unable to reach the server. Check your internet connection and try again.',
    );
    assert.equal(
      formatFriendlyFirebaseError(new Error('Firestore deadline-exceeded')),
      'Request timed out. Please check your connection and try again.',
    );
    assert.equal(
      formatFriendlyFirebaseError(new Error('Transaction aborted due to contention')),
      'This record was just updated on another device. Please try again.',
    );
    assert.equal(
      formatFriendlyFirebaseError(new Error('resource-exhausted: quota exceeded')),
      'Daily Firestore free-tier quota exceeded. Quota resets tomorrow.',
    );
  });

  it('normalizes 12-digit 2010... and 13-digit 20010... Egyptian mobile formats (including Arabic digits)', () => {
    assert.equal(normalizeEgyptianMobile('201099887766'), '01099887766');
    assert.equal(normalizeEgyptianMobile('201123456789'), '01123456789');
    assert.equal(normalizeEgyptianMobile('201555551234'), '01555551234');
    assert.equal(normalizeEgyptianMobile('2001099887766'), '01099887766');
    assert.equal(normalizeEgyptianMobile('٢٠١٠٩٩٨٨٧٧٦٦'), '01099887766');
    assert.equal(validateEgyptianMobile('201099887766', true).valid, true);
    assert.equal(validateEgyptianMobile('2001234567890', true).valid, true);
  });

  it('sorts recent approvals by updatedAt descending (with createdAt fallback)', () => {
    const olderCreatedButJustApproved = {
      id: 'older-approved',
      createdAt: { seconds: 1000 },
      updatedAt: { seconds: 9000 },
    };
    const newerCreatedOlderUpdate = {
      id: 'newer-created',
      createdAt: { seconds: 5000 },
      updatedAt: { seconds: 6000 },
    };
    const createdOnly = {
      id: 'created-only',
      createdAt: { seconds: 7000 },
    };
    const sorted = sortByUpdatedAtDesc([
      newerCreatedOlderUpdate,
      createdOnly,
      olderCreatedButJustApproved,
    ]);
    assert.deepEqual(
      sorted.map((x) => x.id),
      ['older-approved', 'created-only', 'newer-created'],
    );
  });

  it('strips financial EGP columns from offline Excel export rows when includeFinancials is false (Gate Staff RBAC)', () => {
    const sample: Booking = {
      bookingCode: 'GZ-OFF111',
      userId: OFFLINE_USER_ID,
      concertId: 'qena-01',
      concertTitle: 'Upper Egypt Rising',
      concertDate: 'Fri, Dec 4, 2026',
      concertTime: '8:00 PM',
      concertVenue: 'Qena Cultural Palace',
      tier: 'VIP',
      quantity: 2,
      unitPrice: 450,
      promoCode: '',
      discountEgp: 0,
      totalEgp: 900,
      paymentMethod: 'Offline',
      transferRef: 'Qena Booth',
      paymentStatus: 'Paid',
      checkedIn: false,
      checkedInCount: 1,
      checkedInAt: '7:45 PM',
      approvedBy: 'Gate Lead',
      approvalMethod: 'Offline Desk',
      customerName: 'Omar Tarek',
      customerMobile: '01012345678',
      customerEmail: '',
    };

    const superRows = buildOfflineExportRows([sample], { includeFinancials: true });
    assert.equal(superRows[0]['Unit Price EGP'], 450);
    assert.equal(superRows[0]['Total EGP'], 900);
    assert.equal(superRows[0]['Checked In'], '1/2');

    const gateRows = buildOfflineExportRows([sample], { includeFinancials: false });
    assert.equal('Unit Price EGP' in gateRows[0], false);
    assert.equal('Total EGP' in gateRows[0], false);
    assert.equal(gateRows[0]['Booking Code'], 'GZ-OFF111');
    assert.equal(gateRows[0].Quantity, 2);
    assert.equal(gateRows[0]['Checked In'], '1/2');
  });
});


