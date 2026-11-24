import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PAYMENT_WHATSAPP_NUMBER } from '../data/defaults';
import {
  buildQrDownloadFilename,
  buildTicketReceiptWhatsAppUrl,
  computeTicketStubRects,
  getTicketDesignForTier,
  QR_ORIGINAL_EXPORT_MARGIN,
  QR_ORIGINAL_EXPORT_SIZE,
  TICKET_CANVAS_HEIGHT,
  TICKET_CANVAS_WIDTH,
  TICKET_DESIGN_CATALOG,
} from './ticketDesign';

test('all four official Houda x Qena ticket artwork assets exist in public/assets/aistudio', () => {
  assert.deepEqual(Object.keys(TICKET_DESIGN_CATALOG).sort(), ['gold', 'lounge', 'silver', 'vip']);
  for (const spec of Object.values(TICKET_DESIGN_CATALOG)) {
    assert.ok(spec.imagePath.startsWith('/assets/aistudio/'));
    const diskPath = path.join(process.cwd(), 'public', spec.imagePath);
    assert.ok(fs.existsSync(diskPath), `Missing ticket asset on disk: ${diskPath}`);
    assert.ok(/^#[0-9A-F]{6}$/.test(spec.stubGlow));
    assert.ok(/^#[0-9A-F]{6}$/.test(spec.stubTop));
    assert.ok(/^#[0-9A-F]{6}$/.test(spec.stubMid));
    assert.ok(/^#[0-9A-F]{6}$/.test(spec.stubBottom));
    assert.ok(/^#[0-9A-F]{6}$/.test(spec.stubEdge));
  }
});

test('getTicketDesignForTier maps Silver, Gold, VIP (Fan Pit), and Lounge to their distinct artworks', () => {
  assert.equal(getTicketDesignForTier('Silver').key, 'silver');
  assert.equal(getTicketDesignForTier('Silver').label, 'SILVER');
  assert.equal(getTicketDesignForTier('Gold').key, 'gold');
  assert.equal(getTicketDesignForTier('Gold').label, 'GOLD');
  assert.equal(getTicketDesignForTier('VIP').key, 'vip');
  assert.equal(getTicketDesignForTier('VIP').label, 'FAN PIT');
  assert.equal(getTicketDesignForTier('Fan Pit').key, 'vip');
  assert.equal(getTicketDesignForTier('Lounge').key, 'lounge');
  assert.equal(getTicketDesignForTier('Lounge').label, 'LOUNGE');
  assert.equal(getTicketDesignForTier('unknown-tier').key, 'silver');
});

test('computeTicketStubRects mounts the Digital QR Seal cleanly over the physical Official Stamp without touching headline or stub title', () => {
  const rects = computeTicketStubRects(TICKET_CANVAS_WIDTH, TICKET_CANVAS_HEIGHT);
  const W = TICKET_CANVAS_WIDTH;
  const H = TICKET_CANVAS_HEIGHT;

  // Leaves breathing room after Arabic headline (ends at x=0.6682) and stays clear of stub face center
  assert.ok(rects.patch.x > W * 0.675, 'QR seal overlaps Arabic headline');
  assert.ok(rects.patch.x + rects.patch.w < W * 0.825, 'QR seal extends too far into stub portrait');

  // Completely covers the physical OFFICIAL STAMP circle (x: 0.6935..0.7995, y: 0.2345..0.5586)
  assert.ok(rects.patch.x <= W * 0.69, 'QR seal leaves left edge of stamp circle exposed');
  assert.ok(rects.patch.x + rects.patch.w >= W * 0.805, 'QR seal leaves right edge of stamp circle exposed');
  assert.ok(rects.patch.y <= H * 0.225, 'QR seal leaves top edge of stamp circle exposed');
  assert.ok(rects.patch.y + rects.patch.h >= H * 0.565, 'QR seal leaves bottom edge of stamp circle exposed');

  // Stays completely above right-stub giant tier title (starts at y >= 0.675)
  assert.ok(rects.patch.y + rects.patch.h < H * 0.67, 'QR seal overlaps right-stub tier title');

  // QR frame is large and scannable (>= 160px on 1500x500), strictly inside seal
  assert.ok(rects.qrFrame.size >= 160, `QR frame too small: ${rects.qrFrame.size}`);
  assert.ok(rects.qrFrame.x > rects.patch.x);
  assert.ok(rects.qrFrame.x + rects.qrFrame.size < rects.patch.x + rects.patch.w);
  assert.ok(rects.qrFrame.y >= rects.patch.y);
  assert.ok(rects.qrImage.size >= 150, `QR inner image too small: ${rects.qrImage.size}`);

  // Booking code sits below QR frame and strictly inside the seal
  assert.ok(rects.codeText.baselineY > rects.qrFrame.y + rects.qrFrame.size + 8);
  assert.ok(rects.codeText.baselineY < rects.patch.y + rects.patch.h);
});

test('original-size QR export settings and download filename builder are crisp and safe', () => {
  assert.ok(QR_ORIGINAL_EXPORT_SIZE >= 1024, 'Original QR export should be at least 1024px');
  assert.ok(QR_ORIGINAL_EXPORT_MARGIN >= 4, 'Original QR export should preserve 4-module quiet zone');
  assert.equal(buildQrDownloadFilename('GZ-D7MM9E'), 'GZ-D7MM9E-genz-qr.png');
  assert.equal(buildQrDownloadFilename('  GZ-99/..\\bad  '), 'GZ-99bad-genz-qr.png');
  assert.equal(buildQrDownloadFilename(''), 'ticket-genz-qr.png');
});

test('buildTicketReceiptWhatsAppUrl directs straight to +201040206700 with receipt details in EN and AR', () => {
  assert.equal(PAYMENT_WHATSAPP_NUMBER, '201040206700');

  const pendingBooking = {
    bookingCode: 'GZ-RCP888',
    concertTitle: 'Houda Live in Qena',
    concertDate: 'Thu, Dec 17, 2026',
    concertTime: '8:00 PM',
    concertVenue: 'Qena Sports Stadium',
    quantity: 2,
    paymentStatus: 'Pending' as const,
    transferRef: 'IPN-998877',
    customerName: 'Ahmed Ali',
    customerMobile: '01099887766',
  };

  const enUrl = buildTicketReceiptWhatsAppUrl(pendingBooking, {
    lang: 'en',
    tierLabel: 'Gold',
    paymentMethodLabel: 'InstaPay',
    totalFormatted: '1,200 EGP',
    statusText: 'Pending Verification',
  });
  assert.ok(enUrl.startsWith('https://wa.me/201040206700?text='));
  const enBody = decodeURIComponent(enUrl.split('?text=')[1]);
  assert.ok(enBody.includes('GZ-RCP888'));
  assert.ok(enBody.includes('IPN-998877'));
  assert.ok(enBody.includes('Ahmed Ali'));
  assert.ok(enBody.includes('payment receipt'));

  const arUrl = buildTicketReceiptWhatsAppUrl(pendingBooking, {
    lang: 'ar',
    tierLabel: 'جولد',
    paymentMethodLabel: 'إنستا باي',
    totalFormatted: '1,200 ج.م',
    statusText: 'بانتظار مراجعة التحويل',
  });
  assert.ok(arUrl.startsWith('https://wa.me/201040206700?text='));
  const arBody = decodeURIComponent(arUrl.split('?text=')[1]);
  assert.ok(arBody.includes('GZ-RCP888'));
  assert.ok(arBody.includes('IPN-998877'));
  assert.ok(arBody.includes('مرفق إيصال الدفع'));

  const paidUrl = buildTicketReceiptWhatsAppUrl(
    { ...pendingBooking, paymentStatus: 'Paid' as const },
    {
      lang: 'en',
      tierLabel: 'Gold',
      paymentMethodLabel: 'InstaPay',
      totalFormatted: '1,200 EGP',
      statusText: 'Paid · QR Ready',
    },
  );
  assert.ok(paidUrl.startsWith('https://wa.me/201040206700?text='));
  const paidBody = decodeURIComponent(paidUrl.split('?text=')[1]);
  assert.ok(!paidBody.includes('Attached is my payment receipt'));
});

test('camera access is strictly isolated to verified staff and never requested upfront from visitors', () => {
  const metadataPath = path.join(process.cwd(), 'metadata.json');
  const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8')) as {
    requestFramePermissions?: string[];
  };
  assert.equal(
    (metadata.requestFramePermissions || []).includes('camera'),
    true,
    'metadata.json must allow camera iframe permission so verified staff can use Gate QR Check-In',
  );

  // AdminCheckin must strictly guard camera startup behind verified staff state
  const adminCheckinPath = path.join(process.cwd(), 'src', 'components', 'admin', 'AdminCheckin.tsx');
  const adminCheckinSrc = fs.readFileSync(adminCheckinPath, 'utf8');
  assert.ok(
    adminCheckinSrc.includes('if (!isVerifiedStaff) return;'),
    'AdminCheckin startCamera must require verified staff',
  );

  // Recursively scan every non-admin source file to confirm zero getUserMedia/mediaDevices usage
  const srcRoot = path.join(process.cwd(), 'src');
  const walk = (dir: string, out: string[] = []): string[] => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (full.endsWith(path.join('components', 'admin'))) continue;
        walk(full, out);
      } else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.test.ts')) {
        out.push(full);
      }
    }
    return out;
  };
  for (const file of walk(srcRoot)) {
    const content = fs.readFileSync(file, 'utf8');
    assert.equal(
      /getUserMedia|mediaDevices/.test(content),
      false,
      `Public storefront file must not access camera APIs: ${file}`,
    );
  }
});
