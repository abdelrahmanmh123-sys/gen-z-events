import React from 'react';
import { Palette, RotateCcw } from 'lucide-react';
import { DEFAULT_TIER_COLORS, TICKET_TIERS, TIER_COLOR_SWATCHES } from '../../data/defaults';
import type { TierColors, TierId } from '../../types';
import { hexToRgba, isValidHexColor, normalizeHexColor } from '../../utils/bookingLogic';
import { useLanguage } from '../../i18n/LanguageContext';
import { formatCurrencyEgp, getSwatchName, getTierCopy } from '../../i18n/translations';

interface TierColorEditorProps {
  enabled: boolean;
  onToggle: (next: boolean) => void;
  colors: TierColors;
  hexDrafts: TierColors;
  onChangeColor: (tier: TierId, hex: string) => void;
  onChangeDraft: (tier: TierId, raw: string) => void;
  onResetDefaults: () => void;
  tierPrices?: Record<TierId, string | number>;
  compact?: boolean;
  idPrefix?: string;
}

export const TierColorEditor: React.FC<TierColorEditorProps> = ({
  enabled,
  onToggle,
  colors,
  hexDrafts,
  onChangeColor,
  onChangeDraft,
  onResetDefaults,
  tierPrices,
  compact = false,
  idPrefix = 'tier-color',
}) => {
  const { lang, t } = useLanguage();

  const handleBlurDraft = (tier: TierId) => {
    const normalized = normalizeHexColor(hexDrafts[tier]);
    if (normalized) {
      onChangeColor(tier, normalized);
    }
  };

  return (
    <div className="p-4 rounded-lg bg-[#08090C] border border-white/10 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-white/[0.06] border border-white/10 flex items-center justify-center shrink-0">
            <Palette className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-white">
              {t.customColorsTitle}
            </p>
            <p className="text-[11px] text-slate-400">{t.customColorsSubtitle}</p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {enabled && (
            <button
              type="button"
              onClick={onResetDefaults}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400 hover:text-white transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              {t.resetDefaults}
            </button>
          )}
          <button
            type="button"
            dir="ltr"
            role="switch"
            aria-checked={enabled}
            aria-label={t.toggleColorsAria}
            onClick={() => onToggle(!enabled)}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 ${
              enabled
                ? 'bg-white border-white'
                : 'bg-[#171A23] border-white/20 hover:border-white/35'
            }`}
          >
            <span
              aria-hidden="true"
              className={`pointer-events-none inline-block h-4 w-4 rounded-full transition-transform mt-[3px] ${
                enabled ? 'translate-x-[22px] bg-[#08090C]' : 'translate-x-[3px] bg-slate-300'
              }`}
            />
          </button>
        </div>
      </div>

      {!enabled ? (
        <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] text-slate-400">
          <span>{t.usingDefaultPalette}</span>
          {TICKET_TIERS.map((tier) => (
            <span key={tier.id} className="inline-flex items-center gap-1.5 text-slate-300">
              <span
                className="w-2.5 h-2.5 rounded-full border border-white/20"
                style={{ backgroundColor: DEFAULT_TIER_COLORS[tier.id] }}
                aria-hidden="true"
              />
              {getTierCopy(tier.id, lang).name}
            </span>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          <div className={`grid grid-cols-1 ${compact ? 'sm:grid-cols-2' : 'sm:grid-cols-2'} gap-3`}>
            {TICKET_TIERS.map((tier) => {
              const activeHex = colors[tier.id];
              const draft = hexDrafts[tier.id];
              const normalizedDraft = normalizeHexColor(draft);
              const isDraftValid = normalizedDraft !== null;
              const previewHex = normalizedDraft || activeHex;
              const rawPrice = tierPrices?.[tier.id];
              const numericPrice = rawPrice !== undefined && rawPrice !== '' ? Number(rawPrice) : null;
              const tierCopy = getTierCopy(tier.id, lang);

              return (
                <div
                  key={tier.id}
                  className="rounded-lg p-3.5 border transition-colors space-y-3"
                  style={{
                    borderColor: hexToRgba(previewHex, 0.45),
                    backgroundColor: hexToRgba(previewHex, 0.08),
                  }}
                >
                  {/* Live Category Preview Header */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-3 h-3 rounded-full shrink-0 border border-white/30"
                        style={{ backgroundColor: previewHex }}
                        aria-hidden="true"
                      />
                      <span
                        className="text-xs font-bold tracking-wide"
                        style={{ color: previewHex }}
                      >
                        {tierCopy.name}
                      </span>
                      <span className="text-[11px] text-slate-400 truncate">
                        · {tierCopy.perk}
                      </span>
                    </div>
                    {numericPrice !== null && Number.isFinite(numericPrice) && (
                      <span className="font-mono-num text-[11px] font-semibold text-white shrink-0">
                        {formatCurrencyEgp(numericPrice, lang)}
                      </span>
                    )}
                  </div>

                  {/* Color Picker + Exact Hex Input */}
                  <div className="flex items-center gap-2">
                    <label className="relative w-9 h-9 rounded-md overflow-hidden border border-white/25 shrink-0 cursor-pointer">
                      <input
                        id={`${idPrefix}-picker-${tier.id}`}
                        type="color"
                        aria-label={`${tierCopy.name} ${t.hexCodeLabel}`}
                        value={isValidHexColor(previewHex) ? previewHex : DEFAULT_TIER_COLORS[tier.id]}
                        onChange={(e) => onChangeColor(tier.id, e.target.value.toUpperCase())}
                        className="absolute inset-0 w-14 h-14 -top-2 -start-2 cursor-pointer bg-transparent border-0"
                      />
                    </label>
                    <div className="flex-1 min-w-0">
                      <input
                        id={`${idPrefix}-hex-${tier.id}`}
                        type="text"
                        dir="ltr"
                        aria-label={`${tierCopy.name} ${t.hexCodeLabel}`}
                        maxLength={7}
                        value={draft}
                        onChange={(e) => {
                          const val = e.target.value.toUpperCase();
                          onChangeDraft(tier.id, val);
                          const norm = normalizeHexColor(val);
                          if (norm && val.trim().length >= 6) {
                            onChangeColor(tier.id, norm);
                          }
                        }}
                        onBlur={() => handleBlurDraft(tier.id)}
                        className={`w-full px-2.5 py-1.5 rounded-md bg-[#08090C] border text-xs font-mono-num uppercase text-white focus:outline-none ${
                          isDraftValid
                            ? 'border-white/15 focus:border-white/50'
                            : 'border-rose-500/70 focus:border-rose-400'
                        }`}
                      />
                    </div>
                  </div>

                  {!isDraftValid && (
                    <p className="text-[11px] text-rose-300">{t.invalidHexHint}</p>
                  )}

                  {/* Curated Swatches */}
                  <div
                    className="flex flex-wrap items-center gap-1.5"
                    role="group"
                    aria-label={`${tierCopy.name} ${t.hexCodeLabel}`}
                  >
                    {TIER_COLOR_SWATCHES.map((swatch) => {
                      const selected = previewHex.toUpperCase() === swatch.hex.toUpperCase();
                      const swatchName = getSwatchName(swatch.name, lang);
                      return (
                        <button
                          key={swatch.hex}
                          type="button"
                          title={`${swatchName} (${swatch.hex})`}
                          aria-label={`${tierCopy.name} — ${swatchName}`}
                          aria-pressed={selected}
                          onClick={() => onChangeColor(tier.id, swatch.hex)}
                          className={`w-5 h-5 rounded-full transition-transform ${
                            selected
                              ? 'ring-2 ring-white ring-offset-2 ring-offset-[#08090C] scale-110'
                              : 'border border-white/25 hover:scale-110'
                          }`}
                          style={{ backgroundColor: swatch.hex }}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
