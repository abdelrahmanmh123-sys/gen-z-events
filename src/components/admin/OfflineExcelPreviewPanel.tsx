import React from 'react';
import { AlertCircle, CheckCircle2, FileSpreadsheet, Upload, X } from 'lucide-react';
import type { Concert } from '../../types';
import { getTierColorHex, type ParsedOfflineBatchResult } from '../../utils/bookingLogic';
import { useLanguage } from '../../i18n/LanguageContext';
import { formatCurrencyEgp, getTierCopy } from '../../i18n/translations';

interface OfflineExcelPreviewPanelProps {
  fileName: string;
  sheetName: string;
  concerts: Concert[];
  importConcert: Concert;
  parsedImport: ParsedOfflineBatchResult;
  deductSeatsOnImport: boolean;
  importBusy: boolean;
  canViewRevenueAnalytics: boolean;
  onSelectConcertId: (id: string) => void;
  onToggleDeductSeats: (checked: boolean) => void;
  onConfirmImport: () => void;
  onClose: () => void;
}

export const OfflineExcelPreviewPanel: React.FC<OfflineExcelPreviewPanelProps> = ({
  fileName,
  sheetName,
  concerts,
  importConcert,
  parsedImport,
  deductSeatsOnImport,
  importBusy,
  canViewRevenueAnalytics,
  onSelectConcertId,
  onToggleDeductSeats,
  onConfirmImport,
  onClose,
}) => {
  const { lang, t } = useLanguage();

  return (
    <div className="bg-[#101218] border border-white/20 rounded-xl p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            <h3 className="font-display font-bold text-base text-white">
              {t.excelPreviewTitle} · <span dir="ltr">{fileName}</span>
            </h3>
          </div>
          <p className="text-xs text-slate-400">
            {t.worksheetLabel} &quot;{sheetName}&quot; · {t.reviewParsedHint}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t.cancel}
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06]"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-lg bg-[#08090C] border border-white/10">
        <div>
          <label
            htmlFor="imp-concert"
            className="block text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-1.5"
          >
            {t.assignImportedConcert}
          </label>
          <select
            id="imp-concert"
            value={importConcert.id}
            onChange={(e) => onSelectConcertId(e.target.value)}
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
              onChange={(e) => onToggleDeductSeats(e.target.checked)}
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
          {parsedImport.totalTickets.toLocaleString()} {t.ticketsLower}
          {canViewRevenueAnalytics && (
            <>
              {' '}
              ·{' '}
              <span className="font-modern-price font-bold">
                {formatCurrencyEgp(parsedImport.totalRevenueEgp, lang)}
              </span>
            </>
          )}
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
                  {canViewRevenueAnalytics && (
                    <th className="px-3 py-2.5 text-start">{t.colTotal}</th>
                  )}
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
                      {canViewRevenueAnalytics && (
                        <td className="px-3 py-2 font-modern-price font-semibold text-white">
                          {formatCurrencyEgp(b.totalEgp, lang)}
                        </td>
                      )}
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
          onClick={onClose}
          className="px-4 py-2 rounded-lg border border-white/12 text-xs font-medium text-slate-300 hover:text-white"
        >
          {t.cancel}
        </button>
        <button
          type="button"
          disabled={importBusy || parsedImport.validBookings.length === 0}
          onClick={onConfirmImport}
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
  );
};
