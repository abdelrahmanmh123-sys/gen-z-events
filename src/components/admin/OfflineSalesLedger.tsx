import React from 'react';
import { RotateCcw, Search, Trash2, X } from 'lucide-react';
import type { Booking, Concert } from '../../types';
import {
  formatCheckInProgress,
  getBookingCheckedInCount,
  getTierColorHex,
  hexToRgba,
} from '../../utils/bookingLogic';
import { useLanguage } from '../../i18n/LanguageContext';
import { formatCurrencyEgp, getTierCopy } from '../../i18n/translations';

interface OfflineSalesLedgerProps {
  concerts: Concert[];
  concertMap: Map<string, Concert>;
  offlineBookingsCount: number;
  filteredOffline: Booking[];
  searchQuery: string;
  concertFilter: string;
  canConfirmPayments: boolean;
  canUndoPayments: boolean;
  canDeleteBookings: boolean;
  canViewRevenueAnalytics: boolean;
  busyCode: string | null;
  confirmDeleteCode: string | null;
  confirmUndoPayCode: string | null;
  onSearchChange: (val: string) => void;
  onConcertFilterChange: (val: string) => void;
  onConfirmPay: (b: Booking) => void;
  onCheckInAction: (b: Booking, direction: 'admit' | 'undo') => void;
  onRequestUndoPay: (bookingCode: string) => void;
  onCancelUndoPay: () => void;
  onConfirmUndoPay: (b: Booking) => void;
  onRequestDelete: (bookingCode: string) => void;
  onCancelDelete: () => void;
  onConfirmDelete: (b: Booking) => void;
}

export const OfflineSalesLedger: React.FC<OfflineSalesLedgerProps> = ({
  concerts,
  concertMap,
  offlineBookingsCount,
  filteredOffline,
  searchQuery,
  concertFilter,
  canConfirmPayments,
  canUndoPayments,
  canDeleteBookings,
  canViewRevenueAnalytics,
  busyCode,
  confirmDeleteCode,
  confirmUndoPayCode,
  onSearchChange,
  onConcertFilterChange,
  onConfirmPay,
  onCheckInAction,
  onRequestUndoPay,
  onCancelUndoPay,
  onConfirmUndoPay,
  onRequestDelete,
  onCancelDelete,
  onConfirmDelete,
}) => {
  const { lang, isAr, t } = useLanguage();

  return (
    <div className="bg-[#101218] border border-white/10 rounded-xl overflow-hidden">
      <div className="p-4 border-b border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-500 absolute start-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            aria-label={t.searchOfflinePlaceholder}
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t.searchOfflinePlaceholder}
            className="w-full ps-9 pe-3 py-2 rounded-lg bg-[#08090C] border border-white/12 text-xs text-white focus:outline-none focus:border-white/50"
          />
        </div>

        <select
          aria-label={t.allConcerts}
          value={concertFilter}
          onChange={(e) => onConcertFilterChange(e.target.value)}
          className="px-3 py-2 rounded-lg bg-[#08090C] border border-white/12 text-xs text-white focus:outline-none focus:border-white/50"
        >
          <option value="all">
            {t.allConcerts} ({offlineBookingsCount})
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
                    {offlineBookingsCount === 0 ? t.noOfflineRecorded : t.noOfflineFilterMatch}
                  </p>
                  {offlineBookingsCount === 0 && (
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
                        {canViewRevenueAnalytics && (
                          <span className="font-modern-price font-semibold text-slate-200">
                            {formatCurrencyEgp(b.totalEgp, lang)}
                          </span>
                        )}
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
                              onClick={() => onConfirmPay(b)}
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
                                onClick={() => onCheckInAction(b, isFull ? 'undo' : 'admit')}
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
                                  onClick={() => onCheckInAction(b, 'undo')}
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
                                      onClick={() => onConfirmUndoPay(b)}
                                      className="px-2 py-1.5 rounded-md bg-amber-400 hover:bg-amber-300 disabled:opacity-60 text-[#1A1202] font-semibold"
                                    >
                                      {t.undoPayConfirm}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={onCancelUndoPay}
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
                                    onClick={() => onRequestUndoPay(b.bookingCode)}
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
                                onClick={() => onConfirmDelete(b)}
                                className="px-2 py-1.5 rounded-md bg-rose-600 text-white font-semibold"
                              >
                                {t.sureBtn}
                              </button>
                              <button
                                type="button"
                                onClick={onCancelDelete}
                                aria-label={t.cancelDeleteAria}
                                className="p-1.5 rounded-md text-slate-400 hover:text-white"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => onRequestDelete(b.bookingCode)}
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
  );
};
