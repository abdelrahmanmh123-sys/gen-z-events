import type { Booking, Concert } from '../../types';
import { getBookingCheckedInCount } from './rbacAndTickets';

export function sanitizeSpreadsheetCell(value: unknown): string {
  const str = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(str)) {
    return `'${str}`;
  }
  return str;
}

export function escapeCsvCell(val: unknown): string {
  let str = String(val ?? '');
  // Guard against spreadsheet formula injection while keeping single '-' placeholder intact
  if (str !== '-' && /^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function buildAttendeesCsv(bookings: Booking[]): string {
  const headers = [
    'Booking Code',
    'Concert',
    'Date',
    'Venue',
    'Tier',
    'Qty',
    'Total EGP',
    'Promo',
    'Payment Method',
    'Transfer Ref',
    'Payment Status',
    'Checked In',
    'Checked In At',
    'Approved By',
    'Approval Method',
    'Customer Name',
    'Mobile',
    'Email',
  ];
  const rows = bookings.map((b) =>
    [
      b.bookingCode,
      b.concertTitle,
      b.concertDate,
      b.concertVenue,
      b.tier,
      b.quantity,
      b.totalEgp,
      b.promoCode || '-',
      b.paymentMethod,
      b.transferRef,
      b.paymentStatus,
      (() => {
        const total = Math.max(1, Math.floor(b.quantity || 1));
        const count = getBookingCheckedInCount(b);
        if (total > 1) return count > 0 ? `${count}/${total}` : `0/${total}`;
        return count > 0 ? 'Yes' : 'No';
      })(),
      b.checkedInAt || '-',
      b.approvedBy || '-',
      b.approvalMethod || '-',
      b.customerName,
      b.customerMobile,
      b.customerEmail,
    ]
      .map(escapeCsvCell)
      .join(','),
  );
  return [headers.join(','), ...rows].join('\r\n');
}

export function buildCalendarIcs(booking: Booking, concert?: Concert): string {
  const rawDate = concert?.isoDate && /^\d{4}-\d{2}-\d{2}$/.test(concert.isoDate) ? concert.isoDate : '2026-12-04';
  const rawTime = concert?.isoTime && /^\d{2}:\d{2}$/.test(concert.isoTime) ? concert.isoTime : '20:00';
  const [y, m, d] = rawDate.split('-').map(Number);
  const [hh, mm] = rawTime.split(':').map(Number);
  const startDt = new Date(Date.UTC(y, m - 1, d, hh, mm, 0));
  const endDt = new Date(startDt.getTime() + 3 * 60 * 60 * 1000);

  const fmtStamp = (dt: Date) =>
    `${dt.getUTCFullYear()}${String(dt.getUTCMonth() + 1).padStart(2, '0')}${String(dt.getUTCDate()).padStart(2, '0')}T${String(dt.getUTCHours()).padStart(2, '0')}${String(dt.getUTCMinutes()).padStart(2, '0')}00`;

  const startStamp = fmtStamp(startDt);
  const endStamp = fmtStamp(endDt);

  const esc = (s: string) => s.replace(/[,;\\]/g, (m) => `\\${m}`).replace(/\n/g, '\\n');

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Gen Z Events Qena//Concert E-Pass//EN',
    'BEGIN:VEVENT',
    `UID:${booking.bookingCode}@genzevents.eg`,
    `DTSTART:${startStamp}`,
    `DTEND:${endStamp}`,
    `SUMMARY:${esc(`${booking.concertTitle} — ${booking.tier} Pass (${booking.quantity}x)`)}`,
    `LOCATION:${esc(`${booking.concertVenue}, Qena, Egypt`)}`,
    `DESCRIPTION:${esc(`Booking Code: ${booking.bookingCode} | Status: ${booking.paymentStatus} | Holder: ${booking.customerName}`)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}
