import { after, before, beforeEach, describe, it } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

const PROJECT_ID = 'gen-z-events';
const RULES = fs.readFileSync(path.join(process.cwd(), 'firestore.rules'), 'utf8');

function parseEmulatorHost(): { host: string; port: number } {
  const raw = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
  const [host, portStr] = raw.split(':');
  return { host: host || '127.0.0.1', port: Number(portStr) || 8080 };
}

describe('Firestore Security Rules — Live Emulator Verification', () => {
  let testEnv: RulesTestEnvironment;

  before(async () => {
    const { host, port } = parseEmulatorHost();
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: {
        rules: RULES,
        host,
        port,
      },
    });
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const adminDb = ctx.firestore();
      await setDoc(doc(adminDb, 'concerts', 'qena-live'), {
        id: 'qena-live',
        title: 'Qena Live Night',
        artist: 'Houda',
        venue: 'Qena Cultural Palace',
        isoDate: '2026-12-04',
        isoTime: '20:00',
        date: 'Fri, Dec 4, 2026',
        time: '8:00 PM',
        doors: '6:30 PM',
        genre: 'Indie Pop / Rap',
        priceEgp: 300,
        tierPrices: { Silver: 300, Gold: 450, VIP: 650, Lounge: 950 },
        totalSeats: 500,
        seatsLeft: 400,
        description: 'Official concert night in Qena.',
        posterUrl: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await setDoc(doc(adminDb, 'promos', 'GENZ15'), {
        code: 'GENZ15',
        type: 'percent',
        value: 15,
        tiers: [],
        label: '15% Off',
        active: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await setDoc(doc(adminDb, 'paymentConfig', 'default'), {
        id: 'default',
        instapayNumber: '+201040206700',
        walletNumber: '+201040206700',
        updatedBy: 'Lead Organizer',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await setDoc(doc(adminDb, 'admins', 'gate_at_genz_dot_eg'), {
        id: 'gate_at_genz_dot_eg',
        name: 'Gate Agent',
        email: 'gate@genz.eg',
        role: 'Gate Staff',
        addedBy: 'Lead Organizer',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await setDoc(doc(adminDb, 'bookings', 'GZ-PAID01'), {
        bookingCode: 'GZ-PAID01',
        userId: 'fan-uid-1',
        concertId: 'qena-live',
        concertTitle: 'Qena Live Night',
        concertDate: 'Fri, Dec 4, 2026',
        concertTime: '8:00 PM',
        concertVenue: 'Qena Cultural Palace',
        tier: 'Silver',
        quantity: 2,
        unitPrice: 300,
        promoCode: '',
        discountEgp: 0,
        totalEgp: 600,
        paymentMethod: 'InstaPay',
        transferRef: 'IP-10001',
        paymentStatus: 'Paid',
        checkedIn: false,
        checkedInCount: 0,
        checkedInAt: '',
        approvedBy: 'Lead Organizer',
        approvalMethod: 'Desk Confirm',
        customerName: 'Nour Hassan',
        customerMobile: '01012345678',
        customerEmail: 'nour@gmail.com',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await setDoc(doc(adminDb, 'bookings', 'GZ-PEND01'), {
        bookingCode: 'GZ-PEND01',
        userId: 'fan-uid-1',
        concertId: 'qena-live',
        concertTitle: 'Qena Live Night',
        concertDate: 'Fri, Dec 4, 2026',
        concertTime: '8:00 PM',
        concertVenue: 'Qena Cultural Palace',
        tier: 'Silver',
        quantity: 1,
        unitPrice: 300,
        promoCode: '',
        discountEgp: 0,
        totalEgp: 300,
        paymentMethod: 'InstaPay',
        transferRef: 'IP-10002',
        paymentStatus: 'Pending',
        checkedIn: false,
        checkedInCount: 0,
        checkedInAt: '',
        approvedBy: '',
        approvalMethod: '',
        customerName: 'Nour Hassan',
        customerMobile: '01012345678',
        customerEmail: 'nour@gmail.com',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });
  });

  after(async () => {
    await testEnv.cleanup();
  });

  it('allows public reads of catalog/paymentConfig while denying all PII & writes', async () => {
    const anonDb = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(getDocs(collection(anonDb, 'concerts')));
    await assertSucceeds(getDocs(collection(anonDb, 'promos')));
    await assertSucceeds(getDoc(doc(anonDb, 'paymentConfig', 'default')));

    await assertFails(getDocs(collection(anonDb, 'bookings')));
    await assertFails(getDocs(collection(anonDb, 'users')));
    await assertFails(getDocs(collection(anonDb, 'auditLogs')));
    await assertFails(getDocs(collection(anonDb, 'admins')));
  });

  it('blocks unverified users and enforces server-verified fan pricing & ownership', async () => {
    const unverifiedDb = testEnv
      .authenticatedContext('unverified-1', {
        email: 'unverified@gmail.com',
        email_verified: false,
        firebase: { sign_in_provider: 'password' },
      })
      .firestore();

    await assertFails(getDoc(doc(unverifiedDb, 'bookings', 'GZ-PAID01')));

    const fanDb = testEnv
      .authenticatedContext('fan-uid-1', {
        email: 'nour@gmail.com',
        email_verified: true,
        firebase: { sign_in_provider: 'password' },
      })
      .firestore();

    // Fan can create a properly priced Pending booking with promo
    await assertSucceeds(
      setDoc(doc(fanDb, 'bookings', 'GZ-NEW001'), {
        bookingCode: 'GZ-NEW001',
        userId: 'fan-uid-1',
        concertId: 'qena-live',
        concertTitle: 'Qena Live Night',
        concertDate: 'Fri, Dec 4, 2026',
        concertTime: '8:00 PM',
        concertVenue: 'Qena Cultural Palace',
        tier: 'Silver',
        quantity: 2,
        unitPrice: 300,
        promoCode: 'GENZ15',
        discountEgp: 90,
        totalEgp: 510,
        paymentMethod: 'InstaPay',
        transferRef: 'IP-9911',
        paymentStatus: 'Pending',
        checkedIn: false,
        checkedInCount: 0,
        checkedInAt: '',
        approvedBy: '',
        approvalMethod: '',
        customerName: 'Nour Hassan',
        customerMobile: '01012345678',
        customerEmail: 'nour@gmail.com',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    );

    // Fan CANNOT tamper price or self-mark Paid
    await assertFails(
      setDoc(doc(fanDb, 'bookings', 'GZ-CHEAT1'), {
        bookingCode: 'GZ-CHEAT1',
        userId: 'fan-uid-1',
        concertId: 'qena-live',
        concertTitle: 'Qena Live Night',
        concertDate: 'Fri, Dec 4, 2026',
        concertTime: '8:00 PM',
        concertVenue: 'Qena Cultural Palace',
        tier: 'Silver',
        quantity: 2,
        unitPrice: 300,
        promoCode: '',
        discountEgp: 0,
        totalEgp: 10,
        paymentMethod: 'InstaPay',
        transferRef: 'IP-9912',
        paymentStatus: 'Pending',
        checkedIn: false,
        checkedInCount: 0,
        checkedInAt: '',
        approvedBy: '',
        approvalMethod: '',
        customerName: 'Nour Hassan',
        customerMobile: '01012345678',
        customerEmail: 'nour@gmail.com',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    );

    // Fan can cancel own Pending booking, CANNOT delete Paid booking
    await assertSucceeds(deleteDoc(doc(fanDb, 'bookings', 'GZ-PEND01')));
    await assertFails(deleteDoc(doc(fanDb, 'bookings', 'GZ-PAID01')));
  });

  it('enforces strict Gate Staff boundaries vs Super Admin and append-only auditLogs', async () => {
    const gateDb = testEnv
      .authenticatedContext('gate-uid-1', {
        email: 'gate@genz.eg',
        email_verified: true,
        firebase: { sign_in_provider: 'password' },
      })
      .firestore();

    // Gate Staff CAN check in a Paid booking (1/2) and decrement seatsLeft
    await assertSucceeds(
      updateDoc(doc(gateDb, 'bookings', 'GZ-PAID01'), {
        checkedIn: false,
        checkedInCount: 1,
        checkedInAt: '8:05 PM',
        approvedBy: 'Gate Agent',
        approvalMethod: 'Camera QR',
        updatedAt: serverTimestamp(),
      }),
    );
    await assertSucceeds(
      updateDoc(doc(gateDb, 'concerts', 'qena-live'), {
        seatsLeft: 398,
        updatedAt: serverTimestamp(),
      }),
    );

    // Gate Staff CANNOT confirm Pending payment, undo Paid payment, delete booking, or read auditLogs
    await assertFails(
      updateDoc(doc(gateDb, 'bookings', 'GZ-PEND01'), {
        paymentStatus: 'Paid',
        approvedBy: 'Gate Agent',
        approvalMethod: 'Desk Confirm',
        updatedAt: serverTimestamp(),
      }),
    );
    await assertFails(
      updateDoc(doc(gateDb, 'bookings', 'GZ-PAID01'), {
        paymentStatus: 'Pending',
        updatedAt: serverTimestamp(),
      }),
    );
    await assertFails(deleteDoc(doc(gateDb, 'bookings', 'GZ-PAID01')));
    await assertFails(getDocs(collection(gateDb, 'auditLogs')));

    // Gate Staff CAN append own checkin audit log, CANNOT forge payment_confirmed audit log
    await assertSucceeds(
      setDoc(doc(gateDb, 'auditLogs', 'log-gate-0001'), {
        id: 'log-gate-0001',
        action: 'checkin',
        actorUid: 'gate-uid-1',
        actorName: 'Gate Agent',
        actorEmail: 'gate@genz.eg',
        actorRole: 'Gate Staff',
        targetType: 'booking',
        targetId: 'GZ-PAID01',
        targetLabel: 'Nour Hassan',
        details: 'Camera QR · Entries 1/2',
        amountEgp: 0,
        createdAt: serverTimestamp(),
      }),
    );
    await assertFails(
      setDoc(doc(gateDb, 'auditLogs', 'log-gate-bad1'), {
        id: 'log-gate-bad1',
        action: 'payment_confirmed',
        actorUid: 'gate-uid-1',
        actorName: 'Gate Agent',
        actorEmail: 'gate@genz.eg',
        actorRole: 'Gate Staff',
        targetType: 'booking',
        targetId: 'GZ-PEND01',
        targetLabel: 'Nour Hassan',
        details: 'Attempted',
        amountEgp: 300,
        createdAt: serverTimestamp(),
      }),
    );

    // Super Admin CAN read auditLogs, CANNOT update or delete auditLogs (strict append-only!)
    const superDb = testEnv
      .authenticatedContext('super-uid-1', {
        email: 'weentamalak@gmail.com',
        email_verified: true,
        firebase: { sign_in_provider: 'google.com' },
      })
      .firestore();

    await assertSucceeds(getDocs(collection(superDb, 'auditLogs')));
    await assertFails(
      updateDoc(doc(superDb, 'auditLogs', 'log-gate-0001'), { details: 'Tampered' }),
    );
    await assertFails(deleteDoc(doc(superDb, 'auditLogs', 'log-gate-0001')));
  });
});
