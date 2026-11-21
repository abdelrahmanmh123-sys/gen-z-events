import React, { useState } from 'react';
import { Plus, Tag, Trash2 } from 'lucide-react';
import { adminDeletePromo, adminSavePromo } from '../../services/firestoreService';
import { formatFriendlyFirebaseError } from '../../firebase';
import type { Promo, TierId } from '../../types';

interface AdminContentPromosProps {
  promos: Promo[];
  onNotify: (msg: string) => void;
}

export const AdminContentPromos: React.FC<AdminContentPromosProps> = ({
  promos,
  onNotify,
}) => {
  const [promoCode, setPromoCode] = useState('');
  const [promoType, setPromoType] = useState<'percent' | 'flat'>('percent');
  const [promoValue, setPromoValue] = useState(15);
  const [promoScope, setPromoScope] = useState<'all' | 'vip'>('all');
  const [promoLabel, setPromoLabel] = useState('');
  const [busyPromo, setBusyPromo] = useState(false);

  const handleSavePromo = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = promoCode.trim().toUpperCase().replace(/[^A-Z0-9_\-]/g, '');
    if (cleanCode.length < 2) {
      onNotify('Promo code must be at least 2 alphanumeric characters.');
      return;
    }
    const tiers: TierId[] = promoScope === 'vip' ? ['VIP', 'Lounge'] : [];
    const parsedVal = Number.isFinite(Number(promoValue)) ? Number(promoValue) : 1;
    const numericVal =
      promoType === 'percent'
        ? Math.min(90, Math.max(1, Math.round(parsedVal)))
        : Math.min(10000, Math.max(1, Math.round(parsedVal)));
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
      onNotify(`Saved promo code ${cleanCode}.`);
    } catch (err) {
      onNotify(formatFriendlyFirebaseError(err));
    } finally {
      setBusyPromo(false);
    }
  };

  const handleTogglePromo = async (p: Promo) => {
    try {
      await adminSavePromo({ ...p, active: !p.active }, true);
      onNotify(`${p.code} is now ${!p.active ? 'Live' : 'Hidden'}.`);
    } catch (err) {
      onNotify(formatFriendlyFirebaseError(err));
    }
  };

  const handleDeletePromo = async (code: string) => {
    try {
      await adminDeletePromo(code);
      onNotify(`Deleted promo code ${code}.`);
    } catch (err) {
      onNotify(formatFriendlyFirebaseError(err));
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Left: Create / Update Promo Code */}
      <div className="lg:col-span-5">
        <div className="bg-[#101218] border border-white/10 rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Tag className="w-4 h-4 text-rose-400" />
            <h2 className="font-display font-bold text-lg text-white">Create Discount Code</h2>
          </div>

          <form onSubmit={handleSavePromo} className="space-y-3">
            <div className="grid grid-cols-2 gap-2.5">
              <input
                type="text"
                required
                maxLength={32}
                value={promoCode}
                onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                placeholder="CODE (e.g. QENA20)"
                className="px-3 py-2 rounded-lg bg-[#08090C] border border-white/12 text-xs text-white font-mono-num uppercase"
              />
              <select
                value={promoScope}
                onChange={(e) => setPromoScope(e.target.value as 'all' | 'vip')}
                className="px-3 py-2 rounded-lg bg-[#08090C] border border-white/12 text-xs text-white"
              >
                <option value="all">All Pass Tiers</option>
                <option value="vip">VIP &amp; Lounge Only</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <select
                value={promoType}
                onChange={(e) => setPromoType(e.target.value as 'percent' | 'flat')}
                className="px-3 py-2 rounded-lg bg-[#08090C] border border-white/12 text-xs text-white"
              >
                <option value="percent">% Percentage Off</option>
                <option value="flat">Flat EGP Off</option>
              </select>
              <input
                type="number"
                min={1}
                max={promoType === 'percent' ? 90 : 10000}
                required
                value={promoValue}
                onChange={(e) => setPromoValue(Number(e.target.value))}
                className="px-3 py-2 rounded-lg bg-[#08090C] border border-white/12 text-xs text-white font-mono-num"
              />
            </div>
            <input
              type="text"
              maxLength={120}
              value={promoLabel}
              onChange={(e) => setPromoLabel(e.target.value)}
              placeholder="Display label (e.g. 20% Off Early Bird)"
              className="w-full px-3 py-2 rounded-lg bg-[#08090C] border border-white/12 text-xs text-white"
            />
            <button
              type="submit"
              disabled={busyPromo}
              className="w-full inline-flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-xs font-semibold text-white"
            >
              <Plus className="w-3.5 h-3.5" />
              Save Promo Code
            </button>
          </form>
        </div>
      </div>

      {/* Right: Active & Hidden Promo Codes */}
      <div className="lg:col-span-7">
        <div className="bg-[#101218] border border-white/10 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display font-bold text-lg text-white">Live Discount Codes</h2>
            <span className="text-xs font-mono-num text-slate-400">
              {promos.length} total
            </span>
          </div>

          <div className="divide-y divide-white/8 border-t border-white/8">
            {promos.length === 0 ? (
              <p className="py-8 text-center text-xs text-slate-500">
                No promo codes live. Create one on the left to offer discounts during checkout.
              </p>
            ) : (
              promos.map((p) => (
                <div key={p.code} className="py-3 flex items-center justify-between gap-3 text-xs">
                  <div className="min-w-0">
                    <p className="font-mono-num font-bold text-white">{p.code}</p>
                    <p className="text-[11px] text-slate-400 truncate">
                      {p.label} · {p.tiers.length > 0 ? p.tiers.join(' & ') : 'All Tiers'}
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
                      {p.active ? 'Live' : 'Hidden'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDeletePromo(p.code)}
                      aria-label={`Delete promo ${p.code}`}
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
