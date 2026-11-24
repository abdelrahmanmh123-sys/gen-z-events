import { PAYMENT_WHATSAPP_NUMBER } from '../data/defaults';
import type { Booking, TierId } from '../types';

export type TicketDesignKey = 'silver' | 'gold' | 'vip' | 'lounge';

export interface TicketDesignSpec {
  key: TicketDesignKey;
  imagePath: string;
  label: string;
  accentHex: string;
  /** Tier-matched dark palette for card border glow, skeleton loader, and offline fallback */
  stubGlow: string;
  stubTop: string;
  stubMid: string;
  stubBottom: string;
  stubEdge: string;
}

export const TICKET_CANVAS_WIDTH = 1500;
export const TICKET_CANVAS_HEIGHT = 500;
export const QR_ORIGINAL_EXPORT_SIZE = 1024;
export const QR_ORIGINAL_EXPORT_MARGIN = 4;

export function buildQrDownloadFilename(bookingCode: string): string {
  const safeCode = String(bookingCode || 'ticket')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '');
  return `${safeCode || 'ticket'}-genz-qr.png`;
}

/**
 * Exact normalized geometry (0..1) of the Digital QR Seal replacing the physical
 * "مكان الختم / OFFICIAL STAMP" circle on the 4344x1448 (3:1) Houda x Qena artworks.
 *
 * Measured artwork boundaries:
 * - Arabic headline ("حودة X قنا") right edge: x = 0.6682
 * - Physical OFFICIAL STAMP outer ring:        x = 0.6935..0.7995, y = 0.2345..0.5586
 * - Perforation dashed line center:            x = 0.7465
 * - Right-stub giant tier title (LOUNGE/etc):  y >= 0.675
 *
 * Placing the rounded dark QR seal at x = 0.684..0.810, y = 0.214..0.654 completely
 * covers the physical stamp circle while leaving 100% of the Arabic headline,
 * bottom date/time/venue bar, and right-stub tier artwork completely unobstructed.
 */
export const TICKET_STUB_SLOT = {
  patchLeft: 0.684,
  patchWidth: 0.126,
  patchTop: 0.214,
  patchHeight: 0.44,
  /** Relative to full ticket height so the QR fills ~76% of the seal height cleanly */
  qrFrameHeightRatio: 0.336,
  qrInnerPaddingRatio: 0.032,
} as const;

export const TICKET_DESIGN_CATALOG: Record<TicketDesignKey, TicketDesignSpec> = {
  silver: {
    key: 'silver',
    imagePath: '/assets/aistudio/Picsart_26-11-23_23-44-09-266_6f827646.jpg',
    label: 'SILVER',
    accentHex: '#CBD5E1',
    stubGlow: '#3E444D',
    stubTop: '#242932',
    stubMid: '#151921',
    stubBottom: '#0A0D12',
    stubEdge: '#11151C',
  },
  gold: {
    key: 'gold',
    imagePath: '/assets/aistudio/Picsart_26-11-23_23-43-56-751_8cb50bad.jpg',
    label: 'GOLD',
    accentHex: '#F5D06B',
    stubGlow: '#52401A',
    stubTop: '#312611',
    stubMid: '#1D170B',
    stubBottom: '#0E0B06',
    stubEdge: '#171209',
  },
  vip: {
    key: 'vip',
    imagePath: '/assets/aistudio/Picsart_26-11-23_23-44-23-795_e887538b.jpg',
    label: 'FAN PIT',
    accentHex: '#84CC16',
    stubGlow: '#2A4D14',
    stubTop: '#1A300C',
    stubMid: '#101E08',
    stubBottom: '#081005',
    stubEdge: '#0D1807',
  },
  lounge: {
    key: 'lounge',
    imagePath: '/assets/aistudio/Picsart_26-11-23_23-43-39-262_423bdafa.jpg',
    label: 'LOUNGE',
    accentHex: '#C084FC',
    stubGlow: '#432066',
    stubTop: '#291440',
    stubMid: '#190D29',
    stubBottom: '#0C0715',
    stubEdge: '#140A21',
  },
};

export function getTicketDesignForTier(tier: TierId | string): TicketDesignSpec {
  const normalized = String(tier || '').trim().toLowerCase();
  if (normalized === 'gold') return TICKET_DESIGN_CATALOG.gold;
  if (normalized === 'lounge' || normalized === 'vip lounge') {
    return TICKET_DESIGN_CATALOG.lounge;
  }
  if (normalized === 'vip' || normalized === 'fan pit' || normalized === 'fanpit') {
    return TICKET_DESIGN_CATALOG.vip;
  }
  return TICKET_DESIGN_CATALOG.silver;
}

export interface TicketStubRects {
  patch: { x: number; y: number; w: number; h: number };
  qrFrame: { x: number; y: number; size: number; radius: number };
  qrImage: { x: number; y: number; size: number };
  codeText: { centerX: number; baselineY: number; fontSize: number };
}

