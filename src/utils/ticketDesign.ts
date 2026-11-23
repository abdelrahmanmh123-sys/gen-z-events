import { PAYMENT_WHATSAPP_NUMBER } from '../data/defaults';
import type { Booking, TierId } from '../types';

export type TicketDesignKey = 'silver' | 'gold' | 'vip' | 'bronze';

export interface TicketDesignSpec {
  key: TicketDesignKey;
  imagePath: string;
  label: string;
  accentHex: string;
  /** Exact center-spotlight, mid-body, bottom, and outer-edge RGB hexes sampled from the PNG stub */
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
 * Exact normalized geometry (0..1) of the right-hand stub area on the 4344x1448 (3:1)
 * official Gen Z Events ticket artworks.
 *
 * Measured artwork boundaries:
 * - Perforation dashed line: x = 0.7472
 * - White ZONE/ROW/SEAT box: x = 0.7739..0.9735, y = 0.4700..0.6460
 * - Barcode + fake serial:   x = 0.7843..0.9629, y = 0.6934..0.8702
 * - "CONCERT TICKET" text:   y = 0.4200..0.4320
 * - Bottom tear notch:       x <= 0.757, y >= 0.942
 * - Right metallic frame:    x = 0.9942
 * - Bottom metallic frame:   y = 0.9700
 */
export const TICKET_STUB_SLOT = {
  patchLeft: 0.76,
  patchWidth: 0.226,
  patchTop: 0.45,
  patchHeight: 0.496,
  /** Relative to full ticket height so the QR fills ~86% of the stub slot for effortless scanning */
  qrFrameHeightRatio: 0.428,
  qrInnerPaddingRatio: 0.026,
} as const;

export const TICKET_DESIGN_CATALOG: Record<TicketDesignKey, TicketDesignSpec> = {
  silver: {
    key: 'silver',
    imagePath: '/assets/aistudio/silver_front_0b6e6ae1.png',
    label: 'SILVER',
    accentHex: '#CBD5E1',
    stubGlow: '#44494F',
    stubTop: '#2D3137',
    stubMid: '#1F2328',
    stubBottom: '#15181D',
    stubEdge: '#1A1D22',
  },
  gold: {
    key: 'gold',
    imagePath: '/assets/aistudio/gold_front_60cec974.png',
    label: 'GOLD',
    accentHex: '#F5D06B',
    stubGlow: '#554622',
    stubTop: '#332B19',
    stubMid: '#241F14',
    stubBottom: '#18150E',
    stubEdge: '#201C13',
  },
  vip: {
    key: 'vip',
    imagePath: '/assets/aistudio/vip_front_b1555c0d.png',
    label: 'VIP LOUNGE',
    accentHex: '#C084FC',
    stubGlow: '#412462',
    stubTop: '#281A40',
    stubMid: '#1C142E',
    stubBottom: '#130D21',
    stubEdge: '#191229',
  },
  bronze: {
    key: 'bronze',
    imagePath: '/assets/aistudio/bronze_front_be8bcb17.png',
    label: 'BRONZE',
    accentHex: '#D9895B',
    stubGlow: '#472B18',
    stubTop: '#2E1E15',
    stubMid: '#201712',
    stubBottom: '#150F0C',
    stubEdge: '#1C1511',
  },
};

export function getTicketDesignForTier(tier: TierId | 'Bronze' | string): TicketDesignSpec {
  const normalized = String(tier || '').trim().toLowerCase();
  if (normalized === 'gold') return TICKET_DESIGN_CATALOG.gold;
  if (normalized === 'vip' || normalized === 'lounge' || normalized === 'vip lounge') {
    return TICKET_DESIGN_CATALOG.vip;
  }
  if (normalized === 'bronze') return TICKET_DESIGN_CATALOG.bronze;
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
  const maxQrSize = Math.min(
    Math.round(height * TICKET_STUB_SLOT.qrFrameHeightRatio),
    patchW - Math.round(width * 0.016),
  );
  const qrFrameX = Math.round(centerX - maxQrSize / 2);
  const qrFrameY = patchY + Math.round(height * 0.012);
  const innerPad = Math.max(4, Math.round(maxQrSize * TICKET_STUB_SLOT.qrInnerPaddingRatio));
  const qrImageSize = maxQrSize - innerPad * 2;

  const remainingBottom = patchY + patchH - (qrFrameY + maxQrSize);
  const fontSize = Math.max(15, Math.round(height * 0.042));
  const baselineY = Math.round(qrFrameY + maxQrSize + remainingBottom * 0.72);

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
 * Builds a direct WhatsApp click-to-chat URL to Gen Z Events (+201040206700)
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
