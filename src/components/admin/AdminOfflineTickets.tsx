import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Plus,
  RotateCcw,
  Search,
  Store,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { TICKET_TIERS } from '../../data/defaults';
import { formatFriendlyFirebaseError } from '../../firebase';
import {
  adminBulkImportOfflineBookings,
  adminConfirmPayment,
  adminCreateOfflineBooking,
  adminDecrementCheckIn,
  adminDeleteBooking,
  adminScanCheckIn,
  adminUndoPayment,
} from '../../services/firestoreService';
import type { Booking, Concert, TierId } from '../../types';
import {
  formatCheckInProgress,
  generateBookingCode,
  getBookingCheckedInCount,
  getTierColorHex,
  getTierUnitPrice,
  hexToRgba,
  MAX_OFFLINE_QTY_PER_ROW,
  normalizeOfflineMobile,
  OFFLINE_USER_ID,
  parseBoundedIntInput,
  parseOfflineTicketRows,
  toAsciiDigits,
  type ParsedOfflineBatchResult,
} from '../../utils/bookingLogic';
import {
  downloadOfflineTemplateXlsx,
  exportOfflineBookingsXlsx,
  readSpreadsheetFile,
} from '../../utils/excelOffline';
import { useLanguage } from '../../i18n/LanguageContext';
import {
  formatCurrencyEgp,
  getTierCopy,
  localizeKnownMessage,
} from '../../i18n/translations';
import { GoogleFormSyncPanel } from './GoogleFormSyncPanel';

interface AdminOfflineTicketsProps {
  concerts: Concert[];
  bookings: Booking[];
  adminName: string;
  adminEmail: string;
  canConfirmPayments: boolean;
  canUndoPayments: boolean;
  canDeleteBookings: boolean;
  canViewRevenueAnalytics: boolean;
  onNotify: (msg: string) => void;
}