export function computeTicketStubRects(
  width = TICKET_CANVAS_WIDTH,
  height = TICKET_CANVAS_HEIGHT,
): TicketStubRects {
  const patchX = Math.round(width * TICKET_STUB_SLOT.patchLeft);
  const patchW = Math.round(width * TICKET_STUB_SLOT.patchWidth);
  const patchY = Math.round(height * TICKET_STUB_SLOT.patchTop);
  const patchH = Math.round(height * TICKET_STUB_SLOT.patchHeight);

  const centerX = Math.round(patchX + patchW / 2);
  const horizontalInset = Math.max(10, Math.round(patchW * 0.1));
  const maxQrSize = Math.min(
    Math.round(height * TICKET_STUB_SLOT.qrFrameHeightRatio),
    patchW - horizontalInset,
  );
  const qrFrameX = Math.round(centerX - maxQrSize / 2);
  const qrFrameY = patchY + Math.max(8, Math.round(patchH * 0.05));
  const innerPad = Math.max(4, Math.round(maxQrSize * TICKET_STUB_SLOT.qrInnerPaddingRatio));
  const qrImageSize = maxQrSize - innerPad * 2;

  const remainingBottom = patchY + patchH - (qrFrameY + maxQrSize);
  const fontSize = Math.max(14, Math.round(height * 0.036));
  const baselineY = Math.round(qrFrameY + maxQrSize + remainingBottom * 0.68);

  return {
    patch: { x: patchX, y: patchY, w: patchW, h: patchH },
    qrFrame: {
      x: qrFrameX,
      y: qrFrameY,
      size: maxQrSize,
      radius: Math.round(maxQrSize * 0.06),
    },
    qrImage: {
      x: qrFrameX + innerPad,
      y: qrFrameY + innerPad,
      size: qrImageSize,
    },
    codeText: {
      centerX,
      baselineY,
      fontSize,
    },
  };
}

export interface TicketWhatsAppOptions {
  lang: 'en' | 'ar';
  tierLabel: string;
  paymentMethodLabel: string;
  totalFormatted: string;
  statusText: string;
}

/**
 * Builds a direct WhatsApp click-to-chat URL to Gen Z Events (+201016131000)
 * pre-filled with booking and payment details so fans can send their payment receipt.
 */
export function buildTicketReceiptWhatsAppUrl(
  booking: Pick<
    Booking,
    | 'bookingCode'
    | 'concertTitle'
    | 'concertDate'
    | 'concertTime'
    | 'concertVenue'
    | 'quantity'
    | 'paymentStatus'
    | 'transferRef'
    | 'customerName'
    | 'customerMobile'
  >,
  options: TicketWhatsAppOptions,
): string {
  const { lang, tierLabel, paymentMethodLabel, totalFormatted, statusText } = options;
  const isPaid = booking.paymentStatus === 'Paid';

  const lines =
    lang === 'ar'
      ? [
          isPaid ? 'تذكرة Gen Z Events الإلكترونية' : 'إرسال إيصال دفع — Gen Z Events',
          `كود الحجز: ${booking.bookingCode}`,
          `الاسم: ${booking.customerName}`,
          `الموبايل: ${booking.customerMobile}`,
          `الحفل: ${booking.concertTitle}`,
          `الموعد: ${booking.concertDate} · ${booking.concertTime}`,
          `المكان: ${booking.concertVenue}`,
          `الفئة: ${booking.quantity}x ${tierLabel} (${totalFormatted})`,
          `طريقة الدفع: ${paymentMethodLabel}${booking.transferRef ? ` · المرجع: ${booking.transferRef}` : ''}`,
          `الحالة: ${statusText}`,
          ...(isPaid ? [] : ['', 'مرفق إيصال الدفع لمراجعة وتأكيد الحجز.']),
        ]
      : [
          isPaid ? 'Gen Z Events E-Pass' : 'Gen Z Events — Payment Receipt',
          `Booking Code: ${booking.bookingCode}`,
          `Name: ${booking.customerName}`,
          `Mobile: ${booking.customerMobile}`,
          `Show: ${booking.concertTitle}`,
          `Date: ${booking.concertDate} · ${booking.concertTime}`,
          `Venue: ${booking.concertVenue}`,
          `Pass: ${booking.quantity}x ${tierLabel} (${totalFormatted})`,
          `Payment: ${paymentMethodLabel}${booking.transferRef ? ` · Ref: ${booking.transferRef}` : ''}`,
          `Status: ${statusText}`,
          ...(isPaid ? [] : ['', 'Attached is my payment receipt for verification.']),
        ];

  return `https://wa.me/${PAYMENT_WHATSAPP_NUMBER}?text=${encodeURIComponent(lines.join('\n'))}`;
}
