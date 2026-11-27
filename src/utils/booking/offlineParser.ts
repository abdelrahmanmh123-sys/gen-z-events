import type { Booking, Concert, TierId } from '../../types';
import { getTierUnitPrice } from './pricing';
import { generateBookingCode } from './rbacAndTickets';
import { normalizeEgyptianMobile, toAsciiDigits } from './validation';

export const MAX_OFFLINE_QTY_PER_ROW = 500;
export const OFFLINE_USER_ID = 'offline-sale';

export interface ParsedOfflineRowError {
  rowNumber: number;
  reason: string;
}

export interface ParsedOfflineBatchResult {
  validBookings: Omit<Booking, 'createdAt' | 'updatedAt'>[];
  errors: ParsedOfflineRowError[];
  totalTickets: number;
  paidTickets: number;
  totalRevenueEgp: number;
}

function normalizeHeaderKey(key: string): string {
  return key
    .trim()
    .toLowerCase()
    .replace(/[\s_\-/.]+/g, '');
}

function pickColumnValue(row: Record<string, unknown>, aliases: string[]): string {
  const entries = Object.entries(row);
  for (const alias of aliases) {
    const target = normalizeHeaderKey(alias);
    for (const [k, v] of entries) {
      if (normalizeHeaderKey(k) === target && v !== undefined && v !== null) {
        const s = String(v).trim();
        if (s !== '') return s;
      }
    }
  }
  return '';
}

export function normalizeTierValue(raw: string): TierId | null {
  const clean = raw.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!clean) return null;
  if (
    clean === 'silver' ||
    clean === 's' ||
    clean === 'regular' ||
    clean === 'standard' ||
    clean === 'فضي' ||
    clean === 'سيلفر' ||
    clean.includes('silver') ||
    clean.includes('سيلفر')
  ) {
    return 'Silver';
  }
  if (
    clean === 'gold' ||
    clean === 'g' ||
    clean === 'ذهبي' ||
    clean === 'جولد' ||
    clean.includes('gold') ||
    clean.includes('جولد')
  ) {
    return 'Gold';
  }
  if (
    clean === 'vip' ||
    clean === 'v' ||
    clean === 'fan pit' ||
    clean === 'fanpit' ||
    clean === 'fan-pit' ||
    clean === 'فان بيت' ||
    clean === 'في اي بي' ||
    clean === 'في آي بي' ||
    clean === 'كبار الشخصيات' ||
    clean.includes('fan pit') ||
    clean.includes('fanpit') ||
    clean.includes('فان بيت') ||
    clean.includes('vip')
  ) {
    return 'VIP';
  }
  if (
    clean === 'lounge' ||
    clean === 'l' ||
    clean === 'table' ||
    clean === 'لاونج' ||
    clean.includes('lounge') ||
    clean.includes('لاونج')
  ) {
    return 'Lounge';
  }
  return null;
}

function parseTruthyFlag(raw: string): boolean {
  const v = raw.trim().toLowerCase();
  return v === 'yes' || v === 'true' || v === '1' || v === 'y' || v === 'checked' || v === 'checked in' || v === 'نعم';
}

function sanitizeOfflineBookingCode(raw: string, usedCodes: Set<string>): string {
  const cleaned = raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '')
    .slice(0, 32);
  if (cleaned.length >= 5 && !usedCodes.has(cleaned)) {
    usedCodes.add(cleaned);
    return cleaned;
  }
  let generated = generateBookingCode();
  while (usedCodes.has(generated)) {
    generated = generateBookingCode();
  }
  usedCodes.add(generated);
  return generated;
}

export function normalizeOfflineMobile(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  // Excel sometimes strips the leading zero from Egyptian numbers (e.g. 1012345678)
  const normalizedEg = normalizeEgyptianMobile(trimmed);
  if (normalizedEg.length >= 6 && normalizedEg.length <= 30) {
    return normalizedEg;
  }
  return trimmed.slice(0, 30);
}

