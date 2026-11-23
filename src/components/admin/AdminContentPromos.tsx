import React, { useState } from 'react';
import { Plus, Tag, Trash2 } from 'lucide-react';
import { adminDeletePromo, adminSavePromo } from '../../services/firestoreService';
import { formatFriendlyFirebaseError } from '../../firebase';
import { useLanguage } from '../../i18n/LanguageContext';
import { getTierCopy, localizeKnownMessage } from '../../i18n/translations';
import type { Promo, TierId } from '../../types';
import { parseBoundedIntInput } from '../../utils/bookingLogic';

interface AdminContentPromosProps {
  promos: Promo[];
  onNotify: (msg: string) => void;
}

export const AdminContentPromos: React.FC<AdminContentPromosProps> = ({
  promos,
  onNotify,
}) => {
  const { lang, t } = useLanguage();
  const isAr = lang === 'ar';

  const [promoCode, setPromoCode] = useState('');
  const [promoType, setPromoType] = useState<'percent' | 'flat'>('percent');
  const [promoValue, setPromoValue] = useState('15');
  const [promoScope, setPromoScope] = useState<'all' | 'vip'>('all');
  const [promoLabel, setPromoLabel] = useState('');
  const [busyPromo, setBusyPromo] = useState(false);

  const handleSavePromo = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = promoCode.trim().toUpperCase().replace(/[^A-Z0-9_\-]/g, '').slice(0, 32);
    if (cleanCode.length < 2) {
      onNotify(
        isAr
          ? 'يجب أن يتكون كود الخصم من حرفين أو رقمين إنجليزيين على الأقل.'
          : 'Promo code must be at least 2 alphanumeric characters.',
      );
      return;
    }
    const maxVal = promoType === 'percent' ? 90 : 10000;
    const parsed = parseBoundedIntInput(promoValue, 1, maxVal);
    if (!parsed.valid) {
      onNotify(
        promoType === 'percent'
          ? isAr
            ? 'نسبة الخصم يجب أن تكون عدداً صحيحاً بين 1 و 90.'
            : 'Percentage discount must be a whole number between 1 and 90.'
          : isAr
            ? 'قيمة الخصم الثابت يجب أن تكون عدداً صحيحاً بين 1 و 10,000 ج.م.'
            : 'Flat discount must be a whole number between 1 and 10,000 EGP.',
      );
      return;
    }
    const tiers: TierId[] = promoScope === 'vip' ? ['VIP', 'Lounge'] : [];
    const numericVal = parsed.value;
    const existing = promos.some((p) => p.code === cleanCode);
    setBusyPromo(true);
    try {
      await adminSavePromo(
        {
          code: cleanCode,
          type: promoType,
          value: numericVal,
          tiers,
          label:
            promoLabel.trim().slice(0, 120) ||
            `${numericVal}${promoType === 'percent' ? '% Off' : ' EGP Off'}`,
          active: true,
        },
        existing,
      );
      setPromoCode('');
      setPromoLabel('');
      onNotify(isAr ? `تم حفظ كود الخصم ${cleanCode}.` : `Saved promo code ${cleanCode}.`);
    } catch (err) {
      onNotify(localizeKnownMessage(formatFriendlyFirebaseError(err), lang));
    } finally {
      setBusyPromo(false);
    }
  };

  const handleTogglePromo = async (p: Promo) => {
    try {
      await adminSavePromo({ ...p, active: !p.active }, true);
      onNotify(
        isAr
          ? `أصبح الكود ${p.code} الآن ${!p.active ? 'مفعّلاً' : 'مخفياً'}.`
          : `${p.code} is now ${!p.active ? 'Live' : 'Hidden'}.`,
      );
    } catch (err) {
      onNotify(localizeKnownMessage(formatFriendlyFirebaseError(err), lang));
    }
  };

  const handleDeletePromo = async (code: string) => {
    try {
      await adminDeletePromo(code);
      onNotify(isAr ? `تم حذف كود الخصم ${code}.` : `Deleted promo code ${code}.`);
    } catch (err) {
      onNotify(localizeKnownMessage(formatFriendlyFirebaseError(err), lang));
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Create / Update Promo Code */}
      <div className="lg:col-span-5">
        <div className="bg-[#101218] border border-white/10 rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Tag className="w-4 h-4 text-white" />
            <h2 className="font-display font-bold text-lg text-white">{t.createDiscountTitle}</h2>
          </div>

          <form onSubmit={handleSavePromo} className="space-y-3">
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label htmlFor="promo-code" className="block text-[11px] font-medium text-slate-300 mb-1">
                  {t.promoCodeLabel}
                </label>
                <input
                  id="promo-code"
                  type="text"
                  dir="ltr"
                  required
                  maxLength={32}
                  value={promoCode}
                  onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 rounded-lg bg-[#08090C] border border-white/12 text-xs text-white font-mono-num uppercase focus:outline-none focus:border-white/50"
                />
              </div>
              <div>
                <label htmlFor="promo-scope" className="block text-[11px] font-medium text-slate-300 mb-1">
                  {t.promoScopeLabel}
                </label>
                <select
                  id="promo-scope"
                  value={promoScope}
                  onChange={(e) => setPromoScope(e.target.value as 'all' | 'vip')}
                  className="w-full px-3 py-2 rounded-lg bg-[#08090C] border border-white/12 text-xs text-white focus:outline-none focus:border-white/50"
                >
                  <option value="all">{t.allPassTiers}</option>
                  <option value="vip">{t.vipLoungeOnly}</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label htmlFor="promo-type" className="block text-[11px] font-medium text-slate-300 mb-1">
                  {t.discountTypeLabel}
                </label>
                <select
                  id="promo-type"
                  value={promoType}
                  onChange={(e) => setPromoType(e.target.value as 'percent' | 'flat')}
                  className="w-full px-3 py-2 rounded-lg bg-[#08090C] border border-white/12 text-xs text-white focus:outline-none focus:border-white/50"
                >
                  <option value="percent">{t.percentOffOpt}</option>
                  <option value="flat">{t.flatEgpOffOpt}</option>
                </select>
              </div>
              <div>
                <label htmlFor="promo-value" className="block text-[11px] font-medium text-slate-300 mb-1">
                  {t.discountValueLabel}
                </label>
                <input
                  id="promo-value"
                  type="number"
                  dir="ltr"
                  min={1}
                  max={promoType === 'percent' ? 90 : 10000}
                  required
                  value={promoValue}
                  onChange={(e) => setPromoValue(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[#08090C] border border-white/12 text-xs text-white font-mono-num focus:outline-none focus:border-white/50"
                />
              </div>
            </div>
            <div>
              <label htmlFor="promo-label" className="block text-[11px] font-medium text-slate-300 mb-1">
                {t.displayLabelField}
              </label>
              <input
                id="promo-label"
                type="text"
                maxLength={120}
                value={promoLabel}
                onChange={(e) => setPromoLabel(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[#08090C] border border-white/12 text-xs text-white focus:outline-none focus:border-white/50"
              />
            </div>
            <button
              type="submit"
              disabled={busyPromo}
              className="w-full inline-flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-white hover:bg-neutral-200 disabled:opacity-60 text-xs font-semibold text-[#08090C] transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              {t.savePromoCodeBtn}
            </button>
          </form>
        </div>
      </div>

      {/* Active & Hidden Promo Codes */}
      <div className="lg:col-span-7">
        <div className="bg-[#101218] border border-white/10 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display font-bold text-lg text-white">{t.liveDiscountCodesTitle}</h2>
            <span className="text-xs font-mono-num text-slate-400">
              {promos.length} {t.totalCountWord}
            </span>
          </div>

          <div className="divide-y divide-white/8 border-t border-white/8">
            {promos.length === 0 ? (
              <p className="py-8 text-center text-xs text-slate-500">{t.noPromosLive}</p>
            ) : (
              promos.map((p) => (
                <div key={p.code} className="py-3 flex items-center justify-between gap-3 text-xs">
                  <div className="min-w-0">
                    <p dir="ltr" className="font-mono-num font-bold text-white inline-block">
                      {p.code}
                    </p>
                    <p className="text-[11px] text-slate-400 truncate">
                      {p.label} ·{' '}
                      {p.tiers.length > 0
                        ? p.tiers.map((tierId) => getTierCopy(tierId, lang).name).join(' & ')
                        : t.allTiersWord}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => void handleTogglePromo(p)}
                      className={`px-2.5 py-1 rounded text-[11px] font-semibold border ${
                        p.active
                          ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                          : 'border-white/15 text-slate-400'
                      }`}
                    >
                      {p.active ? t.liveWord : t.hiddenWord}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDeletePromo(p.code)}
                      aria-label={isAr ? `حذف كود الخصم ${p.code}` : `Delete promo ${p.code}`}
                      className="p-1 text-slate-400 hover:text-rose-400"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

