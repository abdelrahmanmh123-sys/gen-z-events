import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Download,
  FileSpreadsheet,
  Plus,
  Upload,
} from 'lucide-react';
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
import type { AdminRole, Booking, Concert, TierId } from '../../types';
import {
  formatCheckInProgress,
  generateBookingCode,
  getBookingCheckedInCount,
  getTierUnitPrice,
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
import { OfflineExcelPreviewPanel } from './OfflineExcelPreviewPanel';
import { OfflineManualSaleForm } from './OfflineManualSaleForm';
import { OfflineSalesLedger } from './OfflineSalesLedger';

interface AdminOfflineTicketsProps {
  concerts: Concert[];
  bookings: Booking[];
  adminName: string;
  adminEmail: string;
  adminRole: AdminRole;
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
  adminRole,
  canConfirmPayments,
  canUndoPayments,
  canDeleteBookings,
  canViewRevenueAnalytics,
  onNotify,
}) => {
  const actor = useMemo(() => ({ name: adminName, role: adminRole }), [adminName, adminRole]);
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
          ? localizeKnownMessage(err.message, lang)
          : isAr
            ? 'تعذر قراءة ملف الإكسل.'
            : 'Failed to read spreadsheet file.',
      );
    }
  };

  const handleConfirmExcelImport = async () => {
    if (importBusy || !parsedImport || !importConcert || parsedImport.validBookings.length === 0) return;
    setImportBusy(true);
    try {
      const res = await adminBulkImportOfflineBookings(
        importConcert.id,
        parsedImport.validBookings,
        deductSeatsOnImport,
        {
          actor,
          sourceLabel: rawImportFile?.fileName ? `Excel (${rawImportFile.fileName})` : 'Excel Import',
          concertTitle: importConcert.title,
        },
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
        actor,
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
    if (b.paymentStatus !== 'Paid' || busyCode === b.bookingCode) return;
    setBusyCode(b.bookingCode);
    try {
      if (direction === 'admit') {
        const res = await adminScanCheckIn(b, adminName, 'Offline Roster', actor);
        const counterSuffix =
          res.quantity > 1 ? ` ${formatCheckInProgress(res.checkedInCount, res.quantity)}` : '';
        onNotify(
          isAr
            ? `تم تسجيل دخول ${b.bookingCode}${counterSuffix}.`
            : `Checked in ${b.bookingCode}${counterSuffix}.`,
        );
      } else {
        const res = await adminDecrementCheckIn(b, adminName, 'Offline Roster', actor);
        const counterSuffix =
          res.quantity > 1 ? ` ${formatCheckInProgress(res.checkedInCount, res.quantity)}` : '';
        onNotify(
          isAr
            ? `تم التراجع عن تسجيل دخول ${b.bookingCode}${counterSuffix}.`
            : `Reverted check-in for ${b.bookingCode}${counterSuffix}.`,
        );
      }
    } catch (err) {
      const rawMsg = err instanceof Error ? err.message : '';
      if (rawMsg.startsWith('ALREADY_CHECKED_IN|')) {
        onNotify(
          isAr
            ? `التذكرة ${b.bookingCode} تم استخدامها بالكامل بالفعل.`
            : `Ticket ${b.bookingCode} is already fully checked in.`,
        );
      } else {
        onNotify(localizeKnownMessage(formatFriendlyFirebaseError(err), lang));
      }
    } finally {
      setBusyCode(null);
    }
  };

  const handleConfirmOfflinePay = async (b: Booking) => {
    if (!canConfirmPayments || busyCode === b.bookingCode) return;
    setBusyCode(b.bookingCode);
    try {
      await adminConfirmPayment(b, adminName, 'Offline Desk Confirm', actor);
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
    if (!canUndoPayments || busyCode === b.bookingCode) return;
    setBusyCode(b.bookingCode);
    try {
      const reverted = await adminUndoPayment(b, actor);
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
    if (!canDeleteBookings || busyCode === b.bookingCode) return;
    setBusyCode(b.bookingCode);
    try {
      await adminDeleteBooking(b, actor);
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
                exportOfflineBookingsXlsx(filteredOffline, undefined, {
                  includeFinancials: canViewRevenueAnalytics,
                });
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
        adminRole={adminRole}
        canViewRevenueAnalytics={canViewRevenueAnalytics}
        onNotify={onNotify}
      />

      {/* Excel Import Preview & Confirmation Panel */}
      {rawImportFile && parsedImport && importConcert && (
        <OfflineExcelPreviewPanel
          fileName={rawImportFile.fileName}
          sheetName={rawImportFile.sheetName}
          concerts={concerts}
          importConcert={importConcert}
          parsedImport={parsedImport}
          deductSeatsOnImport={deductSeatsOnImport}
          importBusy={importBusy}
          canViewRevenueAnalytics={canViewRevenueAnalytics}
          onSelectConcertId={setImportConcertId}
          onToggleDeductSeats={setDeductSeatsOnImport}
          onConfirmImport={() => void handleConfirmExcelImport()}
          onClose={() => setRawImportFile(null)}
        />
      )}

      {/* Manual Single Offline Sale Form */}
      {showManualForm && activeConcert && (
        <OfflineManualSaleForm
          concerts={concerts}
          activeConcert={activeConcert}
          manualTier={manualTier}
          manualQty={manualQty}
          manualAmount={manualAmount}
          manualExpectedTotal={manualExpectedTotal}
          manualName={manualName}
          manualMobile={manualMobile}
          manualEmail={manualEmail}
          manualOutlet={manualOutlet}
          manualDeductSeats={manualDeductSeats}
          manualCheckedIn={manualCheckedIn}
          manualBusy={manualBusy}
          onSelectConcertId={setSelectedConcertId}
          onTierChange={setManualTier}
          onQtyChange={setManualQty}
          onAmountChange={setManualAmount}
          onNameChange={setManualName}
          onMobileChange={setManualMobile}
          onEmailChange={setManualEmail}
          onOutletChange={setManualOutlet}
          onDeductSeatsChange={setManualDeductSeats}
          onCheckedInChange={setManualCheckedIn}
          onSubmit={(e) => void handleManualSubmit(e)}
          onClose={() => setShowManualForm(false)}
        />
      )}

      {/* Offline Sales Data Table */}
      <OfflineSalesLedger
        concerts={concerts}
        concertMap={concertMap}
        offlineBookingsCount={offlineBookings.length}
        filteredOffline={filteredOffline}
        searchQuery={searchQuery}
        concertFilter={concertFilter}
        canConfirmPayments={canConfirmPayments}
        canUndoPayments={canUndoPayments}
        canDeleteBookings={canDeleteBookings}
        canViewRevenueAnalytics={canViewRevenueAnalytics}
        busyCode={busyCode}
        confirmDeleteCode={confirmDeleteCode}
        confirmUndoPayCode={confirmUndoPayCode}
        onSearchChange={setSearchQuery}
        onConcertFilterChange={setConcertFilter}
        onConfirmPay={(b) => void handleConfirmOfflinePay(b)}
        onCheckInAction={(b, dir) => void handleRosterCheckInAction(b, dir)}
        onRequestUndoPay={(code) => {
          setConfirmDeleteCode(null);
          setConfirmUndoPayCode(code);
        }}
        onCancelUndoPay={() => setConfirmUndoPayCode(null)}
        onConfirmUndoPay={(b) => void handleUndoOfflinePay(b)}
        onRequestDelete={(code) => {
          setConfirmUndoPayCode(null);
          setConfirmDeleteCode(code);
        }}
        onCancelDelete={() => setConfirmDeleteCode(null)}
        onConfirmDelete={(b) => void handleDeleteOffline(b)}
      />
    </div>
  );
};
