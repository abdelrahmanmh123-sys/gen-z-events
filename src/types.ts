export type TierId = 'Silver' | 'Gold' | 'VIP' | 'Lounge';

export type OnlinePaymentMethodId = 'InstaPay' | 'Mobile Wallets';

export type PaymentMethodId = OnlinePaymentMethodId | 'Offline';

export type PaymentStatus = 'Pending' | 'Paid';

export type AdminRole = 'Super Admin' | 'Gate Staff';

export interface TierMeta {
  id: TierId;
  name: string;
  multiplier: number;
  perk: string;
  details: string;
  colorHex: string;
  accentText: string;
  accentBorder: string;
  accentBg: string;
}

export interface PaymentMethodMeta {
  id: OnlinePaymentMethodId;
  label: string;
  sub: string;
  destination: string;
  instructions: string;
}

export interface TierPrices {
  Silver: number;
  Gold: number;
  VIP: number;
  Lounge: number;
}

export interface TierColors {
  Silver: string;
  Gold: string;
  VIP: string;
  Lounge: string;
}

export interface Concert {
  id: string;
  title: string;
  artist: string;
  venue: string;
  isoDate: string;
  isoTime: string;
  date: string;
  time: string;
  doors: string;
  genre: string;
  priceEgp: number;
  tierPrices: TierPrices;
  tierColors?: TierColors;
  totalSeats: number;
  seatsLeft: number;
  description: string;
  posterUrl: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Booking {
  bookingCode: string;
  userId: string;
  concertId: string;
  concertTitle: string;
  concertDate: string;
  concertTime: string;
  concertVenue: string;
  tier: TierId;
  quantity: number;
  unitPrice: number;
  promoCode: string;
  discountEgp: number;
  totalEgp: number;
  paymentMethod: PaymentMethodId;
  transferRef: string;
  paymentStatus: PaymentStatus;
  checkedIn: boolean;
  checkedInCount?: number;
  checkedInAt: string;
  approvedBy: string;
  approvalMethod: string;
  customerName: string;
  customerMobile: string;
  customerEmail: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Promo {
  code: string;
  type: 'percent' | 'flat';
  value: number;
  tiers: TierId[];
  label: string;
  active: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  mobile: string;
  city: string;
  favoriteGenre: string;
  bio: string;
  favorites: string[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface WaitlistEntry {
  id: string;
  userId: string;
  concertId: string;
  concertTitle: string;
  name: string;
  mobile: string;
  email: string;
  createdAt?: unknown;
}

export interface AdminMember {
  id: string;
  name: string;
  email: string;
  role: AdminRole;
  addedBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface AdminSession {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: AdminRole;
  lastSeen?: unknown;
  createdAt?: unknown;
}

export interface PaymentConfig {
  id: string;
  instapayNumber: string;
  walletNumber: string;
  updatedBy?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type SortOption = 'date-asc' | 'price-asc' | 'price-desc';