export function parseOfflineTicketRows(
  rows: Record<string, unknown>[],
  concert: Concert,
  adminName: string,
  existingCodes: Iterable<string> = [],
): ParsedOfflineBatchResult {
  const usedCodes = new Set<string>(Array.from(existingCodes, (c) => c.toUpperCase()));
  const validBookings: Omit<Booking, 'createdAt' | 'updatedAt'>[] = [];
  const errors: ParsedOfflineRowError[] = [];
  let totalTickets = 0;
  let paidTickets = 0;
  let totalRevenueEgp = 0;

  rows.forEach((row, index) => {
    const rowNumber = index + 2; // Row 1 is spreadsheet header

    // Ignore completely blank rows
    const hasAnyValue = Object.values(row).some(
      (v) => v !== undefined && v !== null && String(v).trim() !== '',
    );
    if (!hasAnyValue) return;

    const rawName = pickColumnValue(row, [
      'Customer Name',
      'Full Name',
      'Name',
      'Buyer',
      'Buyer Name',
      'Attendee',
      'Guest',
      'Client',
      'الاسم',
      'اسم العميل',
    ]);
    const rawMobile = pickColumnValue(row, [
      'Mobile',
      'Phone',
      'Customer Mobile',
      'Phone Number',
      'Mobile Number',
      'Tel',
      'Whatsapp',
      'رقم الواتساب للتواصل',
      'رقم الواتساب',
      'واتساب',
      'رقم الموبايل',
      'الموبايل',
      'الهاتف',
    ]);
    const rawEmail = pickColumnValue(row, ['Email', 'Customer Email', 'E-mail', 'البريد الالكتروني']);
    const rawTier = pickColumnValue(row, [
      'Tier',
      'Category',
      'Pass',
      'Pass Tier',
      'Ticket Tier',
      'Ticket Category',
      'Class',
      'فئة التذكرة',
      'الفئة',
    ]);
    const rawQty = pickColumnValue(row, [
      'Quantity',
      'Qty',
      'Tickets',
      'Count',
      'Seats',
      'Passes',
      'العدد',
      'عدد التذاكر',
    ]);
    const rawAmount = pickColumnValue(row, [
      'Total EGP',
      'Total',
      'Amount',
      'Paid',
      'Amount EGP',
      'Price',
      'المبلغ',
      'الاجمالي',
    ]);
    const rawOutlet = pickColumnValue(row, [
      'Outlet',
      'POS',
      'Branch',
      'Seller',
      'Source',
      'Location',
      'Booth',
      'Receipt',
      'Ref',
      'Transfer Ref',
      'Reference',
      'Notes',
      'مركز البيع',
      'المنفذ',
      'البائع',
    ]);
    const rawCode = pickColumnValue(row, ['Booking Code', 'Code', 'Ticket Code', 'Ticket ID', 'ID', 'الكود']);
    const rawStatus = pickColumnValue(row, ['Payment Status', 'Status', 'الحالة']);
    const rawCheckedIn = pickColumnValue(row, ['Checked In', 'Check In', 'Entered', 'الدخول']);

    const cleanName = rawName.replace(/\s+/g, ' ').trim().slice(0, 100);
    if (cleanName.length < 2) {
      errors.push({ rowNumber, reason: 'Missing or invalid customer name (at least 2 characters).' });
      return;
    }

    const cleanMobile = normalizeOfflineMobile(rawMobile);
    if (cleanMobile.length < 6) {
      errors.push({
        rowNumber,
        reason: `Missing or invalid mobile number for "${cleanName}" (need at least 6 digits).`,
      });
      return;
    }

    const tier = normalizeTierValue(rawTier || 'Silver');
    if (!tier) {
      errors.push({
        rowNumber,
        reason: `Unknown ticket category "${rawTier}" for "${cleanName}". Use Silver, Gold, VIP, or Lounge.`,
      });
      return;
    }

    const normalizedQtyStr = rawQty ? toAsciiDigits(rawQty).replace(/,/g, '').trim() : '';
    const qtyNum = normalizedQtyStr ? Number(normalizedQtyStr) : 1;
    if (!Number.isInteger(qtyNum) || qtyNum < 1 || qtyNum > MAX_OFFLINE_QTY_PER_ROW) {
      errors.push({
        rowNumber,
        reason: `Invalid quantity "${rawQty}" for "${cleanName}" (must be an integer 1–${MAX_OFFLINE_QTY_PER_ROW}).`,
      });
      return;
    }

    const unitPrice = getTierUnitPrice(concert, tier);
    const expectedSubtotal = unitPrice * qtyNum;
    let totalEgp = expectedSubtotal;
    let discountEgp = 0;

    if (rawAmount) {
      const normalizedAmount = toAsciiDigits(rawAmount)
        .replace(/ج\s*\.\s*م\.?/g, '')
        .replace(/\b(?:egp|l\.?\s*e\.?)\b/gi, '')
        .replace(/[,٬\s]/g, '');
      const strippedAmount = normalizedAmount.replace(/[^0-9.-]/g, '');
      const cleanedAmount = Number(strippedAmount);
      if (
        strippedAmount === '' ||
        !/^-?\d+(?:\.\d+)?$/.test(strippedAmount) ||
        !Number.isFinite(cleanedAmount) ||
        cleanedAmount < 0 ||
        cleanedAmount > 50000000
      ) {
        errors.push({
          rowNumber,
          reason: `Invalid total amount "${rawAmount}" for "${cleanName}".`,
        });
        return;
      }
      totalEgp = Math.round(cleanedAmount);
      discountEgp = Math.max(0, expectedSubtotal - totalEgp);
    }

    const cleanEmail = rawEmail.trim().toLowerCase().slice(0, 120);
    const statusLower = rawStatus.trim().toLowerCase();
    const paymentStatus: 'Paid' | 'Pending' =
      statusLower === 'pending' ||
      statusLower === 'unpaid' ||
      statusLower === 'معلق' ||
      statusLower === 'معلّق' ||
      statusLower === 'قيد المراجعة' ||
      statusLower === 'غير مدفوع'
        ? 'Pending'
        : 'Paid';
    const checkedIn = paymentStatus === 'Paid' && parseTruthyFlag(rawCheckedIn);
    const transferRef = (rawOutlet.replace(/\s+/g, ' ').trim() || 'Offline Box Office')
      .padEnd(3, ' ')
      .trim()
      .slice(0, 80);
    const safeTransferRef = transferRef.length >= 3 ? transferRef : 'Offline Box Office';

    const bookingCode = sanitizeOfflineBookingCode(rawCode, usedCodes);

    validBookings.push({
      bookingCode,
      userId: OFFLINE_USER_ID,
      concertId: concert.id,
      concertTitle: concert.title.slice(0, 120),
      concertDate: concert.date.slice(0, 40),
      concertTime: concert.time.slice(0, 20),
      concertVenue: concert.venue.slice(0, 140),
      tier,
      quantity: qtyNum,
      unitPrice,
      promoCode: '',
      discountEgp,
      totalEgp,
      paymentMethod: 'Offline',
      transferRef: safeTransferRef,
      paymentStatus,
      checkedIn,
      checkedInCount: checkedIn ? qtyNum : 0,
      checkedInAt: checkedIn ? 'Excel Import' : '',
      approvedBy: paymentStatus === 'Paid' ? adminName.trim().slice(0, 100) || 'Admin' : '',
      approvalMethod: paymentStatus === 'Paid' ? 'Excel Import' : '',
      customerName: cleanName,
      customerMobile: cleanMobile,
      customerEmail: cleanEmail,
    });

    totalTickets += qtyNum;
    if (paymentStatus === 'Paid') {
      paidTickets += qtyNum;
      totalRevenueEgp += totalEgp;
    }
  });

  return {
    validBookings,
    errors,
    totalTickets,
    paidTickets,
    totalRevenueEgp,
  };
}
