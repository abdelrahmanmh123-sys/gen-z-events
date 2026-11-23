import * as XLSX from 'xlsx';
import type { Booking, Concert } from '../types';
import { getTierUnitPrice, sanitizeSpreadsheetCell } from './bookingLogic';

export interface ParsedSpreadsheetFile {
  sheetName: string;
  rows: Record<string, unknown>[];
}

const MAX_SPREADSHEET_BYTES = 10 * 1024 * 1024; // 10 MB

export async function readSpreadsheetFile(file: File): Promise<ParsedSpreadsheetFile> {
  if (file.size > MAX_SPREADSHEET_BYTES) {
    throw new Error('Spreadsheet file is too large (max 10 MB).');
  }
  const lower = file.name.toLowerCase();
  if (!lower.endsWith('.xlsx') && !lower.endsWith('.xls') && !lower.endsWith('.csv')) {
    throw new Error('Please upload an Excel (.xlsx / .xls) or CSV (.csv) spreadsheet.');
  }

  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', raw: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error('The uploaded spreadsheet has no worksheets.');
  }
  const worksheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
    defval: '',
    raw: false,
  });

  if (rows.length === 0) {
    throw new Error('No data rows found in the first worksheet.');
  }
  if (rows.length > 2000) {
    throw new Error('Please split spreadsheets larger than 2,000 rows into smaller batches.');
  }

  return { sheetName, rows };
}

export function downloadOfflineTemplateXlsx(concert?: Concert): void {
  const silverPrice = concert ? getTierUnitPrice(concert, 'Silver') : 400;
  const vipPrice = concert ? getTierUnitPrice(concert, 'VIP') : 800;

  const sampleRows = [
    {
      'Customer Name': 'Ahmed Hassan',
      Mobile: '01012345678',
      Email: 'ahmed@example.com',
      Tier: 'Silver',
      Quantity: 2,
      'Total EGP': silverPrice * 2,
      Outlet: 'Qena Downtown Booth',
      Status: 'Paid',
      'Checked In': 'No',
      'Booking Code': '',
    },
    {
      'Customer Name': 'Mariam Adel',
      Mobile: '01123456789',
      Email: '',
      Tier: 'VIP',
      Quantity: 1,
      'Total EGP': vipPrice,
      Outlet: 'Campus Desk · Receipt #104',
      Status: 'Paid',
      'Checked In': 'No',
      'Booking Code': '',
    },
  ];

  const ws = XLSX.utils.json_to_sheet(sampleRows);
  ws['!cols'] = [
    { wch: 22 },
    { wch: 15 },
    { wch: 24 },
    { wch: 10 },
    { wch: 10 },
    { wch: 12 },
    { wch: 26 },
    { wch: 10 },
    { wch: 12 },
    { wch: 14 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Offline Tickets');
  XLSX.writeFile(wb, 'genz-events-offline-tickets-template.xlsx');
}

export function exportOfflineBookingsXlsx(bookings: Booking[], filename?: string): void {
  const exportRows = bookings.map((b) => ({
    'Booking Code': sanitizeSpreadsheetCell(b.bookingCode),
    Concert: sanitizeSpreadsheetCell(b.concertTitle),
    Date: sanitizeSpreadsheetCell(b.concertDate),
    'Customer Name': sanitizeSpreadsheetCell(b.customerName),
    Mobile: sanitizeSpreadsheetCell(b.customerMobile),
    Email: sanitizeSpreadsheetCell(b.customerEmail || ''),
    Tier: sanitizeSpreadsheetCell(b.tier),
    Quantity: b.quantity,
    'Unit Price EGP': b.unitPrice,
    'Total EGP': b.totalEgp,
    'Outlet / Ref': sanitizeSpreadsheetCell(b.transferRef),
    Status: sanitizeSpreadsheetCell(b.paymentStatus),
    'Checked In': b.checkedIn ? 'Yes' : 'No',
    'Logged By': sanitizeSpreadsheetCell(b.approvedBy || ''),
    Source: sanitizeSpreadsheetCell(b.approvalMethod || 'Offline'),
  }));

  const ws = XLSX.utils.json_to_sheet(exportRows);
  ws['!cols'] = [
    { wch: 14 },
    { wch: 24 },
    { wch: 18 },
    { wch: 22 },
    { wch: 15 },
    { wch: 24 },
    { wch: 10 },
    { wch: 10 },
    { wch: 14 },
    { wch: 12 },
    { wch: 24 },
    { wch: 10 },
    { wch: 12 },
    { wch: 18 },
    { wch: 16 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Offline Sales');
  const outName = filename || `genz-events-offline-tickets-${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, outName);
}
