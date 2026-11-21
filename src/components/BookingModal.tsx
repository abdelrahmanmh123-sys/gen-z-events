import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  Calendar,
  Check,
  Clock,
  Copy,
  MapPin,
  Minus,
  Plus,
  Tag,
  X,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import { PAYMENT_METHODS, TICKET_TIERS } from '../data/defaults';
import { formatFriendlyFirebaseError } from '../firebase';
import { createBooking, createWaitlistEntry } from '../services/firestoreService';
import type { Concert, PaymentMethodId, Promo, TierId, UserProfile } from '../types';
import {
  calculateOrderTotals,
  generateBookingCode,
  getTierUnitPrice,
  isVerifiedFanAccount,
  MAX_QTY_PER_ORDER,
  normalizeEgyptianMobile,
  validateBookingInput,
  validateWaitlistInput,
} from '../utils/bookingLogic';
import { copyTextToClipboard } from '../utils/passExport';

interface BookingModalProps {
  concert: Concert | null;
  onClose: () => void;
  promos: Promo[];
  user: User | null;
  profile: UserProfile | null;
  isLiveInDb: boolean;
  onRequireAuth: () => void;
  onBookingCreated: (bookingCode: string) => void;
  onNotify: (msg: string) => void;
}

export const BookingModal: React.FC<BookingModalProps> = ({
  concert,
  onClose,
  promos,
  user,
  profile,
  isLiveInDb,
  onRequireAuth,
  onBookingCreated,
  onNotify,
}) => {
  const [selectedTier, setSelectedTier] = useState<TierId>('Silver');
  const [quantity, setQuantity] = useState(1);
  const [promoInput, setPromoInput] = useState('');
  const [appliedPromo, setAppliedPromo] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodId>('InstaPay');
  const [transferRef, setTransferRef] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerMobile, setCustomerMobile] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const concertId = concert?.id ?? null;

  useEffect(() => {
    if (concertId) {
      setSelectedTier('Silver');
      setQuantity(1);
      setPromoInput('');
      setAppliedPromo('');
      setPaymentMethod('InstaPay');
      setTransferRef('');
      setErrorMsg('');
      setCustomerName(profile?.displayName || user?.displayName || '');
      setCustomerMobile(profile?.mobile || '');
      setCustomerEmail(profile?.email || user?.email || '');
    }
  }, [concertId]);

  // Prefill holder details if user signs in or profile loads while modal is open (without overwriting edits)
  useEffect(() => {
    if (!concertId) return;
    if (!customerName && (profile?.displayName || user?.displayName)) {
      setCustomerName(profile?.displayName || user?.displayName || '');
    }
    if (!customerMobile && profile?.mobile) {
      setCustomerMobile(profile.mobile);
    }
    if (!customerEmail && (profile?.email || user?.email)) {
      setCustomerEmail(profile?.email || user?.email || '');
    }
  }, [concertId, user, profile]);

  useEffect(() => {
    if (!concertId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [concertId, onClose]);

  if (!concert) return null;

  const isVerifiedUser = isVerifiedFanAccount(user);
  const soldOut = concert.seatsLeft <= 0;
  const maxSelectable = MAX_QTY_PER_ORDER;
  const totals = calculateOrderTotals(concert, selectedTier, quantity, appliedPromo, promos);
  const activePayment = PAYMENT_METHODS.find((m) => m.id === paymentMethod) || PAYMENT_METHODS[0];

  const handleApplyPromo = () => {
    setAppliedPromo(promoInput.trim().toUpperCase());
  };

  const handleClearPromo = () => {
    setPromoInput('');
    setAppliedPromo('');
  };

  const handleCopyDestination = () => {
    void copyTextToClipboard(activePayment.destination).then(() => {
      onNotify(`Copied ${activePayment.label} number: ${activePayment.destination}`);
    });
  };

  const handleJoinWaitlist = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (!user || !isVerifiedUser) {
      onRequireAuth();
      return;
    }
    if (!isLiveInDb) {
      setErrorMsg('Concert catalog is initializing. An admin must sign in once to publish the live lineup.');
      return;
    }
    const waitlistCheck = validateWaitlistInput({
      name: customerName,
      mobile: customerMobile,
      email: customerEmail,
    });
    if (!waitlistCheck.valid || !waitlistCheck.normalized) {
      setErrorMsg(waitlistCheck.error || 'Please enter your name and valid Egyptian mobile number.');
      return;
    }
    setSubmitting(true);
    try {
      const id = `wl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      await createWaitlistEntry({
        id,
        userId: user.uid,
        concertId: concert.id,
        concertTitle: concert.title,
        name: waitlistCheck.normalized.name.slice(0, 100),
        mobile: waitlistCheck.normalized.mobile.slice(0, 30),
        email: waitlistCheck.normalized.email.slice(0, 120),
      });
      onNotify(`Added to waitlist for ${concert.title}.`);
      onClose();
    } catch (err) {
      setErrorMsg(formatFriendlyFirebaseError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (!user || !isVerifiedUser) {
      onRequireAuth();
      return;
    }
    if (!isLiveInDb) {
      setErrorMsg('Live catalog is waiting for initial admin sync. Sign in as Lead Organizer to publish.');
      return;
    }

    const validation = validateBookingInput({
      customerName,
      customerMobile,
      customerEmail,
      transferRef,
      quantity,
      seatsLeft: concert.seatsLeft,
    });
    if (!validation.valid) {
      setErrorMsg(validation.error || 'Please review your booking details.');
      return;
    }

    setSubmitting(true);
    try {
      const bookingCode = generateBookingCode();
      await createBooking({
        bookingCode,
        userId: user.uid,
        concertId: concert.id,
        concertTitle: concert.title,
        concertDate: concert.date,
        concertTime: concert.time,
        concertVenue: concert.venue,
        tier: selectedTier,
        quantity: totals.quantity,
        unitPrice: totals.unitPrice,
        promoCode: totals.promoResult.valid ? totals.promoResult.code : '',
        discountEgp: totals.discountEgp,
        totalEgp: totals.totalEgp,
        paymentMethod,
        transferRef: transferRef.trim().slice(0, 80),
        paymentStatus: 'Pending',
        checkedIn: false,
        checkedInAt: '',
        approvedBy: '',
        approvalMethod: '',
        customerName: customerName.trim().slice(0, 100),
        customerMobile: normalizeEgyptianMobile(customerMobile).slice(0, 30),
        customerEmail: customerEmail.trim().toLowerCase().slice(0, 120),
      });
      onBookingCreated(bookingCode);
      onClose();
    } catch (err) {
      setErrorMsg(formatFriendlyFirebaseError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-label={`Book passes for ${concert.title}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-2xl max-h-[90vh] bg-[#101218] border border-white/15 rounded-xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/10 flex items-start justify-between gap-4 shrink-0">
          <div className="space-y-1">
            <p className="text-[11px] font-mono-num uppercase tracking-[0.16em] text-rose-400 font-semibold">
              {concert.genre}
              {soldOut ? ' · Sold Out' : ''}
            </p>
            <h2 className="font-display font-bold text-xl text-white">{concert.title}</h2>
            <p className="text-xs text-slate-400">
              {concert.artist} · {concert.venue}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close booking modal"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {soldOut ? (
          <form onSubmit={handleJoinWaitlist} className="p-6 overflow-y-auto space-y-4">
            <div className="p-4 rounded-lg border border-amber-400/30 bg-amber-400/10 text-xs text-amber-100 leading-relaxed">
              All seats for <strong>{concert.title}</strong> are currently spoken for. Join the Qena Waitlist and our staff will message you immediately if extra passes are released.
            </div>
            {errorMsg && (
              <div className="p-3 rounded-lg border border-rose-500/35 bg-rose-500/10 text-xs text-rose-200 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="wl-name" className="block text-xs font-medium text-slate-300 mb-1.5">
                  Full Name
                </label>
                <input
                  id="wl-name"
                  type="text"
                  required
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg bg-[#08090C] border border-white/12 text-sm text-white"
                />
              </div>
              <div>
                <label htmlFor="wl-mobile" className="block text-xs font-medium text-slate-300 mb-1.5">
                  Mobile Number
                </label>
                <input
                  id="wl-mobile"
                  type="tel"
                  required
                  value={customerMobile}
                  onChange={(e) => setCustomerMobile(e.target.value)}
                  placeholder="010XXXXXXXX"
                  className="w-full px-3.5 py-2.5 rounded-lg bg-[#08090C] border border-white/12 text-sm text-white font-mono-num"
                />
              </div>
            </div>
            <div>
              <label htmlFor="wl-email" className="block text-xs font-medium text-slate-300 mb-1.5">
                Email Address
              </label>
              <input
                id="wl-email"
                type="email"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg bg-[#08090C] border border-white/12 text-sm text-white"
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 rounded-lg bg-rose-600 hover:bg-rose-500 disabled:opacity-60 text-sm font-semibold text-white"
            >
              {!user
                ? 'Sign In to Join Waitlist'
                : !isVerifiedUser
                  ? 'Verify Email to Join Waitlist'
                  : submitting
                    ? 'Joining...'
                    : 'Join Sold-Out Waitlist'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleConfirmBooking} className="flex flex-col flex-1 min-h-0">
            {/* Scrollable Form Body */}
            <div className="p-6 overflow-y-auto space-y-5 flex-1">
              {/* Show Metadata Strip */}
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-300 bg-[#08090C] border border-white/8 rounded-lg px-4 py-2.5">
                <span className="inline-flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-rose-400" />
                  {concert.date}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-rose-400" />
                  Show {concert.time} (Doors {concert.doors})
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-rose-400" />
                  {concert.venue}
                </span>
              </div>

              {errorMsg && (
                <div className="p-3 rounded-lg border border-rose-500/35 bg-rose-500/10 text-xs text-rose-200 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Step 1: Select Tier */}
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  1. Select Pass Tier
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {TICKET_TIERS.map((tier) => {
                    const price = getTierUnitPrice(concert, tier.id);
                    const active = selectedTier === tier.id;
                    return (
                      <button
                        key={tier.id}
                        type="button"
                        onClick={() => setSelectedTier(tier.id)}
                        className={`text-left p-3 rounded-lg border transition-all ${
                          active
                            ? `${tier.accentBorder} ${tier.accentBg}`
                            : 'border-white/10 bg-[#08090C] hover:border-white/25'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className={`text-xs font-bold ${active ? tier.accentText : 'text-white'}`}>
                            {tier.name}
                          </span>
                          {active && <Check className="w-3.5 h-3.5 text-white shrink-0" />}
                        </div>
                        <p className="font-mono-num text-base font-bold text-white mt-1.5">
                          {price.toLocaleString()} <span className="text-[11px] font-normal text-slate-400">EGP</span>
                        </p>
                        <p className="text-[11px] text-slate-400 mt-1 leading-snug">{tier.perk}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Step 2: Quantity & Promo */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-end">
                <div className="sm:col-span-4 space-y-1.5">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                    2. Quantity
                  </label>
                  <div className="flex items-center justify-between bg-[#08090C] border border-white/12 rounded-lg px-2 py-1.5">
                    <button
                      type="button"
                      onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                      disabled={quantity <= 1}
                      aria-label="Decrease ticket quantity"
                      className="w-8 h-8 rounded-md flex items-center justify-center text-slate-200 hover:bg-white/10 disabled:opacity-40"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <span className="font-mono-num text-base font-bold text-white">{quantity}</span>
                    <button
                      type="button"
                      onClick={() => setQuantity((q) => Math.min(maxSelectable, q + 1))}
                      disabled={quantity >= maxSelectable}
                      aria-label="Increase ticket quantity"
                      className="w-8 h-8 rounded-md flex items-center justify-center text-slate-200 hover:bg-white/10 disabled:opacity-40"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="sm:col-span-8 space-y-1.5">
                  <label htmlFor="booking-promo" className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Promo Code (Optional)
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="booking-promo"
                      type="text"
                      maxLength={32}
                      value={promoInput}
                      onChange={(e) => setPromoInput(e.target.value.toUpperCase())}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleApplyPromo();
                        }
                      }}
                      placeholder="Try GENZ15 or VIP100"
                      className="flex-1 px-3.5 py-2.5 rounded-lg bg-[#08090C] border border-white/12 text-sm text-white font-mono-num uppercase placeholder:text-slate-500 focus:outline-none focus:border-rose-500"
                    />
                    <button
                      type="button"
                      onClick={handleApplyPromo}
                      className="px-4 py-2.5 rounded-lg border border-white/15 bg-white/[0.06] hover:bg-white/[0.12] text-xs font-semibold text-white whitespace-nowrap"
                    >
                      Apply
                    </button>
                    {appliedPromo && (
                      <button
                        type="button"
                        onClick={handleClearPromo}
                        className="px-3 py-2.5 rounded-lg border border-white/10 text-xs text-slate-400 hover:text-white whitespace-nowrap"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {promoInput.trim() && promoInput.trim().toUpperCase() !== appliedPromo && (
                <p className="text-xs text-slate-400">
                  Press Apply to activate promo code <span className="font-mono-num text-white">{promoInput.trim().toUpperCase()}</span>.
                </p>
              )}

              {appliedPromo && (
                <p
                  className={`text-xs flex items-center gap-1.5 ${
                    totals.promoResult.valid ? 'text-emerald-400' : 'text-amber-300'
                  }`}
                >
                  <Tag className="w-3.5 h-3.5" />
                  {totals.promoResult.message}
                </p>
              )}

              {/* Step 3: Payment Method */}
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  3. Payment Transfer Method
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {PAYMENT_METHODS.map((pm) => {
                    const active = paymentMethod === pm.id;
                    return (
                      <button
                        key={pm.id}
                        type="button"
                        onClick={() => setPaymentMethod(pm.id)}
                        className={`text-left p-3 rounded-lg border transition-colors ${
                          active
                            ? 'border-rose-500 bg-rose-500/10'
                            : 'border-white/10 bg-[#08090C] hover:border-white/25'
                        }`}
                      >
                        <p className="text-sm font-semibold text-white">{pm.label}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{pm.sub}</p>
                      </button>
                    );
                  })}
                </div>

                <div className="p-3.5 rounded-lg bg-[#08090C] border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-xs text-slate-300 leading-relaxed">
                      {activePayment.instructions}
                    </p>
                    <p className="text-xs font-mono-num font-bold text-rose-400">
                      Send to: {activePayment.destination}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyDestination}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-white/12 bg-white/[0.05] hover:bg-white/[0.1] text-xs font-semibold text-white shrink-0 self-start sm:self-center"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    Copy Number
                  </button>
                </div>

                <div>
                  <label htmlFor="booking-ref" className="block text-xs font-medium text-slate-300 mb-1.5">
                    Transfer Reference / Sender Mobile <span className="text-rose-400">*</span>
                  </label>
                  <input
                    id="booking-ref"
                    type="text"
                    required
                    maxLength={80}
                    value={transferRef}
                    onChange={(e) => setTransferRef(e.target.value)}
                    placeholder="e.g. IP-948210 or 010XXXXXXXX"
                    className="w-full px-3.5 py-2.5 rounded-lg bg-[#08090C] border border-white/12 text-sm text-white font-mono-num placeholder:text-slate-500 focus:outline-none focus:border-rose-500"
                  />
                </div>
              </div>

              {/* Step 4: Ticket Holder Details */}
              <div className="space-y-2.5">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  4. Ticket Holder Details
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label htmlFor="holder-name" className="block text-xs font-medium text-slate-300 mb-1.5">
                      Full Name
                    </label>
                    <input
                      id="holder-name"
                      type="text"
                      required
                      maxLength={100}
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Full Name"
                      className="w-full px-3 py-2 rounded-lg bg-[#08090C] border border-white/12 text-sm text-white focus:outline-none focus:border-rose-500"
                    />
                  </div>
                  <div>
                    <label htmlFor="holder-mobile" className="block text-xs font-medium text-slate-300 mb-1.5">
                      Mobile
                    </label>
                    <input
                      id="holder-mobile"
                      type="tel"
                      required
                      maxLength={30}
                      value={customerMobile}
                      onChange={(e) => setCustomerMobile(e.target.value)}
                      placeholder="010XXXXXXXX"
                      className="w-full px-3 py-2 rounded-lg bg-[#08090C] border border-white/12 text-sm text-white font-mono-num focus:outline-none focus:border-rose-500"
                    />
                  </div>
                  <div>
                    <label htmlFor="holder-email" className="block text-xs font-medium text-slate-300 mb-1.5">
                      Email
                    </label>
                    <input
                      id="holder-email"
                      type="email"
                      required
                      maxLength={120}
                      value={customerEmail}
                      onChange={(e) => setCustomerEmail(e.target.value)}
                      placeholder="you@gmail.com"
                      className="w-full px-3 py-2 rounded-lg bg-[#08090C] border border-white/12 text-sm text-white focus:outline-none focus:border-rose-500"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Pinned Sticky Order Summary & Primary CTA */}
            <div className="px-6 py-4 border-t border-white/12 bg-[#0B0D12] shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <span>
                    {totals.quantity}x {selectedTier} Pass
                  </span>
                  {totals.discountEgp > 0 && (
                    <span className="font-mono-num text-emerald-400 font-semibold">
                      (-{totals.discountEgp.toLocaleString()} EGP {totals.promoResult.code})
                    </span>
                  )}
                </div>
                <p className="font-mono-num text-xl font-bold text-white leading-tight">
                  {totals.totalEgp.toLocaleString()} EGP
                </p>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="sm:w-auto w-full px-6 py-3 rounded-lg bg-rose-600 hover:bg-rose-500 disabled:opacity-60 text-sm font-semibold text-white transition-colors whitespace-nowrap"
              >
                {!user
                  ? 'Sign In to Reserve'
                  : !isVerifiedUser
                    ? 'Verify Email to Reserve'
                    : submitting
                      ? 'Submitting...'
                      : `Reserve ${totals.quantity} ${selectedTier} Pass${totals.quantity > 1 ? 'es' : ''}`}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
