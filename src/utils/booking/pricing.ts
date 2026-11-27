import type { Concert, Promo, TierId, TierPrices } from '../../types';

export const MAX_QTY_PER_ORDER = 20;

export function suggestTierPrices(silverPrice: number): TierPrices {
  const base = Math.max(50, Math.round(Number(silverPrice) || 200));
  const roundTen = (n: number) => Math.max(10, Math.round(n / 10) * 10);
  return {
    Silver: base,
    Gold: roundTen(base * 1.45),
    VIP: roundTen(base * 2.1),
    Lounge: roundTen(base * 3.2),
  };
}

export function getTierUnitPrice(concert: Pick<Concert, 'priceEgp' | 'tierPrices'>, tier: TierId): number {
  const mapped = concert.tierPrices?.[tier];
  if (typeof mapped === 'number' && Number.isFinite(mapped) && mapped >= 0) {
    return mapped;
  }
  const fallback = suggestTierPrices(concert.priceEgp);
  return fallback[tier];
}

export const ALL_PROMO_TIERS: readonly TierId[] = ['Silver', 'Gold', 'VIP', 'Lounge'];

export function normalizePromoTiers(tiers: readonly TierId[]): TierId[] {
  const validSet = new Set<TierId>();
  for (const tier of tiers) {
    if (ALL_PROMO_TIERS.includes(tier)) {
      validSet.add(tier);
    }
  }
  if (validSet.size === 0 || validSet.size === ALL_PROMO_TIERS.length) {
    return [];
  }
  return ALL_PROMO_TIERS.filter((tier) => validSet.has(tier));
}

export function togglePromoTier(currentTiers: readonly TierId[], tier: TierId): TierId[] {
  const normalized = normalizePromoTiers(currentTiers);
  if (normalized.length === 0) {
    return ALL_PROMO_TIERS.includes(tier) ? [tier] : [];
  }
  if (normalized.includes(tier)) {
    return normalizePromoTiers(normalized.filter((item) => item !== tier));
  }
  return normalizePromoTiers([...normalized, tier]);
}

function formatTierIdListEn(tiers: readonly TierId[]): string {
  if (tiers.length <= 1) return tiers[0] ?? '';
  if (tiers.length === 2) return `${tiers[0]} & ${tiers[1]}`;
  return `${tiers.slice(0, -1).join(', ')} & ${tiers[tiers.length - 1]}`;
}

export interface PromoEvaluation {
  valid: boolean;
  code: string;
  discountEgp: number;
  message: string;
  promo: Promo | null;
}

export function evaluatePromo(
  rawCode: string,
  tier: TierId,
  subtotalEgp: number,
  promos: Promo[],
): PromoEvaluation {
  const code = rawCode.trim().toUpperCase();
  if (!code) {
    return { valid: false, code: '', discountEgp: 0, message: '', promo: null };
  }
  const found = promos.find((p) => p.code.toUpperCase() === code && p.active);
  if (!found) {
    return {
      valid: false,
      code,
      discountEgp: 0,
      message: 'Promo code is invalid or currently inactive.',
      promo: null,
    };
  }
  const scopedTiers = Array.isArray(found.tiers) ? normalizePromoTiers(found.tiers) : [];
  if (scopedTiers.length > 0 && !scopedTiers.includes(tier)) {
    return {
      valid: false,
      code,
      discountEgp: 0,
      message: `${found.code} applies only to ${formatTierIdListEn(scopedTiers)} passes.`,
      promo: null,
    };
  }
  const rawDiscount =
    found.type === 'percent'
      ? Math.round((subtotalEgp * Math.min(90, found.value)) / 100)
      : Math.round(found.value);
  const discountEgp = Math.max(0, Math.min(subtotalEgp, rawDiscount));
  return {
    valid: true,
    code: found.code,
    discountEgp,
    message: `${found.label} applied (-${discountEgp.toLocaleString()} EGP)`,
    promo: found,
  };
}

export function calculateOrderTotals(
  concert: Pick<Concert, 'priceEgp' | 'tierPrices'>,
  tier: TierId,
  quantity: number,
  promoCode: string,
  promos: Promo[],
) {
  const safeQty = Math.max(1, Math.min(MAX_QTY_PER_ORDER, Math.floor(quantity || 1)));
  const unitPrice = getTierUnitPrice(concert, tier);
  const subtotalEgp = unitPrice * safeQty;
  const promoResult = evaluatePromo(promoCode, tier, subtotalEgp, promos);
  const discountEgp = promoResult.valid ? promoResult.discountEgp : 0;
  const totalEgp = Math.max(0, subtotalEgp - discountEgp);
  return {
    quantity: safeQty,
    unitPrice,
    subtotalEgp,
    discountEgp,
    totalEgp,
    promoResult,
  };
}

export const DEFAULT_CATEGORY_COLORS: Record<TierId, string> = {
  Silver: '#94A3B8',
  Gold: '#FBBF24',
  VIP: '#F43F5E',
  Lounge: '#22D3EE',
};

export function isValidHexColor(raw: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(raw.trim());
}

export function normalizeHexColor(raw: string): string | null {
  let cleaned = raw.trim();
  if (!cleaned) return null;
  if (!cleaned.startsWith('#')) {
    cleaned = `#${cleaned}`;
  }
  const shortMatch = /^#([0-9A-Fa-f]{3})$/.exec(cleaned);
  if (shortMatch) {
    const [r, g, b] = shortMatch[1].split('');
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  if (/^#[0-9A-Fa-f]{6}$/.test(cleaned)) {
    return cleaned.toUpperCase();
  }
  return null;
}

export function validateTierColors(colors: Partial<Record<TierId, string>>): {
  valid: boolean;
  normalized?: Record<TierId, string>;
  error?: string;
} {
  const tiers: TierId[] = ['Silver', 'Gold', 'VIP', 'Lounge'];
  const normalized = {} as Record<TierId, string>;
  for (const tier of tiers) {
    const raw = colors[tier];
    if (typeof raw !== 'string') {
      return { valid: false, error: `Missing hex color for ${tier} category.` };
    }
    const hex = normalizeHexColor(raw);
    if (!hex) {
      return {
        valid: false,
        error: `Invalid hex color for ${tier} ("${raw}"). Use #RRGGBB format (e.g. #FBBF24).`,
      };
    }
    normalized[tier] = hex;
  }
  return { valid: true, normalized };
}

export function getTierColorHex(
  concert: Pick<Concert, 'tierColors'> | null | undefined,
  tier: TierId,
): string {
  const candidate = concert?.tierColors?.[tier];
  if (typeof candidate === 'string') {
    const normalized = normalizeHexColor(candidate);
    if (normalized) return normalized;
  }
  return DEFAULT_CATEGORY_COLORS[tier];
}

export function hexToRgba(hex: string, alpha: number): string {
  const normalized = normalizeHexColor(hex) || '#94A3B8';
  const r = Number.parseInt(normalized.slice(1, 3), 16);
  const g = Number.parseInt(normalized.slice(3, 5), 16);
  const b = Number.parseInt(normalized.slice(5, 7), 16);
  const safeAlpha = Math.max(0, Math.min(1, Number.isFinite(alpha) ? alpha : 1));
  return `rgba(${r}, ${g}, ${b}, ${safeAlpha})`;
}
