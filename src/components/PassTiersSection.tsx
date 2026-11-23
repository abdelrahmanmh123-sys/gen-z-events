import React from 'react';
import { TICKET_TIERS } from '../data/defaults';
import { useLanguage } from '../i18n/LanguageContext';
import { formatCurrencyEgp, getTierCopy } from '../i18n/translations';
import type { Concert, TierId } from '../types';
import { getTierColorHex, getTierUnitPrice } from '../utils/bookingLogic';

interface PassTiersSectionProps {
  concerts: Concert[];
}

export const PassTiersSection: React.FC<PassTiersSectionProps> = ({ concerts }) => {
  const { lang, t } = useLanguage();
  const singleConcert = concerts.length === 1 ? concerts[0] : null;

  const getRange = (tier: TierId) => {
    if (concerts.length === 0) return '—';
    const prices = concerts.map((c) => getTierUnitPrice(c, tier));
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    if (min === max) {
      return formatCurrencyEgp(min, lang);
    }
    return lang === 'ar'
      ? `${min.toLocaleString('en-US')} – ${max.toLocaleString('en-US')} ج.م`
      : `${min.toLocaleString('en-US')} – ${max.toLocaleString('en-US')} EGP`;
  };

  return (
    <section id="passes" className="py-16 sm:py-20 border-t border-white/10 bg-[#0B0D12]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        <div className="max-w-2xl space-y-2">
          <p className="text-xs uppercase tracking-[0.2em] rtl:tracking-normal text-neutral-400 font-semibold">
            {t.transparentAccess}
          </p>
          <h2 className="font-display font-bold text-2xl sm:text-3xl text-white">
            {t.comparePassTiers}
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {TICKET_TIERS.map((tier) => {
            const tierHex = singleConcert?.tierColors
              ? getTierColorHex(singleConcert, tier.id)
              : tier.colorHex;
            const copy = getTierCopy(tier.id, lang);
            return (
              <div
                key={tier.id}
                className="flex flex-col bg-[#101218] border border-white/10 rounded-xl p-5 space-y-4"
              >
                <div className="flex items-center justify-between">
                  <span className="font-display font-bold text-lg" style={{ color: tierHex }}>
                    {copy.name}
                  </span>
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: tierHex }}
                    aria-hidden="true"
                  />
                </div>

                <div>
                  <p className="text-[11px] uppercase tracking-wider rtl:tracking-normal text-slate-500 font-semibold">
                    {t.seasonRange}
                  </p>
                  <p className="font-modern-price text-base font-bold tracking-tight rtl:tracking-normal text-white mt-0.5">
                    {getRange(tier.id)}
                  </p>
                </div>

                <div className="pt-3 border-t border-white/8 space-y-1.5 flex-1">
                  {copy.compareLead && (
                    <p className="text-xs font-semibold text-white">{copy.compareLead}</p>
                  )}
                  <p className="text-xs text-slate-300 leading-relaxed">{copy.details}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
