import React, { useState } from 'react';
import { Check, Pencil, Plus, Tag, Trash2, X } from 'lucide-react';
import { DEFAULT_TIER_COLORS, TICKET_TIERS } from '../../data/defaults';
import { adminDeletePromo, adminSavePromo } from '../../services/firestoreService';
import { formatFriendlyFirebaseError } from '../../firebase';
import { useLanguage } from '../../i18n/LanguageContext';
import {
  formatPromoTiersSummary,
  getTierCopy,
  localizeKnownMessage,
} from '../../i18n/translations';
import type { Promo, TierId } from '../../types';
import {
  hexToRgba,
  normalizePromoTiers,
  parseBoundedIntInput,
  togglePromoTier,
} from '../../utils/bookingLogic';

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
  const [promoTiers, setPromoTiers] = useState<TierId[]>([]);
  const [promoLabel, setPromoLabel] = useState('');
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [busyPromo, setBusyPromo] = useState(false);
  const [busyCode, setBusyCode] = useState<string | null>(null);
  const [confirmDeleteCode, setConfirmDeleteCode] = useState<string | null>(null);

  const normalizedSelectedTiers = normalizePromoTiers(promoTiers);
  const isAllTiersSelected = normalizedSelectedTiers.length === 0;
  const isVipLoungePreset =
    normalizedSelectedTiers.length === 2 &&
    normalizedSelectedTiers[0] === 'VIP' &&
    normalizedSelectedTiers[1] === 'Lounge';

  const resetForm = () => {
    setPromoCode('');
    setPromoType('percent');
    setPromoValue('15');
    setPromoTiers([]);
    setPromoLabel('');
    setEditingCode(null);
  };

  const handleLoadEditPromo = (promo: Promo) => {
    setPromoCode(promo.code);
    setPromoType(promo.type);
    setPromoValue(String(promo.value));
    setPromoTiers(normalizePromoTiers(promo.tiers));
    setPromoLabel(promo.label);
    setEditingCode(promo.code);
    setConfirmDeleteCode(null);
  };

  const handleSavePromo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busyPromo) return;
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
    const trimmedLabel = promoLabel.trim().slice(0, 120);
    if (trimmedLabel.length === 1) {
      onNotify(
        isAr
          ? 'وصف الخصم يجب أن يتكون من حرفين على الأقل أو يُترك فارغاً.'
          : 'Display label must be at least 2 characters or left blank.',
      );
      return;
    }
    const tiers = normalizePromoTiers(promoTiers);
    const numericVal = parsed.value;
    const existingPromo = promos.find((p) => p.code === cleanCode);
    const existing = Boolean(existingPromo);
    setBusyPromo(true);
    try {
      await adminSavePromo(
        {
          code: cleanCode,
          type: promoType,
          value: numericVal,
          tiers,
          label:
            trimmedLabel ||
            `${numericVal}${promoType === 'percent' ? '% Off' : ' EGP Off'}`,
          active: existingPromo ? existingPromo.active : true,
        },
        existing,
      );
      resetForm();
      onNotify(isAr ? `تم حفظ كود الخصم ${cleanCode}.` : `Saved promo code ${cleanCode}.`);
    } catch (err) {
      onNotify(localizeKnownMessage(formatFriendlyFirebaseError(err), lang));
    } finally {
      setBusyPromo(false);
    }
  };

  const handleTogglePromo = async (p: Promo) => {
    if (busyCode === p.code) return;
    setBusyCode(p.code);
    try {
      await adminSavePromo({ ...p, active: !p.active }, true);
      onNotify(
        isAr
          ? `أصبح الكود ${p.code} الآن ${!p.active ? 'مفعّلاً' : 'مخفياً'}.`
          : `${p.code} is now ${!p.active ? 'Live' : 'Hidden'}.`,
      );
    } catch (err) {
      onNotify(localizeKnownMessage(formatFriendlyFirebaseError(err), lang));
    } finally {
      setBusyCode(null);
    }
  };

  const handleDeletePromo = async (code: string) => {
    if (busyCode === code) return;
    setBusyCode(code);
    try {
      await adminDeletePromo(code);
      setConfirmDeleteCode(null);
      if (editingCode === code) {
        resetForm();
      }
      onNotify(isAr ? `تم حذف كود الخصم ${code}.` : `Deleted promo code ${code}.`);
    } catch (err) {
      onNotify(localizeKnownMessage(formatFriendlyFirebaseError(err), lang));
    } finally {
      setBusyCode(null);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Create / Update Promo Code */}
      <div className="lg:col-span-5">
        <div className="bg-[#101218] border border-white/10 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Tag className="w-4 h-4 text-white" />
              <h2 className="font-display font-bold text-lg text-white">{t.createDiscountTitle}</h2>
            </div>
            {editingCode && (
              <button
                type="button"
                onClick={resetForm}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-white/15 text-[11px] text-slate-300 hover:text-white hover:border-white/30"
              >
                <X className="w-3 h-3" />
                {t.cancelBtn}
              </button>
            )}
          </div>

          {editingCode && (
            <p className="text-[11px] text-amber-300 bg-amber-500/10 border border-amber-400/25 rounded-lg px-3 py-1.5">
              {t.editingPromoNotice}:{' '}
              <span dir="ltr" className="font-mono-num font-bold">
                {editingCode}
              </span>
            </p>
          )}

          <form onSubmit={handleSavePromo} className="space-y-3.5">
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
                onChange={(e) => {
                  const next = e.target.value.toUpperCase();
                  setPromoCode(next);
                  if (editingCode && next.trim() !== editingCode) {
                    setEditingCode(null);
                  }
                }}
                className="w-full px-3 py-2 rounded-lg bg-[#08090C] border border-white/12 text-xs text-white font-mono-num uppercase focus:outline-none focus:border-white/50"
              />
            </div>

            {/* Pass Tier Scope: Presets + Individual Ticket Tiers */}
            <div className="space-y-2 rounded-lg bg-[#08090C] border border-white/10 p-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-[11px] font-medium text-slate-300">{t.promoScopeLabel}</span>
                <span className="text-[11px] font-semibold text-white">
                  {t.promoAppliesToLabel}:{' '}
                  <span className="text-amber-300">
                    {formatPromoTiersSummary(normalizedSelectedTiers, lang)}
                  </span>
                </span>
              </div>

              {/* Quick Presets */}
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  aria-pressed={isAllTiersSelected}
                  onClick={() => setPromoTiers([])}
                  className={`inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-md border text-[11px] font-semibold transition-colors ${
                    isAllTiersSelected
                      ? 'border-white/60 bg-white text-[#08090C]'
                      : 'border-white/12 bg-white/[0.03] text-slate-300 hover:border-white/30 hover:text-white'
                  }`}
                >
                  {isAllTiersSelected && <Check className="w-3 h-3 shrink-0" />}
                  {t.allPassTiers}
                </button>
                <button
                  type="button"
                  aria-pressed={isVipLoungePreset}
                  onClick={() => setPromoTiers(['VIP', 'Lounge'])}
                  className={`inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-md border text-[11px] font-semibold transition-colors ${
                    isVipLoungePreset
                      ? 'border-amber-400/70 bg-amber-400/15 text-amber-200'
                      : 'border-white/12 bg-white/[0.03] text-slate-300 hover:border-white/30 hover:text-white'
                  }`}
                >
                  {isVipLoungePreset && <Check className="w-3 h-3 shrink-0" />}
                  {t.vipLoungeOnly}
                </button>
              </div>

              {/* Individual Ticket Tier Buttons */}
              <div className="grid grid-cols-2 gap-1.5 pt-0.5">
                {TICKET_TIERS.map((tier) => {
                  const selected = normalizedSelectedTiers.includes(tier.id);
                  const tierHex = DEFAULT_TIER_COLORS[tier.id];
                  const tierLabel = getTierCopy(tier.id, lang).name;
                  return (
                    <button
                      key={tier.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setPromoTiers((prev) => togglePromoTier(prev, tier.id))}
                      className={`flex items-center justify-between gap-1.5 px-2.5 py-2 rounded-md border text-[11px] font-semibold transition-colors ${
                        selected
                          ? 'text-white'
                          : 'border-white/10 bg-[#101218] text-slate-300 hover:border-white/25 hover:text-white'
                      }`}
                      style={
                        selected
                          ? {
                              borderColor: tierHex,
                              backgroundColor: hexToRgba(tierHex, 0.16),
                            }
                          : undefined
                      }
                    >
                      <span className="inline-flex items-center gap-1.5 min-w-0">
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: tierHex }}
                          aria-hidden="true"
                        />
                        <span className="truncate">{tierLabel}</span>
                      </span>
                      {selected && <Check className="w-3 h-3 shrink-0" style={{ color: tierHex }} />}
                    </button>
                  );
                })}
              </div>

              <p className="text-[10px] text-slate-400 leading-relaxed">{t.promoScopeHint}</p>
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
                      {p.label} · {formatPromoTiersSummary(p.tiers, lang)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      disabled={busyCode === p.code}
                      onClick={() => handleLoadEditPromo(p)}
                      aria-label={isAr ? `تعديل كود الخصم ${p.code}` : `Edit promo ${p.code}`}
                      className="p-1.5 rounded border border-white/10 text-slate-300 hover:text-white hover:border-white/30 disabled:opacity-50"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={busyCode === p.code}
                      onClick={() => void handleTogglePromo(p)}
                      className={`px-2.5 py-1 rounded text-[11px] font-semibold border disabled:opacity-50 ${
                        p.active
                          ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                          : 'border-white/15 text-slate-400'
                      }`}
                    >
                      {p.active ? t.liveWord : t.hiddenWord}
                    </button>
                    {confirmDeleteCode === p.code ? (
                      <span className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          disabled={busyCode === p.code}
                          onClick={() => void handleDeletePromo(p.code)}
                          className="px-2 py-1 rounded bg-rose-600 text-white text-[11px] font-semibold disabled:opacity-50"
                        >
                          {t.sureBtn}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteCode(null)}
                          aria-label={t.cancelDeleteAria}
                          className="p-1 text-slate-400 hover:text-white"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={busyCode === p.code}
                        onClick={() => setConfirmDeleteCode(p.code)}
                        aria-label={isAr ? `حذف كود الخصم ${p.code}` : `Delete promo ${p.code}`}
                        className="p-1 text-slate-400 hover:text-rose-400 disabled:opacity-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
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

