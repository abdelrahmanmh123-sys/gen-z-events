import type { PaymentMethodMeta, TierColors, TierMeta } from '../types';

export const PRIMARY_ADMIN_EMAIL = 'weentamalak@gmail.com';
export const HERO_IMAGE_PATH = '/assets/hero-qena.jpg';
export const BRAND_LOGO_PATH = '/assets/aistudio/IMG-20261121-WA0042_bdfb946a.jpg';

export const DEFAULT_TIER_COLORS: TierColors = {
  Silver: '#94A3B8',
  Gold: '#FBBF24',
  VIP: '#F43F5E',
  Lounge: '#22D3EE',
};

export const TIER_COLOR_SWATCHES: ReadonlyArray<{ name: string; hex: string }> = [
  { name: 'Slate Silver', hex: '#94A3B8' },
  { name: 'Pure Ice', hex: '#E2E8F0' },
  { name: 'Amber Gold', hex: '#FBBF24' },
  { name: 'Sunset Orange', hex: '#FB923C' },
  { name: 'Stage Rose', hex: '#F43F5E' },
  { name: 'Electric Violet', hex: '#A78BFA' },
  { name: 'Nile Cyan', hex: '#22D3EE' },
  { name: 'Emerald Mint', hex: '#34D399' },
];

export const TICKET_TIERS: TierMeta[] = [
  {
    id: 'Silver',
    name: 'Silver',
    multiplier: 1.0,
    perk: 'Main Arena Standing',
    details: 'Full stage sightlines, general festival gate entry, and arena bar access.',
    colorHex: '#94a3b8',
    accentText: 'text-slate-200',
    accentBorder: 'border-slate-400/50',
    accentBg: 'bg-slate-400/10',
  },
  {
    id: 'Gold',
    name: 'Gold',
    multiplier: 1.45,
    perk: 'Front Pit + Fast Track',
    details: 'Dedicated front-of-stage pit zone with express wristband check-in lane.',
    colorHex: '#fbbf24',
    accentText: 'text-amber-300',
    accentBorder: 'border-amber-400/50',
    accentBg: 'bg-amber-400/10',
  },
  {
    id: 'VIP',
    name: 'VIP',
    multiplier: 2.1,
    perk: 'Elevated Deck + Priority Gate',
    details: 'Raised acoustic viewing deck, private restrooms, and priority entry gate.',
    colorHex: '#f43f5e',
    accentText: 'text-rose-300',
    accentBorder: 'border-rose-400/50',
    accentBg: 'bg-rose-500/10',
  },
  {
    id: 'Lounge',
    name: 'Lounge',
    multiplier: 3.2,
    perk: 'Private Table + Host Service',
    details: 'Reserved lounge table for your group with dedicated host & welcome refreshments.',
    colorHex: '#22d3ee',
    accentText: 'text-cyan-300',
    accentBorder: 'border-cyan-400/50',
    accentBg: 'bg-cyan-400/10',
  },
];

export const PAYMENT_PHONE_NUMBER = '01041062000';
export const PAYMENT_WHATSAPP_NUMBER = '201041062000';

export const PAYMENT_METHODS: PaymentMethodMeta[] = [
  {
    id: 'InstaPay',
    label: 'InstaPay',
    sub: 'Instant bank or IPA transfer',
    destination: PAYMENT_PHONE_NUMBER,
    instructions:
      'Transfer the total via InstaPay to 01041062000 and paste your transfer reference or sender mobile below.',
  },
  {
    id: 'Mobile Wallets',
    label: 'Mobile Wallets',
    sub: 'Vodafone, Orange, Etisalat, WE Pay',
    destination: PAYMENT_PHONE_NUMBER,
    instructions:
      'Send the total from any Egyptian Mobile Wallet to 01041062000 and enter your SMS receipt reference or wallet number.',
  },
];
