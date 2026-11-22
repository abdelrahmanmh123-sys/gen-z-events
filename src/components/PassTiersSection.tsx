import React from 'react';
import { TICKET_TIERS } from '../data/defaults';
import type { Concert, TierId } from '../types';
import { getTierUnitPrice } from '../utils/bookingLogic';

interface PassTiersSectionProps {
  concerts: Concert[];
}

export const PassTiersSection: React.FC<PassTiersSectionProps> = ({ concerts }) => {
  const getRange = (tier: TierId) => {
    if (concerts.length === 0) return '—';
    const prices = concerts.map((c) => getTierUnitPrice(c, tier));
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    return min === max
      ? `${min.toLocaleString()} EGP`
      : `${min.toLocaleString()} – ${max.toLocaleString()} EGP`;
  };

  return (
    <section id="passes" className="py-16 sm:py-20 border-t border-white/10 bg-[#0B0D12]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        <div className="max-w-2xl space-y-2">
          <p className="text-xs font-mono-num uppercase tracking-[0.2em] text-neutral-400 font-semibold">
            Transparent Access
          </p>
          <h2 className="font-display font-bold text-2xl sm:text-3xl text-white">
            Compare Pass Tiers
          </h2>
          <p className="text-sm text-slate-400">
            Every Qena concert offers four distinct zones. Prices are set per show with zero hidden service fees.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {TICKET_TIERS.map((tier) => (
            <div
              key={tier.id}
              className="flex flex-col bg-[#101218] border border-white/10 rounded-xl p-5 space-y-4"
            >
              <div className="flex items-center justify-between">
                <span className={`font-display font-bold text-lg ${tier.accentText}`}>
                  {tier.name}
                </span>
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: tier.colorHex }}
                  aria-hidden="true"
                />
              </div>

              <div>
                <p className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
                  Season Range
                </p>
                <p className="font-mono-num text-base font-bold text-white mt-0.5">
                  {getRange(tier.id)}
                </p>
              </div>

              <div className="pt-3 border-t border-white/8 space-y-1.5 flex-1">
                <p className="text-xs font-semibold text-white">{tier.perk}</p>
                <p className="text-xs text-slate-400 leading-relaxed">{tier.details}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
