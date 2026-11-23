import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PAYMENT_WHATSAPP_NUMBER } from '../data/defaults';
import {
  buildTicketReceiptWhatsAppUrl,
  computeTicketStubRects,
  getTicketDesignForTier,
  TICKET_CANVAS_HEIGHT,
  TICKET_CANVAS_WIDTH,
  TICKET_DESIGN_CATALOG,
} from './ticketDesign';

test('all four official ticket background PNG assets exist in public/assets/aistudio', () => {
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

test('getTicketDesignForTier maps Silver, Gold, VIP, Lounge, and Bronze cleanly', () => {
  assert.equal(getTicketDesignForTier('Silver').key, 'silver');
  assert.equal(getTicketDesignForTier('Gold').key, 'gold');
  assert.equal(getTicketDesignForTier('VIP').key, 'vip');
  assert.equal(getTicketDesignForTier('Lounge').key, 'vip');
  assert.equal(getTicketDesignForTier('Bronze').key, 'bronze');
  assert.equal(getTicketDesignForTier('bronze').key, 'bronze');
  assert.equal(getTicketDesignForTier('unknown-tier').key, 'silver');
});

test('computeTicketStubRects cleanly covers ZONE/ROW/SEAT/barcode without touching frame or CONCERT TICKET', () => {
  const rects = computeTicketStubRects(TICKET_CANVAS_WIDTH, TICKET_CANVAS_HEIGHT);
  const W = TICKET_CANVAS_WIDTH;
  const H = TICKET_CANVAS_HEIGHT;

  // Strictly right of dashed perforation (0.7472) and left of metallic right border (0.9942)
  assert.ok(rects.patch.x > W * 0.75, 'patch overlaps perforation line');
  assert.ok(rects.patch.x + rects.patch.w < W * 0.992, 'patch overlaps right metallic border');

  // Strictly below "CONCERT TICKET" (0.432) and above bottom metallic border (0.970)
  assert.ok(rects.patch.y > H * 0.435, 'patch overlaps CONCERT TICKET subtitle');
  assert.ok(rects.patch.y + rects.patch.h < H * 0.965, 'patch overlaps bottom border');

  // Completely covers white ZONE/ROW/SEAT box (x: 0.7739..0.9735, y: 0.47..0.646)
  // and barcode + serial (x: 0.7843..0.9629, y: 0.6934..0.8702)
  assert.ok(rects.patch.x <= W * 0.77, 'patch leaves left edge of ZONE box exposed');
  assert.ok(rects.patch.x + rects.patch.w >= W * 0.978, 'patch leaves right edge of ZONE box exposed');
  assert.ok(rects.patch.y <= H * 0.465, 'patch leaves top edge of ZONE box exposed');
  assert.ok(rects.patch.y + rects.patch.h >= H * 0.885, 'patch leaves serial text exposed');

  // QR frame is large (>= 210px on 1500x500), strictly inside patch, with clean quiet zone
  assert.ok(rects.qrFrame.size >= 210, `QR frame too small: ${rects.qrFrame.size}`);
  assert.ok(rects.qrFrame.x > rects.patch.x);
  assert.ok(rects.qrFrame.x + rects.qrFrame.size < rects.patch.x + rects.patch.w);
  assert.ok(rects.qrFrame.y >= rects.patch.y);
  assert.ok(rects.qrImage.size >= 196, `QR inner image too small: ${rects.qrImage.size}`);

  // Booking code sits below QR frame and strictly inside the patch
  assert.ok(rects.codeText.baselineY > rects.qrFrame.y + rects.qrFrame.size + 10);
  assert.ok(rects.codeText.baselineY < rects.patch.y + rects.patch.h);
});

test('buildTicketReceiptWhatsAppUrl directs straight to +201041062000 with receipt details in EN and AR', () => {
  assert.equal(PAYMENT_WHATSAPP_NUMBER, '201041062000');

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
  assert.ok(enUrl.startsWith('https://wa.me/201041062000?text='));
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
  assert.ok(arUrl.startsWith('https://wa.me/201041062000?text='));
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
  assert.ok(paidUrl.startsWith('https://wa.me/201041062000?text='));
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