export const AdminOfflineTickets: React.FC<AdminOfflineTicketsProps> = ({
  concerts,
  bookings,
  adminName,
  adminEmail,
  canConfirmPayments,
  canUndoPayments,
  canDeleteBookings,
  canViewRevenueAnalytics,
  onNotify,
}) => {
  const { lang, isAr, t } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Target concert for Excel import & manual entry
  const [selectedConcertId, setSelectedConcertId] = useState<string>(() => concerts[0]?.id || '');

  // Keep selectedConcertId valid when concerts list changes
  useEffect(() => {
    if (concerts.length === 0) {
      setSelectedConcertId('');
      return;
    }
    if (!concerts.some((c) => c.id === selectedConcertId)) {
      setSelectedConcertId(concerts[0].id);
    }
  }, [concerts, selectedConcertId]);

  const activeConcert = useMemo(
    () => concerts.find((c) => c.id === selectedConcertId) || concerts[0] || null,
    [concerts, selectedConcertId],
  );

  // Excel import staging state
  const [rawImportFile, setRawImportFile] = useState<{
    fileName: string;
    sheetName: string;
    rows: Record<string, unknown>[];
  } | null>(null);
  const [importConcertId, setImportConcertId] = useState<string>('');
  const [deductSeatsOnImport, setDeductSeatsOnImport] = useState(true);
  const [importBusy, setImportBusy] = useState(false);

  const importConcert = useMemo(
    () => concerts.find((c) => c.id === (importConcertId || selectedConcertId)) || activeConcert,
    [concerts, importConcertId, selectedConcertId, activeConcert],
  );

  const existingCodes = useMemo(
    () => new Set(bookings.map((b) => b.bookingCode.toUpperCase())),
    [bookings],
  );

  const parsedImport: ParsedOfflineBatchResult | null = useMemo(() => {
    if (!rawImportFile || !importConcert) return null;
    return parseOfflineTicketRows(rawImportFile.rows, importConcert, adminName, existingCodes);
  }, [rawImportFile, importConcert, adminName, existingCodes]);

  // Manual Offline Sale form state
  const [showManualForm, setShowManualForm] = useState(false);
  const [manualTier, setManualTier] = useState<TierId>('Silver');
  const [manualQty, setManualQty] = useState('1');
  const [manualAmount, setManualAmount] = useState('');
  const [manualName, setManualName] = useState('');
  const [manualMobile, setManualMobile] = useState('');
  const [manualEmail, setManualEmail] = useState('');
  const [manualOutlet, setManualOutlet] = useState('Box Office');
  const [manualCheckedIn, setManualCheckedIn] = useState(false);
  const [manualDeductSeats, setManualDeductSeats] = useState(true);
  const [manualBusy, setManualBusy] = useState(false);

  // Ledger filters & row actions
  const [searchQuery, setSearchQuery] = useState('');
  const [concertFilter, setConcertFilter] = useState<string>('all');
  const [busyCode, setBusyCode] = useState<string | null>(null);
  const [confirmDeleteCode, setConfirmDeleteCode] = useState<string | null>(null);
  const [confirmUndoPayCode, setConfirmUndoPayCode] = useState<string | null>(null);

  const offlineBookings = useMemo(
    () => bookings.filter((b) => b.paymentMethod === 'Offline'),
    [bookings],
  );

  const offlineKpis = useMemo(() => {
    const paid = offlineBookings.filter((b) => b.paymentStatus === 'Paid');
    return {
      orders: offlineBookings.length,
      ticketsSold: paid.reduce((sum, b) => sum + b.quantity, 0),
      revenueEgp: paid.reduce((sum, b) => sum + b.totalEgp, 0),
      checkedIn: offlineBookings.reduce((sum, b) => sum + getBookingCheckedInCount(b), 0),
    };
  }, [offlineBookings]);

  const filteredOffline = useMemo(() => {
    const q = toAsciiDigits(searchQuery).trim().toLowerCase();
    return offlineBookings.filter((b) => {
      if (concertFilter !== 'all' && b.concertId !== concertFilter) return false;
      if (q) {
        const hay = toAsciiDigits(
          `${b.bookingCode} ${b.customerName} ${b.customerMobile} ${b.customerEmail} ${b.concertTitle} ${b.transferRef} ${b.tier}`,
        ).toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [offlineBookings, searchQuery, concertFilter]);

  const manualExpectedTotal = useMemo(() => {
    if (!activeConcert) return 0;
    const qty = parseBoundedIntInput(manualQty, 1, MAX_OFFLINE_QTY_PER_ROW);
    return getTierUnitPrice(activeConcert, manualTier) * (qty.valid ? qty.value : 1);
  }, [activeConcert, manualTier, manualQty]);

  const handleSelectExcelFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!activeConcert) {
      onNotify(t.scheduleConcertFirstWarn);
      return;
    }
    try {
      const parsed = await readSpreadsheetFile(file);
      setRawImportFile({
        fileName: file.name,
        sheetName: parsed.sheetName,
        rows: parsed.rows,
      });
      setImportConcertId(activeConcert.id);
      onNotify(
        isAr
          ? `تم تحميل ${parsed.rows.length} صفاً من الملف «${file.name}» للمراجعة.`
          : `Loaded ${parsed.rows.length} row(s) from "${file.name}" for review.`,
      );
    } catch (err) {
      onNotify(
        err instanceof Error
          ? err.message
          : isAr
            ? 'تعذر قراءة ملف الإكسل.'
            : 'Failed to read spreadsheet file.',
      );
    }
  };

  const handleConfirmExcelImport = async () => {
    if (!parsedImport || !importConcert || parsedImport.validBookings.length === 0) return;
    setImportBusy(true);
    try {
      const res = await adminBulkImportOfflineBookings(
        importConcert.id,
        parsedImport.validBookings,
        deductSeatsOnImport,
      );
      setRawImportFile(null);
      const dupSuffix =
        res.skippedDuplicateCount > 0
          ? isAr
            ? ` (تم تخطي ${res.skippedDuplicateCount} سجل مكرر)`
            : ` (${res.skippedDuplicateCount} duplicate skipped)`
          : '';
      const revPart = canViewRevenueAnalytics
        ? ` · ${formatCurrencyEgp(res.importedRevenueEgp, lang)}`
        : '';
      onNotify(
        isAr
          ? `تم استيراد ${res.importedCount} عملية أوفلاين (${res.importedTickets.toLocaleString()} تذكرة${revPart})${dupSuffix}.`
          : `Imported ${res.importedCount} offline sale(s) (${res.importedTickets.toLocaleString()} tickets${revPart})${dupSuffix}.`,
      );
    } catch (err) {
      onNotify(localizeKnownMessage(formatFriendlyFirebaseError(err), lang));
    } finally {
      setImportBusy(false);
    }
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (manualBusy) return;
    if (!activeConcert) {
      onNotify(isAr ? 'يرجى اختيار الحفل أولاً.' : 'Please select a concert first.');
      return;
    }
    const cleanName = manualName.trim().replace(/\s+/g, ' ').slice(0, 100);
    if (cleanName.length < 2) {
      onNotify(isAr ? 'أدخل اسم المشتري (حرفين على الأقل).' : 'Enter the buyer name (at least 2 characters).');
      return;
    }
    const cleanMobile = normalizeOfflineMobile(manualMobile);
    if (cleanMobile.length < 6) {
      onNotify(
        isAr
          ? 'أدخل رقم موبايل صحيح للمشتري (٦ أرقام على الأقل).'
          : 'Enter a valid buyer mobile number (at least 6 digits).',
      );
      return;
    }
    const qtyParsed = parseBoundedIntInput(manualQty, 1, MAX_OFFLINE_QTY_PER_ROW);
    if (!qtyParsed.valid) {
      onNotify(
        isAr
          ? `يجب أن يكون العدد رقماً صحيحاً بين ١ و ${MAX_OFFLINE_QTY_PER_ROW}.`
          : `Quantity must be a whole number between 1 and ${MAX_OFFLINE_QTY_PER_ROW}.`,
      );
      return;
    }
    const unitPrice = getTierUnitPrice(activeConcert, manualTier);
    const expectedSubtotal = unitPrice * qtyParsed.value;
    let totalEgp = expectedSubtotal;
    if (manualAmount.trim() !== '') {
      const amtParsed = parseBoundedIntInput(manualAmount, 0, 50000000);
      if (!amtParsed.valid) {
        onNotify(
          isAr ? 'الإجمالي المخصص يجب أن يكون رقماً صحيحاً.' : 'Custom total EGP must be a valid whole number.',
        );
        return;
      }
      totalEgp = amtParsed.value;
    }
    const discountEgp = Math.max(0, expectedSubtotal - totalEgp);
    const cleanOutlet = manualOutlet.trim().replace(/\s+/g, ' ').slice(0, 80);
    const safeTransferRef = cleanOutlet.length >= 3 ? cleanOutlet : 'Offline Box Office';

    let code = generateBookingCode();
    while (existingCodes.has(code)) {
      code = generateBookingCode();
    }

    setManualBusy(true);
    try {
      await adminCreateOfflineBooking(
        {
          bookingCode: code,
          userId: OFFLINE_USER_ID,
          concertId: activeConcert.id,
          concertTitle: activeConcert.title.slice(0, 120),
          concertDate: activeConcert.date.slice(0, 40),
          concertTime: activeConcert.time.slice(0, 20),
          concertVenue: activeConcert.venue.slice(0, 140),
          tier: manualTier,
          quantity: qtyParsed.value,
          unitPrice,
          promoCode: '',
          discountEgp,
          totalEgp,
          paymentMethod: 'Offline',
          transferRef: safeTransferRef,
          paymentStatus: 'Paid',
          checkedIn: manualCheckedIn,
          checkedInCount: manualCheckedIn ? qtyParsed.value : 0,
          checkedInAt: manualCheckedIn
            ? new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
            : '',
          approvedBy: adminName.trim().slice(0, 100) || 'Admin',
          approvalMethod: 'Offline Desk',
          customerName: cleanName,
          customerMobile: cleanMobile,
          customerEmail: manualEmail.trim().toLowerCase().slice(0, 120),
        },
        manualDeductSeats,
      );
      setManualName('');
      setManualMobile('');
      setManualEmail('');
      setManualQty('1');
      setManualAmount('');
      setManualCheckedIn(false);
      const tierLabel = getTierCopy(manualTier, lang).name;
      onNotify(
        isAr
          ? `تم تسجيل البيع الأوفلاين ${code} (${qtyParsed.value}x ${tierLabel}).`
          : `Recorded offline sale ${code} (${qtyParsed.value}x ${tierLabel}).`,
      );
    } catch (err) {
      onNotify(localizeKnownMessage(formatFriendlyFirebaseError(err), lang));
    } finally {
      setManualBusy(false);
    }
  };

  const handleRosterCheckInAction = async (b: Booking, direction: 'admit' | 'undo') => {
    if (b.paymentStatus !== 'Paid') return;
    setBusyCode(b.bookingCode);
    try {
      if (direction === 'admit') {
        const res = await adminScanCheckIn(b, adminName, 'Offline Roster');
        const counterSuffix =
          res.quantity > 1 ? ` ${formatCheckInProgress(res.checkedInCount, res.quantity)}` : '';
        onNotify(
          isAr
            ? `تم تسجيل دخول ${b.bookingCode}${counterSuffix}.`
            : `Checked in ${b.bookingCode}${counterSuffix}.`,
        );
      } else {
        const res = await adminDecrementCheckIn(b, adminName, 'Offline Roster');
        const counterSuffix =
          res.quantity > 1 ? ` ${formatCheckInProgress(res.checkedInCount, res.quantity)}` : '';
        onNotify(
          isAr
            ? `تم التراجع عن تسجيل دخول ${b.bookingCode}${counterSuffix}.`
            : `Reverted check-in for ${b.bookingCode}${counterSuffix}.`,
        );
      }
    } catch (err) {
      onNotify(localizeKnownMessage(formatFriendlyFirebaseError(err), lang));
    } finally {
      setBusyCode(null);
    }
  };

  const handleConfirmOfflinePay = async (b: Booking) => {
    if (!canConfirmPayments) return;
    setBusyCode(b.bookingCode);
    try {
      await adminConfirmPayment(b, adminName, 'Offline Desk Confirm');
      onNotify(
        isAr
          ? `تم تأكيد الدفع للسجل الأوفلاين ${b.bookingCode}.`
          : `Confirmed payment for offline record ${b.bookingCode}.`,
      );
    } catch (err) {
      onNotify(localizeKnownMessage(formatFriendlyFirebaseError(err), lang));
    } finally {
      setBusyCode(null);
    }
  };

  const handleUndoOfflinePay = async (b: Booking) => {
    if (!canUndoPayments) return;
    setBusyCode(b.bookingCode);
    try {
      const reverted = await adminUndoPayment(b);
      setConfirmUndoPayCode(null);
      if (!reverted) {
        onNotify(
          isAr
            ? `السجل ${b.bookingCode} بالفعل بانتظار تأكيد الدفع.`
            : `Record ${b.bookingCode} is already pending payment.`,
        );
        return;
      }
      onNotify(
        isAr
          ? `تم التراجع عن تأكيد الدفع للسجل ${b.bookingCode} مع الاحتفاظ بالتذكرة.`
          : `Payment confirmation undone for ${b.bookingCode} while keeping the record.`,
      );
    } catch (err) {
      onNotify(localizeKnownMessage(formatFriendlyFirebaseError(err), lang));
    } finally {
      setBusyCode(null);
    }
  };

  const handleDeleteOffline = async (b: Booking) => {
    if (!canDeleteBookings) return;
    setBusyCode(b.bookingCode);
    try {
      await adminDeleteBooking(b);
      setConfirmDeleteCode(null);
      onNotify(
        isAr
          ? `تم حذف السجل الأوفلاين ${b.bookingCode} واستعادة المقاعد.`
          : `Deleted offline record ${b.bookingCode} and restored seats.`,
      );
    } catch (err) {
      onNotify(localizeKnownMessage(formatFriendlyFirebaseError(err), lang));
    } finally {
      setBusyCode(null);
    }
  };

  const concertMap = useMemo(() => new Map(concerts.map((c) => [c.id, c])), [concerts]);

  return (
    <div className="space-y-6">
      {/* Top Header & Primary Excel Import Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="font-display font-bold text-xl text-white">{t.offlineTitle}</h2>
          <p className="text-xs text-slate-400">{t.offlineSubtitle}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
            onChange={(e) => void handleSelectExcelFile(e)}
            className="sr-only"
            aria-label={t.importExcelFile}
          />

          <button
            type="button"
            disabled={concerts.length === 0}
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white hover:bg-neutral-200 disabled:opacity-50 text-xs font-semibold text-[#08090C] transition-colors"
          >
            <Upload className="w-3.5 h-3.5" />
            {t.importExcelFile}
          </button>

          <button
            type="button"
            onClick={() => {
              downloadOfflineTemplateXlsx(activeConcert || undefined);
              onNotify(
                isAr ? 'تم تحميل نموذج الإكسل (.xlsx).' : 'Downloaded Excel import template (.xlsx).',
              );
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-white/15 bg-white/[0.04] hover:bg-white/[0.08] text-xs font-semibold text-white transition-colors"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
            {t.downloadTemplate}
          </button>

          <button
            type="button"
            disabled={concerts.length === 0}
            onClick={() => setShowManualForm((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-white/15 bg-white/[0.04] hover:bg-white/[0.08] disabled:opacity-50 text-xs font-semibold text-white transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            {showManualForm ? t.hideManualEntry : t.addSingleSale}
          </button>

          {offlineBookings.length > 0 && (
            <button
              type="button"
              onClick={() => {
                exportOfflineBookingsXlsx(filteredOffline);
                onNotify(
                  isAr
                    ? `تم تصدير ${filteredOffline.length} سجل أوفلاين إلى ملف إكسل (.xlsx).`
                    : `Exported ${filteredOffline.length} offline ticket rows to Excel (.xlsx).`,
                );
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              {t.exportExcel} ({filteredOffline.length})
            </button>
          )}
        </div>
      </div>

      {/* Offline KPI Strip */}
      <div className={`grid grid-cols-2 ${canViewRevenueAnalytics ? 'lg:grid-cols-4' : 'lg:grid-cols-3'} gap-3`}>
        {[
          { label: t.kpiOfflineOrders, value: offlineKpis.orders.toLocaleString(), tone: 'text-white', isPrice: false },
          { label: t.kpiOfflineTickets, value: offlineKpis.ticketsSold.toLocaleString(), tone: 'text-amber-300', isPrice: false },
          ...(canViewRevenueAnalytics
            ? [{ label: t.kpiOfflineRevenue, value: formatCurrencyEgp(offlineKpis.revenueEgp, lang), tone: 'text-white', isPrice: true }]
            : []),
          { label: t.kpiOfflineCheckedIn, value: offlineKpis.checkedIn.toLocaleString(), tone: 'text-emerald-400', isPrice: false },
        ].map((item) => (
          <div
            key={item.label}
            className="bg-[#101218] border border-white/10 rounded-xl px-4 py-3.5"
          >
            <p className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
              {item.label}
            </p>
            <p
              className={`${
                item.isPrice
                  ? 'font-modern-price tracking-tight rtl:tracking-normal'
                  : 'font-mono-num'
              } text-lg font-bold mt-1 ${item.tone}`}
            >
              {item.value}
            </p>
          </div>
        ))}
      </div>

      {concerts.length === 0 && (
        <div className="p-4 rounded-xl border border-amber-400/30 bg-amber-400/10 text-xs text-amber-100 flex items-center gap-2.5">
          <AlertCircle className="w-4 h-4 text-amber-300 shrink-0" />
          <span>{t.scheduleConcertFirstWarn}</span>
        </div>
      )}

      {/* Bound Google Form Live Offline Ticket Sync */}
      <GoogleFormSyncPanel
        concerts={concerts}
        activeConcert={activeConcert}
        selectedConcertId={selectedConcertId}
        onSelectConcertId={setSelectedConcertId}
        existingCodes={existingCodes}
        adminName={adminName}
        adminEmail={adminEmail}
        canViewRevenueAnalytics={canViewRevenueAnalytics}
        onNotify={onNotify}
      />

      {/* Excel Import Preview & Confirmation Panel */}
      {rawImportFile && parsedImport && importConcert && (
        <div className="bg-[#101218] border border-white/20 rounded-xl p-5 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                <h3 className="font-display font-bold text-base text-white">
                  {t.excelPreviewTitle} · <span dir="ltr">{rawImportFile.fileName}</span>
                </h3>
              </div>
              <p className="text-xs text-slate-400">
                {t.worksheetLabel} &quot;{rawImportFile.sheetName}&quot; · {t.reviewParsedHint}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setRawImportFile(null)}
              aria-label={t.cancel}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-lg bg-[#08090C] border border-white/10">
            <div>
              <label htmlFor="imp-concert" className="block text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-1.5">
                {t.assignImportedConcert}
              </label>
              <select
                id="imp-concert"
                value={importConcert.id}
                onChange={(e) => setImportConcertId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[#101218] border border-white/15 text-xs text-white focus:outline-none focus:border-white/50"
              >
                {concerts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title} ({c.seatsLeft.toLocaleString()} {t.seatsLeftWord})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-end">
              <label className="inline-flex items-center gap-2.5 text-xs text-slate-200 cursor-pointer py-2">
                <input
                  type="checkbox"
                  checked={deductSeatsOnImport}
                  onChange={(e) => setDeductSeatsOnImport(e.target.checked)}
                  className="w-4 h-4 rounded border-white/25 bg-[#101218] accent-white"
                />
                <span>
                  {t.deductImportedPrefix} ({parsedImport.paidTickets.toLocaleString()}){' '}
                  {t.deductImportedSuffix}
                </span>
              </label>
            </div>
          </div>

          {/* Summary Badges */}
          <div className="flex flex-wrap items-center gap-4 text-xs">
            <span className="inline-flex items-center gap-1.5 text-emerald-300 font-semibold">
              <CheckCircle2 className="w-3.5 h-3.5" />
              {parsedImport.validBookings.length} {t.validRowsWord} ·{' '}
              {parsedImport.totalTickets.toLocaleString()} {t.ticketsLower} ·{' '}
              <span className="font-modern-price font-bold">
                {formatCurrencyEgp(parsedImport.totalRevenueEgp, lang)}
              </span>
            </span>
            {parsedImport.errors.length > 0 && (
              <span className="inline-flex items-center gap-1.5 text-rose-300 font-semibold">
                <AlertCircle className="w-3.5 h-3.5" />
                {parsedImport.errors.length} {t.skippedRowsWord}
              </span>
            )}
          </div>

          {parsedImport.errors.length > 0 && (
            <div className="p-3 rounded-lg border border-rose-500/35 bg-rose-500/10 space-y-1 max-h-32 overflow-y-auto">
              {parsedImport.errors.slice(0, 20).map((err) => (
                <p key={`${err.rowNumber}-${err.reason}`} className="text-[11px] text-rose-200">
                  <span className="font-mono-num font-bold">
                    {t.rowWord} {err.rowNumber}:
                  </span>{' '}
                  {err.reason}
                </p>
              ))}
              {parsedImport.errors.length > 20 && (
                <p className="text-[11px] text-rose-300">
                  + {parsedImport.errors.length - 20} {t.moreSkippedRows}
                </p>
              )}
            </div>
          )}

          {parsedImport.validBookings.length > 0 && (
            <div className="border border-white/10 rounded-lg overflow-hidden">
              <div className="overflow-x-auto max-h-60">
                <table className="w-full text-start text-xs">
                  <thead className="bg-[#0B0D12] text-slate-400 uppercase tracking-wider text-[10px] sticky top-0">
                    <tr>
                      <th className="px-3 py-2.5 text-start">{t.colCode}</th>
                      <th className="px-3 py-2.5 text-start">{t.colBuyer}</th>
                      <th className="px-3 py-2.5 text-start">{t.colCategory}</th>
                      <th className="px-3 py-2.5 text-start">{t.colQty}</th>
                      <th className="px-3 py-2.5 text-start">{t.colTotal}</th>
                      <th className="px-3 py-2.5 text-start">{t.colOutletRef}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/8">
                    {parsedImport.validBookings.slice(0, 50).map((b) => {
                      const tierHex = getTierColorHex(importConcert, b.tier);
                      return (
                        <tr key={b.bookingCode}>
                          <td className="px-3 py-2 font-mono-num font-semibold text-white" dir="ltr">
                            {b.bookingCode}
                          </td>
                          <td className="px-3 py-2">
                            <span className="text-white font-medium">{b.customerName}</span>
                            <span className="block text-[11px] font-mono-num text-slate-400" dir="ltr">
                              {b.customerMobile}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <span className="inline-flex items-center gap-1.5 font-semibold" style={{ color: tierHex }}>
                              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: tierHex }} />
                              {getTierCopy(b.tier, lang).name}
                            </span>
                          </td>
                          <td className="px-3 py-2 font-mono-num text-white">{b.quantity}</td>
                          <td className="px-3 py-2 font-modern-price font-semibold text-white">
                            {formatCurrencyEgp(b.totalEgp, lang)}
                          </td>
                          <td className="px-3 py-2 text-slate-300">{b.transferRef}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {parsedImport.validBookings.length > 50 && (
                <div className="px-3 py-2 bg-[#0B0D12] border-t border-white/8 text-[11px] text-slate-400">
                  {t.showingFirst50Prefix} {parsedImport.validBookings.length} {t.showingFirst50Suffix}
                </div>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => setRawImportFile(null)}
              className="px-4 py-2 rounded-lg border border-white/12 text-xs font-medium text-slate-300 hover:text-white"
            >
              {t.cancel}
            </button>
            <button
              type="button"
              disabled={importBusy || parsedImport.validBookings.length === 0}
              onClick={() => void handleConfirmExcelImport()}
              className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-white hover:bg-neutral-200 disabled:opacity-50 text-xs font-semibold text-[#08090C] transition-colors"
            >
              <Upload className="w-3.5 h-3.5" />
              {importBusy
                ? t.importingFirestore
                : `${t.confirmAndImport} ${parsedImport.validBookings.length} ${
                    parsedImport.validBookings.length === 1 ? t.recordWord : t.recordsPlural
                  }`}
            </button>
          </div>
        </div>
      )}

      {/* Manual Single Offline Sale Form */}
      {showManualForm && activeConcert && (
        <form
          onSubmit={handleManualSubmit}
          className="bg-[#101218] border border-white/12 rounded-xl p-5 space-y-4"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Store className="w-4 h-4 text-white" />
              <h3 className="font-display font-bold text-base text-white">{t.logSingleOfflineTitle}</h3>
            </div>
            <button
              type="button"
              onClick={() => setShowManualForm(false)}
              aria-label={t.close}
              className="p-1 text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label htmlFor="off-concert" className="block text-xs font-medium text-slate-300 mb-1">
                {t.colConcert}
              </label>
              <select
                id="off-concert"
                value={activeConcert.id}
                onChange={(e) => setSelectedConcertId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[#08090C] border border-white/12 text-xs text-white"
              >
                {concerts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="off-tier" className="block text-xs font-medium text-slate-300 mb-1">
                {t.ticketCategoryLabel}
              </label>
              <select
                id="off-tier"
                value={manualTier}
                onChange={(e) => setManualTier(e.target.value as TierId)}
                className="w-full px-3 py-2 rounded-lg bg-[#08090C] border border-white/12 text-xs text-white"
              >
                {TICKET_TIERS.map((tier) => (
                  <option key={tier.id} value={tier.id}>
                    {getTierCopy(tier.id, lang).name} (
                    {formatCurrencyEgp(getTierUnitPrice(activeConcert, tier.id), lang)})
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="off-qty" className="block text-xs font-medium text-slate-300 mb-1">
                  {t.colQty}
                </label>
                <input
                  id="off-qty"
                  type="number"
                  min={1}
                  max={MAX_OFFLINE_QTY_PER_ROW}
                  required
                  value={manualQty}
                  onChange={(e) => setManualQty(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[#08090C] border border-white/12 text-xs text-white font-mono-num"
                />
              </div>
              <div>
                <label htmlFor="off-amount" className="block text-xs font-medium text-slate-300 mb-1">
                  {t.totalEgpAuto} ({t.autoPrefix}:{' '}
                  <span className="font-modern-price font-semibold text-white">
                    {manualExpectedTotal.toLocaleString()}
                  </span>
                  )
                </label>
                <input
                  id="off-amount"
                  type="number"
                  min={0}
                  max={50000000}
                  value={manualAmount}
                  onChange={(e) => setManualAmount(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[#08090C] border border-white/12 text-xs text-white font-modern-price"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label htmlFor="off-name" className="block text-xs font-medium text-slate-300 mb-1">
                {t.buyerFullName}
              </label>
              <input
                id="off-name"
                type="text"
                required
                maxLength={100}
                value={manualName}
                onChange={(e) => setManualName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[#08090C] border border-white/12 text-xs text-white"
              />
            </div>
            <div>
              <label htmlFor="off-mobile" className="block text-xs font-medium text-slate-300 mb-1">
                {t.mobileNumber}
              </label>
              <input
                id="off-mobile"
                type="tel"
                dir="ltr"
                required
                maxLength={30}
                value={manualMobile}
                onChange={(e) => setManualMobile(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[#08090C] border border-white/12 text-xs text-white font-mono-num"
              />
            </div>
            <div>
              <label htmlFor="off-email" className="block text-xs font-medium text-slate-300 mb-1">
                {t.emailOptional}
              </label>
              <input
                id="off-email"
                type="email"
                dir="ltr"
                maxLength={120}
                value={manualEmail}
                onChange={(e) => setManualEmail(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[#08090C] border border-white/12 text-xs text-white"
              />
            </div>
            <div>
              <label htmlFor="off-outlet" className="block text-xs font-medium text-slate-300 mb-1">
                {t.outletSellerReceipt}
              </label>
              <input
                id="off-outlet"
                type="text"
                maxLength={80}
                value={manualOutlet}
                onChange={(e) => setManualOutlet(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[#08090C] border border-white/12 text-xs text-white"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="flex flex-wrap items-center gap-5 text-xs text-slate-300">
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={manualDeductSeats}
                  onChange={(e) => setManualDeductSeats(e.target.checked)}
                  className="w-3.5 h-3.5 accent-white"
                />
                {t.deductFromSeats}
              </label>
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={manualCheckedIn}
                  onChange={(e) => setManualCheckedIn(e.target.checked)}
                  className="w-3.5 h-3.5 accent-white"
                />
                {t.markAlreadyCheckedIn}
              </label>
            </div>
            <button
              type="submit"
              disabled={manualBusy}
              className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-white hover:bg-neutral-200 disabled:opacity-50 text-xs font-semibold text-[#08090C] transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              {manualBusy ? t.saving : t.saveOfflineSale}
            </button>
          </div>
        </form>
      )}

      {/* Offline Sales Data Table */}
      <div className="bg-[#101218] border border-white/10 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-500 absolute start-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              aria-label={t.searchOfflinePlaceholder}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t.searchOfflinePlaceholder}
              className="w-full ps-9 pe-3 py-2 rounded-lg bg-[#08090C] border border-white/12 text-xs text-white focus:outline-none focus:border-white/50"
            />
          </div>

          <select
            aria-label={t.allConcerts}
            value={concertFilter}
            onChange={(e) => setConcertFilter(e.target.value)}
            className="px-3 py-2 rounded-lg bg-[#08090C] border border-white/12 text-xs text-white focus:outline-none focus:border-white/50"
          >
            <option value="all">
              {t.allConcerts} ({offlineBookings.length})
            </option>
            {concerts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-start text-xs">
            <thead className="bg-[#0B0D12] text-slate-400 uppercase tracking-wider text-[10px]">
              <tr>
                <th className="px-4 py-3 text-start">{t.colCode}</th>
                <th className="px-4 py-3 text-start">{t.colBuyer}</th>
                <th className="px-4 py-3 text-start">{t.colConcertCategory}</th>
                <th className="px-4 py-3 text-start">{t.colOutletSource}</th>
                <th className="px-4 py-3 text-end">{t.colActions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/8">
              {filteredOffline.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center space-y-2">
                    <p className="text-slate-300 font-medium">
                      {offlineBookings.length === 0 ? t.noOfflineRecorded : t.noOfflineFilterMatch}
                    </p>
                    {offlineBookings.length === 0 && (
                      <p className="text-[11px] text-slate-500">{t.offlineEmptyGuide}</p>
                    )}
                  </td>
                </tr>
              ) : (
                filteredOffline.map((b) => {
                  const show = concertMap.get(b.concertId);
                  const tierHex = getTierColorHex(show, b.tier);
                  return (
                    <tr key={b.bookingCode} className="hover:bg-white/[0.02]">
                      <td className="px-4 py-3 font-mono-num font-bold text-white whitespace-nowrap" dir="ltr">
                        {b.bookingCode}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-white">{b.customerName}</p>
                        <p className="text-[11px] font-mono-num text-slate-400" dir="ltr">
                          {b.customerMobile}
                          {b.customerEmail ? ` · ${b.customerEmail}` : ''}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-slate-200">{b.concertTitle}</p>
                        <div className="flex items-center gap-2 mt-0.5 text-[11px]">
                          <span
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-semibold border"
                            style={{
                              color: tierHex,
                              borderColor: hexToRgba(tierHex, 0.4),
                              backgroundColor: hexToRgba(tierHex, 0.1),
                            }}
                          >
                            {b.quantity}x {getTierCopy(b.tier, lang).name}
                          </span>
                          <span className="font-modern-price font-semibold text-slate-200">
                            {formatCurrencyEgp(b.totalEgp, lang)}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-slate-200">{b.transferRef}</p>
                        <p className="text-[11px] text-slate-500">
                          {b.approvalMethod || t.filterOffline} · {b.approvedBy || 'Staff'}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-end whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          {b.paymentStatus !== 'Paid' ? (
                            canConfirmPayments ? (
                              <button
                                type="button"
                                disabled={busyCode === b.bookingCode}
                                onClick={() => void handleConfirmOfflinePay(b)}
                                className="px-2.5 py-1.5 rounded-md bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 text-amber-200 font-semibold"
                              >
                                {t.confirmPay}
                              </button>
                            ) : (
                              <span className="px-2.5 py-1.5 rounded-md border border-amber-400/25 bg-amber-400/5 text-[11px] font-medium text-amber-200/80">
                                {t.awaitingSuperAdmin}
                              </span>
                            )
                          ) : (() => {
                            const total = Math.max(1, Math.floor(b.quantity || 1));
                            const scanned = getBookingCheckedInCount(b);
                            const isFull = scanned >= total;
                            const isPartial = scanned > 0 && !isFull;
                            const counter = total > 1 ? ` ${formatCheckInProgress(scanned, total)}` : '';
                            return (
                              <>
                                <button
                                  type="button"
                                  disabled={busyCode === b.bookingCode}
                                  onClick={() =>
                                    void handleRosterCheckInAction(b, isFull ? 'undo' : 'admit')
                                  }
                                  className={`px-2.5 py-1.5 rounded-md font-semibold border ${
                                    isFull
                                      ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                                      : isPartial
                                        ? 'bg-cyan-500/15 border-cyan-400/40 text-cyan-200 hover:bg-cyan-500/25'
                                        : 'bg-white/[0.06] border-white/15 text-white hover:bg-white/[0.12]'
                                  }`}
                                >
                                  {isFull ? t.statusCheckedIn : t.checkInBtn}
                                  {counter && (
                                    <span className="font-mono-num" dir="ltr">
                                      {counter}
                                    </span>
                                  )}
                                </button>
                                {isPartial && (
                                  <button
                                    type="button"
                                    disabled={busyCode === b.bookingCode}
                                    onClick={() => void handleRosterCheckInAction(b, 'undo')}
                                    aria-label={`${t.undoOneScanAria} (${b.bookingCode})`}
                                    title={t.undoOneScanAria}
                                    className="px-2 py-1.5 rounded-md border border-white/12 bg-white/[0.04] hover:bg-white/[0.1] text-slate-300 hover:text-white font-mono-num text-[11px]"
                                    dir="ltr"
                                  >
                                    -1
                                  </button>
                                )}
                                {canUndoPayments &&
                                  (confirmUndoPayCode === b.bookingCode ? (
                                    <span className="inline-flex items-center gap-1">
                                      <button
                                        type="button"
                                        disabled={busyCode === b.bookingCode}
                                        onClick={() => void handleUndoOfflinePay(b)}
                                        className="px-2 py-1.5 rounded-md bg-amber-400 hover:bg-amber-300 disabled:opacity-60 text-[#1A1202] font-semibold"
                                      >
                                        {t.undoPayConfirm}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setConfirmUndoPayCode(null)}
                                        aria-label={t.cancelUndoPayAria}
                                        className="p-1.5 rounded-md text-slate-400 hover:text-white"
                                      >
                                        <X className="w-3.5 h-3.5" />
                                      </button>
                                    </span>
                                  ) : (
                                    <button
                                      type="button"
                                      disabled={busyCode === b.bookingCode}
                                      onClick={() => {
                                        setConfirmDeleteCode(null);
                                        setConfirmUndoPayCode(b.bookingCode);
                                      }}
                                      aria-label={`${t.undoPayAria} (${b.bookingCode})`}
                                      title={t.undoPayAria}
                                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-amber-400/35 bg-amber-400/10 hover:bg-amber-400/20 disabled:opacity-60 text-amber-200 font-semibold transition-colors"
                                    >
                                      <RotateCcw className="w-3 h-3" />
                                      {t.undoPay}
                                    </button>
                                  ))}
                              </>
                            );
                          })()}

                          {canDeleteBookings &&
                            (confirmDeleteCode === b.bookingCode ? (
                              <span className="inline-flex items-center gap-1">
                                <button
                                  type="button"
                                  disabled={busyCode === b.bookingCode}
                                  onClick={() => void handleDeleteOffline(b)}
                                  className="px-2 py-1.5 rounded-md bg-rose-600 text-white font-semibold"
                                >
                                  {t.sureBtn}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteCode(null)}
                                  aria-label={t.cancelDeleteAria}
                                  className="p-1.5 rounded-md text-slate-400 hover:text-white"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setConfirmUndoPayCode(null);
                                  setConfirmDeleteCode(b.bookingCode);
                                }}
                                aria-label={isAr ? `حذف ${b.bookingCode}` : `Delete ${b.bookingCode}`}
                                className="p-1.5 rounded-md text-slate-400 hover:text-rose-400 hover:bg-rose-500/10"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            ))}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
