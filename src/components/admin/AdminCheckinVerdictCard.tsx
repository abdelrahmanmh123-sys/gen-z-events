import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  RotateCcw,
  ShieldAlert,
  X,
  XCircle,
} from 'lucide-react';
import type { Booking } from '../../types';
import { formatCheckInProgress, getBookingCheckedInCount } from '../../utils/bookingLogic';
import type { GateScanVerdict } from '../../utils/gateScanLogic';
import { useLanguage } from '../../i18n/LanguageContext';
import { getTierCopy } from '../../i18n/translations';

interface AdminCheckinVerdictCardProps {
  scanResult: GateScanVerdict;
  canConfirmPayments: boolean;
  canUndoPayments: boolean;
  busyCode: string | null;
  confirmUndoPayCode: string | null;
  onQuickApprove: (b: Booking) => void;
  onAdmitNext: (bookingCode: string) => void;
  onRequestUndoPay: (bookingCode: string) => void;
  onCancelUndoPay: () => void;
  onConfirmUndoPay: (b: Booking) => void;
  onResetScan: () => void;
}

export const AdminCheckinVerdictCard: React.FC<AdminCheckinVerdictCardProps> = ({
  scanResult,
  canConfirmPayments,
  canUndoPayments,
  busyCode,
  confirmUndoPayCode,
  onQuickApprove,
  onAdmitNext,
  onRequestUndoPay,
  onCancelUndoPay,
  onConfirmUndoPay,
  onResetScan,
}) => {
  const { lang, t } = useLanguage();

  return (
    <div
      role="status"
      aria-live="assertive"
      className={`rounded-xl border-2 p-5 space-y-3.5 ${
        scanResult.tone === 'success'
          ? 'border-emerald-400 bg-emerald-950/70 text-emerald-50'
          : scanResult.tone === 'warn'
            ? 'border-amber-400 bg-amber-950/65 text-amber-50'
            : 'border-rose-500 bg-rose-950/75 text-rose-50'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
              scanResult.tone === 'success'
                ? 'bg-emerald-500/25 text-emerald-300'
                : scanResult.tone === 'warn'
                  ? 'bg-amber-400/25 text-amber-300'
                  : 'bg-rose-500/25 text-rose-300'
            }`}
          >
            {scanResult.tone === 'success' ? (
              <CheckCircle2 className="w-7 h-7" />
            ) : scanResult.tone === 'warn' ? (
              <AlertTriangle className="w-7 h-7" />
            ) : scanResult.status === 'invalid_wrong_qr' ? (
              <ShieldAlert className="w-7 h-7" />
            ) : (
              <XCircle className="w-7 h-7" />
            )}
          </div>
          <div className="space-y-1">
            <span
              className={`inline-block text-[11px] font-mono-num font-extrabold uppercase tracking-wider rtl:tracking-normal px-2.5 py-0.5 rounded ${
                scanResult.tone === 'success'
                  ? 'bg-emerald-500 text-[#04140D]'
                  : scanResult.tone === 'warn'
                    ? 'bg-amber-400 text-[#1A1202]'
                    : 'bg-rose-500 text-white'
              }`}
            >
              {scanResult.verdictBadge}
            </span>
            <h3 className="font-display font-bold text-base sm:text-lg leading-snug text-white">
              {scanResult.headline}
            </h3>
          </div>
        </div>
        <button
          type="button"
          onClick={onResetScan}
          aria-label={t.scanNextBtn}
          className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Multi-Ticket Scan Counter Strip (e.g. (1/5), (2/5), ..., (5/5)) */}
      {scanResult.booking &&
        (scanResult.totalQuantity ?? Math.max(1, Math.floor(scanResult.booking.quantity || 1))) > 1 &&
        (() => {
          const totalQty =
            scanResult.totalQuantity ?? Math.max(1, Math.floor(scanResult.booking.quantity || 1));
          const scannedQty =
            scanResult.admittedCount ?? getBookingCheckedInCount(scanResult.booking);
          const remainingQty = Math.max(0, totalQty - scannedQty);
          const pct = Math.min(100, Math.round((scannedQty / totalQty) * 100));
          return (
            <div
              data-testid="multi-scan-counter"
              className="rounded-lg bg-black/35 border border-white/15 p-3 space-y-2"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <span className="text-[11px] uppercase tracking-wider text-white/65 block">
                    {t.entriesProgressLabel}
                  </span>
                  <span className="text-xs font-medium text-white/90">
                    {remainingQty > 0
                      ? `${remainingQty} ${t.entriesRemainingWord}`
                      : t.allEntriesAdmitted}
                  </span>
                </div>
                <span
                  dir="ltr"
                  className={`font-mono-num text-xl sm:text-2xl font-black px-3 py-1 rounded-lg border ${
                    scanResult.tone === 'success'
                      ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-200'
                      : scanResult.tone === 'warn'
                        ? 'bg-amber-400/20 border-amber-300/50 text-amber-200'
                        : 'bg-rose-500/25 border-rose-400/50 text-rose-200'
                  }`}
                >
                  {formatCheckInProgress(scannedQty, totalQty)}
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    scanResult.tone === 'success'
                      ? 'bg-emerald-400'
                      : scanResult.tone === 'warn'
                        ? 'bg-amber-400'
                        : 'bg-rose-400'
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })()}

      {/* Detailed Reason Explanation */}
      <p className="text-xs sm:text-sm leading-relaxed text-white/90">{scanResult.reason}</p>

      {/* Ticket / Scanned Code Metadata Box */}
      {scanResult.booking ? (
        <div className="grid grid-cols-2 gap-2.5 pt-2.5 border-t border-white/15 text-xs">
          <div>
            <span className="text-white/60 block text-[11px]">{t.colCode}</span>
            <span className="font-mono-num font-bold text-white" dir="ltr">
              {scanResult.booking.bookingCode}
            </span>
          </div>
          <div>
            <span className="text-white/60 block text-[11px]">{t.colConcertTier}</span>
            <span className="font-semibold text-white">
              {scanResult.booking.quantity}x {getTierCopy(scanResult.booking.tier, lang).name}
            </span>
          </div>
          <div className="col-span-2">
            <span className="text-white/60 block text-[11px]">{t.colConcert}</span>
            <span className="font-medium text-white">{scanResult.booking.concertTitle}</span>
          </div>
        </div>
      ) : (
        scanResult.scannedCode && (
          <div className="pt-2.5 border-t border-white/15 text-xs">
            <span className="text-white/60 block text-[11px]">{t.scannedCodeLabel}</span>
            <span className="font-mono-num text-white break-all" dir="ltr">
              {scanResult.scannedCode}
            </span>
          </div>
        )
      )}

      {/* Action Row */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        {canConfirmPayments &&
          scanResult.booking &&
          scanResult.booking.paymentStatus === 'Pending' && (
            <button
              type="button"
              disabled={busyCode === scanResult.booking.bookingCode}
              onClick={() => onQuickApprove(scanResult.booking!)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-xs font-bold text-[#04140D] transition-colors"
            >
              <CheckCircle2 className="w-4 h-4" />
              {t.confirmPayAndApprove}
            </button>
          )}
        {scanResult.isValid &&
          scanResult.booking &&
          (scanResult.remainingEntries ?? 0) > 0 && (
            <button
              type="button"
              onClick={() => onAdmitNext(scanResult.booking!.bookingCode)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-xs font-bold text-[#04140D] transition-colors"
            >
              <CheckCircle2 className="w-4 h-4" />
              {t.admitNextBtn}{' '}
              <span className="font-mono-num" dir="ltr">
                {formatCheckInProgress(
                  (scanResult.admittedCount ?? 0) + 1,
                  scanResult.totalQuantity ?? scanResult.booking.quantity,
                )}
              </span>
            </button>
          )}
        {canUndoPayments &&
          scanResult.booking &&
          scanResult.booking.paymentStatus === 'Paid' &&
          (confirmUndoPayCode === scanResult.booking.bookingCode ? (
            <span className="inline-flex items-center gap-1.5">
              <button
                type="button"
                disabled={busyCode === scanResult.booking.bookingCode}
                onClick={() => onConfirmUndoPay(scanResult.booking!)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-amber-400 hover:bg-amber-300 disabled:opacity-60 text-xs font-bold text-[#1A1202] transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                {t.undoPayConfirm}
              </button>
              <button
                type="button"
                onClick={onCancelUndoPay}
                aria-label={t.cancelUndoPayAria}
                className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </span>
          ) : (
            <button
              type="button"
              disabled={busyCode === scanResult.booking.bookingCode}
              onClick={() => onRequestUndoPay(scanResult.booking!.bookingCode)}
              aria-label={`${t.undoPayAria} (${scanResult.booking.bookingCode})`}
              title={t.undoPayAria}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-amber-400/50 bg-amber-400/15 hover:bg-amber-400/25 disabled:opacity-60 text-xs font-semibold text-amber-200 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              {t.undoPay}
            </button>
          ))}
        <button
          type="button"
          onClick={onResetScan}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white/15 hover:bg-white/25 text-xs font-semibold text-white transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          {t.scanNextBtn}
        </button>
      </div>
    </div>
  );
};
