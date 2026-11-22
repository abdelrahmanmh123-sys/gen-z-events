import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  ADMIN_SESSION_TTL_MS,
  buildAttendeesCsv,
  buildCalendarIcs,
  calculateOrderTotals,
  canAccessAdminTab,
  computeAdminKpis,
  computeCountdown,
  emailToDocId,
  escapeCsvCell,
  evaluatePasswordStrength,
  evaluatePromo,
  filterAndSortConcerts,
  fitPosterDimensions,
  formatDateTimeDisplay,
  generateBookingCode,
  getDefaultUpcomingIsoDate,
  getNextUpcomingConcert,
  getStaffPermissions,
  getTierColorHex,
  getTierUnitPrice,
  hexToRgba,
  isAdminSessionActive,
  isEmailVerifiedAdminCandidate,
  isPendingEmailVerification,
  isValidHexColor,
  isVerifiedFanAccount,
  MAX_POSTER_DATA_URL_LENGTH,
  normalizeEgyptianMobile,
  normalizeHexColor,
  normalizeOfflineMobile,
  normalizeTierValue,
  OFFLINE_USER_ID,
  parseBoundedIntInput,
  parseOfflineTicketRows,
  partitionAdminSessions,
  sanitizeId,
  sortByCreatedAtDesc,
  suggestTierPrices,
  validateBookingInput,
  validateEgyptianMobile,
  validateEmailAddress,
  validateFullName,
  validateProfileUpdateInput,
  validateSignupInput,
  validateTierColors,
  validateWaitlistInput,
} from './bookingLogic.ts';
import type { AdminSession, Booking, Concert, Promo } from '../types.ts';

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

  it('calculates order totals, clamps quantity to 1..6, and prevents negative totals', () => {
    const res = calculateOrderTotals(TEST_CONCERTS[0], 'VIP', 2, 'VIP100', TEST_PROMOS);
    assert.equal(res.unitPrice, 450);
    assert.equal(res.subtotalEgp, 900);
    assert.equal(res.discountEgp, 100);
    assert.equal(res.totalEgp, 800);

    assert.equal(calculateOrderTotals(TEST_CONCERTS[0], 'Silver', 99, '', TEST_PROMOS).quantity, 6);
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
    ]);
    assert.equal(superPerms.canConfirmPayments, true);
    assert.equal(superPerms.canGateCheckIn, true);
    assert.equal(superPerms.canAccessOfflineTickets, true);
    assert.equal(superPerms.canViewRecentApprovals, true);
    assert.equal(superPerms.canViewRevenueAnalytics, true);
    assert.equal(superPerms.canDeleteBookings, true);
    assert.equal(superPerms.canManageConcerts, true);
    assert.equal(superPerms.canManagePromos, true);
    assert.equal(superPerms.canManageTeam, true);

    const gatePerms = getStaffPermissions('Gate Staff');
    assert.equal(gatePerms.isSuperAdmin, false);
    assert.equal(gatePerms.isGateStaff, true);
    assert.equal(gatePerms.defaultTab, 'checkin');
    assert.deepEqual(gatePerms.allowedTabs, ['checkin', 'offline', 'dashboard']);
    assert.equal(gatePerms.canGateCheckIn, true);
    assert.equal(gatePerms.canAccessOfflineTickets, true);
    assert.equal(gatePerms.canViewRecentApprovals, true);
    assert.equal(gatePerms.canConfirmPayments, false);
    assert.equal(gatePerms.canViewRevenueAnalytics, false);
    assert.equal(gatePerms.canDeleteBookings, false);
    assert.equal(gatePerms.canManageConcerts, false);
    assert.equal(gatePerms.canManagePromos, false);
    assert.equal(gatePerms.canManageTeam, false);

    assert.equal(canAccessAdminTab('Gate Staff', 'checkin'), true);
    assert.equal(canAccessAdminTab('Gate Staff', 'offline'), true);
    assert.equal(canAccessAdminTab('Gate Staff', 'dashboard'), true);
    assert.equal(canAccessAdminTab('Gate Staff', 'schedule'), false);
    assert.equal(canAccessAdminTab('Gate Staff', 'manage'), false);
    assert.equal(canAccessAdminTab('Gate Staff', 'promos'), false);
    assert.equal(canAccessAdminTab('Gate Staff', 'team'), false);

    const noPerms = getStaffPermissions(null);
    assert.deepEqual(noPerms.allowedTabs, []);
    assert.equal(noPerms.canGateCheckIn, false);
    assert.equal(noPerms.canConfirmPayments, false);
    assert.equal(canAccessAdminTab(null, 'checkin'), false);
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
});
