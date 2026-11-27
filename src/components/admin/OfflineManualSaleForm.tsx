import React from 'react';
import { Plus, Store, X } from 'lucide-react';
import { TICKET_TIERS } from '../../data/defaults';
import type { Concert, TierId } from '../../types';
import { getTierUnitPrice, MAX_OFFLINE_QTY_PER_ROW } from '../../utils/bookingLogic';
import { useLanguage } from '../../i18n/LanguageContext';
import { formatCurrencyEgp, getTierCopy } from '../../i18n/translations';

interface OfflineManualSaleFormProps {
  concerts: Concert[];
  activeConcert: Concert;
  manualTier: TierId;
  manualQty: string;
  manualAmount: string;
  manualExpectedTotal: number;
  manualName: string;
  manualMobile: string;
  manualEmail: string;
  manualOutlet: string;
  manualDeductSeats: boolean;
  manualCheckedIn: boolean;
  manualBusy: boolean;
  onSelectConcertId: (id: string) => void;
  onTierChange: (tier: TierId) => void;
  onQtyChange: (val: string) => void;
  onAmountChange: (val: string) => void;
  onNameChange: (val: string) => void;
  onMobileChange: (val: string) => void;
  onEmailChange: (val: string) => void;
  onOutletChange: (val: string) => void;
  onDeductSeatsChange: (checked: boolean) => void;
  onCheckedInChange: (checked: boolean) => void;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
}

export const OfflineManualSaleForm: React.FC<OfflineManualSaleFormProps> = ({
  concerts,
  activeConcert,
  manualTier,
  manualQty,
  manualAmount,
  manualExpectedTotal,
  manualName,
  manualMobile,
  manualEmail,
  manualOutlet,
  manualDeductSeats,
  manualCheckedIn,
  manualBusy,
  onSelectConcertId,
  onTierChange,
  onQtyChange,
  onAmountChange,
  onNameChange,
  onMobileChange,
  onEmailChange,
  onOutletChange,
  onDeductSeatsChange,
  onCheckedInChange,
  onSubmit,
  onClose,
}) => {
  const { lang, t } = useLanguage();

  return (
    <form
      onSubmit={onSubmit}
      className="bg-[#101218] border border-white/12 rounded-xl p-5 space-y-4"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Store className="w-4 h-4 text-white" />
          <h3 className="font-display font-bold text-base text-white">{t.logSingleOfflineTitle}</h3>
        </div>
        <button
          type="button"
          onClick={onClose}
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
            onChange={(e) => onSelectConcertId(e.target.value)}
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
            onChange={(e) => onTierChange(e.target.value as TierId)}
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
              onChange={(e) => onQtyChange(e.target.value)}
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
              onChange={(e) => onAmountChange(e.target.value)}
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
            onChange={(e) => onNameChange(e.target.value)}
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
            onChange={(e) => onMobileChange(e.target.value)}
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
            onChange={(e) => onEmailChange(e.target.value)}
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
            onChange={(e) => onOutletChange(e.target.value)}
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
              onChange={(e) => onDeductSeatsChange(e.target.checked)}
              className="w-3.5 h-3.5 accent-white"
            />
            {t.deductFromSeats}
          </label>
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={manualCheckedIn}
              onChange={(e) => onCheckedInChange(e.target.checked)}
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
  );
};
