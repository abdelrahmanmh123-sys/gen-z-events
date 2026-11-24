import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  Calendar,
  Check,
  Clock,
  Copy,
  MapPin,
  Minus,
  Pencil,
  Plus,
  Save,
  Shield,
  Tag,
  X,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import { PAYMENT_METHODS, TICKET_TIERS } from '../data/defaults';
import { formatFriendlyFirebaseError } from '../firebase';
import {
  adminSavePaymentConfig,
  createBooking,
  createWaitlistEntry,
} from '../services/firestoreService';
import type {
  Concert,
  OnlinePaymentMethodId,
  PaymentConfig,
  Promo,
  TierId,
  UserProfile,
} from '../types';
import {
  calculateOrderTotals,
  DEFAULT_PAYMENT_CONFIG,
  generateBookingCode,
  getTierColorHex,
  getTierUnitPrice,
  hexToRgba,
  isVerifiedFanAccount,
  MAX_QTY_PER_ORDER,
  normalizeEgyptianMobile,
  toAsciiDigits,
  validateBookingInput,
  validatePaymentConfigInput,
  validateWaitlistInput,
} from '../utils/bookingLogic';
import { copyTextToClipboard } from '../utils/passExport';
import { useLanguage } from '../i18n/LanguageContext';
import {
  buildPaymentMethodCopy,
  formatCurrencyEgp,
  getGenreLabel,
  getTierCopy,
  localizeKnownMessage,
} from '../i18n/translations';

interface BookingModalProps {
  concert: Concert | null;
  onClose: () => void;
  promos: Promo[];
  paymentConfig?: PaymentConfig;
  isSuperAdmin?: boolean;
  adminName?: string;
  user: User | null;
  profile: UserProfile | null;
  onRequireAuth: () => void;
  onBookingCreated: (bookingCode: string) => void;
  onNotify: (msg: string) => void;
}

export const BookingModal: React.FC<BookingModalProps> = ({
  concert,
  onClose,
  promos,
  paymentConfig = DEFAULT_PAYMENT_CONFIG,
  isSuperAdmin = false,
  adminName = 'Super Admin',
  user,
  profile,
  onRequireAuth,
  onBookingCreated,
  onNotify,
}) => {
  const { lang, t } = useLanguage();
  const [selectedTier, setSelectedTier] = useState<TierId>('Silver');
  const [quantity, setQuantity] = useState(1);
  const [promoInput, setPromoInput] = useState('');
  const [appliedPromo, setAppliedPromo] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<OnlinePaymentMethodId>('InstaPay');
  const [transferRef, setTransferRef] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerMobile, setCustomerMobile] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Super Admin inline editor for InstaPay & Vodafone Cash numbers
  const [editingPaymentNumbers, setEditingPaymentNumbers] = useState(false);
  const [instapayDraft, setInstapayDraft] = useState(paymentConfig.instapayNumber);
  const [walletDraft, setWalletDraft] = useState(paymentConfig.walletNumber);
  const [paymentEditorError, setPaymentEditorError] = useState('');
  const [savingPaymentNumbers, setSavingPaymentNumbers] = useState(false);

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
      setEditingPaymentNumbers(false);
      setPaymentEditorError('');
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

  const liveSeatsLeft = concert?.seatsLeft ?? 0;
  const maxSelectable = Math.max(1, Math.min(MAX_QTY_PER_ORDER, liveSeatsLeft));

  useEffect(() => {
    if (liveSeatsLeft > 0 && quantity > maxSelectable) {
      setQuantity(maxSelectable);
    }
  }, [liveSeatsLeft, maxSelectable, quantity]);

  if (!concert) return null;

  const isVerifiedUser = isVerifiedFanAccount(user);
  const soldOut = concert.seatsLeft <= 0;
  const totals = calculateOrderTotals(concert, selectedTier, quantity, appliedPromo, promos);
  const activePayment = buildPaymentMethodCopy(paymentMethod, lang, paymentConfig);
  const selectedTierLabel = getTierCopy(selectedTier, lang).name;

  const handleTogglePaymentEditor = () => {
    if (!isSuperAdmin) return;
    if (!editingPaymentNumbers) {
      setInstapayDraft(paymentConfig.instapayNumber);
      setWalletDraft(paymentConfig.walletNumber);
      setPaymentEditorError('');
      setEditingPaymentNumbers(true);
    } else {
      setEditingPaymentNumbers(false);
      setPaymentEditorError('');
    }
  };

  const handleSavePaymentNumbers = async () => {
    if (!isSuperAdmin || savingPaymentNumbers) return;
    setPaymentEditorError('');
    const check = validatePaymentConfigInput({
      instapayNumber: instapayDraft,
      walletNumber: walletDraft,
    });
    if (!check.valid) {
      setPaymentEditorError(lang === 'ar' ? check.errorAr : check.errorEn);
      return;
    }
    setSavingPaymentNumbers(true);
    try {
      await adminSavePaymentConfig(check.normalized, adminName || user?.email || 'Super Admin');
      setEditingPaymentNumbers(false);
      onNotify(t.paymentNumbersUpdatedToast);
    } catch (err) {
      setPaymentEditorError(localizeKnownMessage(formatFriendlyFirebaseError(err), lang));
    } finally {
      setSavingPaymentNumbers(false);
    }
  };

  const handleApplyPromo = () => {
    setAppliedPromo(promoInput.trim().toUpperCase());
  };

  const handleClearPromo = () => {
    setPromoInput('');
    setAppliedPromo('');
  };

  const handleCopyDestination = () => {
    void copyTextToClipboard(activePayment.destination).then(() => {
      onNotify(`${t.copiedNumberPrefix} ${activePayment.label}: ${activePayment.destination}`);
    });
  };

  const handleJoinWaitlist = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (!user || !isVerifiedUser) {
      onRequireAuth();
      return;
    }
    const waitlistCheck = validateWaitlistInput({
      name: customerName,
      mobile: customerMobile,
      email: customerEmail,
    });
    if (!waitlistCheck.valid || !waitlistCheck.normalized) {
      setErrorMsg(
        localizeKnownMessage(
          waitlistCheck.error || 'Please enter a valid Egyptian mobile number.',
          lang,
        ),
      );
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
      onNotify(`${t.addedWaitlistPrefix} ${concert.title}.`);
      onClose();
    } catch (err) {
      setErrorMsg(localizeKnownMessage(formatFriendlyFirebaseError(err), lang));
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

    const validation = validateBookingInput({
      customerName,
      customerMobile,
      customerEmail,
      transferRef,
      quantity,
      seatsLeft: concert.seatsLeft,
    });
    if (!validation.valid) {
      setErrorMsg(
        localizeKnownMessage(
          validation.error || 'Please enter your full name (2–100 characters).',
          lang,
        ),
      );
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
        checkedInCount: 0,
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
      setErrorMsg(localizeKnownMessage(formatFriendlyFirebaseError(err), lang));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-label={`${t.bookPass} — ${concert.title}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-2xl max-h-[90vh] bg-[#101218] border border-white/15 rounded-xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/10 flex items-start justify-between gap-4 shrink-0">
          <div className="space-y-1">
            <p className="text-[11px] font-mono-num uppercase tracking-[0.16em] text-neutral-400 font-semibold">
              {getGenreLabel(concert.genre, lang)}
              {soldOut ? ` · ${t.soldOut}` : ''}
            </p>
            <h2 className="font-display font-bold text-xl text-white">{concert.title}</h2>
            <p className="text-xs text-slate-400">
              {concert.artist} · {concert.venue}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.closeBookingAria}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {soldOut ? (
          <form onSubmit={handleJoinWaitlist} className="p-6 overflow-y-auto space-y-4">
            <div className="p-4 rounded-lg border border-amber-400/30 bg-amber-400/10 text-xs text-amber-100 leading-relaxed">
              {t.waitlistNoticeStart} <strong>{concert.title}</strong> {t.waitlistNoticeEnd}
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
                  {t.fullName}
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
                  {t.mobileNumber}
                </label>
                <input
                  id="wl-mobile"
                  type="tel"
                  dir="ltr"
                  required
                  value={customerMobile}
                  onChange={(e) => setCustomerMobile(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg bg-[#08090C] border border-white/12 text-sm text-white font-mono-num"
                />
              </div>
            </div>
            <div>
              <label htmlFor="wl-email" className="block text-xs font-medium text-slate-300 mb-1.5">
                {t.emailAddress}
              </label>
              <input
                id="wl-email"
                type="email"
                dir="ltr"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg bg-[#08090C] border border-white/12 text-sm text-white"
              />
            </div>
            <button
              type={!user || !isVerifiedUser ? 'button' : 'submit'}
              onClick={!user || !isVerifiedUser ? onRequireAuth : undefined}
              disabled={submitting}
              className="w-full py-3 rounded-lg bg-white hover:bg-neutral-200 disabled:opacity-60 text-sm font-semibold text-[#08090C] transition-colors"
            >
              {!user
                ? t.signInToWaitlist
                : !isVerifiedUser
                  ? t.verifyToWaitlist
                  : submitting
                    ? t.joining
                    : t.joinSoldOutWaitlist}
            </button>
          </form>
        ) : (
          <form onSubmit={handleConfirmBooking} className="flex flex-col flex-1 min-h-0">
            {/* Scrollable Form Body */}
            <div className="p-6 overflow-y-auto space-y-5 flex-1">
              {/* Show Metadata Strip */}
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-300 bg-[#08090C] border border-white/8 rounded-lg px-4 py-2.5">
                <span className="inline-flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-neutral-300" />
                  <span dir="ltr">{concert.date}</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-neutral-300" />
                  <span>
                    {t.showLabel} <span dir="ltr">{concert.time}</span> ({t.doorsLabel}{' '}
                    <span dir="ltr">{concert.doors}</span>)
                  </span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-neutral-300" />
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
                  {t.step1SelectTier}
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {TICKET_TIERS.map((tier) => {
                    const price = getTierUnitPrice(concert, tier.id);
                    const active = selectedTier === tier.id;
                    const tierHex = getTierColorHex(concert, tier.id);
                    const tierCopy = getTierCopy(tier.id, lang);
                    return (
                      <button
                        key={tier.id}
                        type="button"
                        aria-pressed={active}
                        onClick={() => setSelectedTier(tier.id)}
                        className={`text-start p-3 rounded-lg border transition-all ${
                          active
                            ? ''
                            : 'border-white/10 bg-[#08090C] hover:border-white/25'
                        }`}
                        style={
                          active
                            ? {
                                borderColor: tierHex,
                                backgroundColor: hexToRgba(tierHex, 0.14),
                              }
                            : undefined
                        }
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="inline-flex items-center gap-1.5 min-w-0">
                            <span
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: tierHex }}
                              aria-hidden="true"
                            />
                            <span
                              className="text-xs font-bold truncate"
                              style={{ color: active ? tierHex : '#FFFFFF' }}
                            >
                              {tierCopy.name}
                            </span>
                          </span>
                          {active && <Check className="w-3.5 h-3.5 text-white shrink-0" />}
                        </div>
                        <p className="font-modern-price text-base font-bold tracking-tight rtl:tracking-normal text-white mt-1.5">
                          {formatCurrencyEgp(price, lang)}
                        </p>
                        <p className="text-[11px] text-slate-400 mt-1 leading-snug">{tierCopy.perk}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Step 2: Quantity & Promo */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-end">
                <div className="sm:col-span-4 space-y-1.5">
                  <label
                    htmlFor="booking-quantity"
                    className="block text-xs font-semibold uppercase tracking-wider text-slate-400"
                  >
                    {t.step2Quantity}
                  </label>
                  <div className="flex items-center justify-between bg-[#08090C] border border-white/12 rounded-lg px-2 py-1.5">
                    <button
                      type="button"
                      onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                      disabled={quantity <= 1}
                      aria-label={t.decreaseQtyAria}
                      className="w-8 h-8 rounded-md flex items-center justify-center text-slate-200 hover:bg-white/10 disabled:opacity-40"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <input
                      id="booking-quantity"
                      type="text"
                      inputMode="numeric"
                      dir="ltr"
                      aria-label={t.step2Quantity}
                      value={quantity}
                      onChange={(e) => {
                        const digits = toAsciiDigits(e.target.value).replace(/\D/g, '');
                        if (!digits) return;
                        const parsed = Number.parseInt(digits, 10);
                        if (Number.isFinite(parsed)) {
                          setQuantity(Math.max(1, Math.min(maxSelectable, parsed)));
                        }
                      }}
                      className="w-12 text-center bg-transparent font-mono-num text-base font-bold text-white focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setQuantity((q) => Math.min(maxSelectable, q + 1))}
                      disabled={quantity >= maxSelectable}
                      aria-label={t.increaseQtyAria}
                      className="w-8 h-8 rounded-md flex items-center justify-center text-slate-200 hover:bg-white/10 disabled:opacity-40"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="sm:col-span-8 space-y-1.5">
                  <label htmlFor="booking-promo" className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                    {t.promoCodeOptional}
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="booking-promo"
                      type="text"
                      dir="ltr"
                      maxLength={32}
                      value={promoInput}
                      onChange={(e) => setPromoInput(e.target.value.toUpperCase())}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleApplyPromo();
                        }
                      }}
                      className="flex-1 px-3.5 py-2.5 rounded-lg bg-[#08090C] border border-white/12 text-sm text-white font-mono-num uppercase focus:outline-none focus:border-white/50"
                    />
                    <button
                      type="button"
                      onClick={handleApplyPromo}
                      className="px-4 py-2.5 rounded-lg border border-white/15 bg-white/[0.06] hover:bg-white/[0.12] text-xs font-semibold text-white whitespace-nowrap"
                    >
                      {t.apply}
                    </button>
                    {appliedPromo && (
                      <button
                        type="button"
                        onClick={handleClearPromo}
                        className="px-3 py-2.5 rounded-lg border border-white/10 text-xs text-slate-400 hover:text-white whitespace-nowrap"
                      >
                        {t.clear}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {promoInput.trim() && promoInput.trim().toUpperCase() !== appliedPromo && (
                <p className="text-xs text-slate-400">
                  {t.pressApplyHintPrefix}{' '}
                  <span className="font-mono-num text-white" dir="ltr">
                    {promoInput.trim().toUpperCase()}
                  </span>
                  .
                </p>
              )}

              {appliedPromo && (
                <p
                  className={`text-xs flex items-center gap-1.5 ${
                    totals.promoResult.valid ? 'text-emerald-400' : 'text-amber-300'
                  }`}
                >
                  <Tag className="w-3.5 h-3.5" />
                  {localizeKnownMessage(totals.promoResult.message, lang)}
                </p>
              )}

              {/* Step 3: Payment Method */}
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    {t.step3PaymentMethod}
                  </p>
                  {isSuperAdmin && (
                    <button
                      type="button"
                      onClick={handleTogglePaymentEditor}
                      aria-expanded={editingPaymentNumbers}
                      aria-label={t.editPaymentNumbersAria}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-amber-400/35 bg-amber-400/10 hover:bg-amber-400/20 text-[11px] font-semibold text-amber-200 transition-colors"
                    >
                      <Pencil className="w-3 h-3" />
                      {editingPaymentNumbers ? t.cancelBtn : t.editPaymentNumbers}
                    </button>
                  )}
                </div>

                {isSuperAdmin && editingPaymentNumbers && (
                  <div className="p-4 rounded-lg border border-amber-400/35 bg-amber-400/[0.06] space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-0.5">
                        <p className="text-xs font-semibold text-amber-200 flex items-center gap-1.5">
                          <Shield className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                          {t.editPaymentPanelTitle}
                        </p>
                        <p className="text-[11px] text-slate-300 leading-relaxed">
                          {t.editPaymentPanelSubtitle}
                        </p>
                      </div>
                    </div>

                    {paymentEditorError && (
                      <div className="p-2.5 rounded-md border border-rose-500/35 bg-rose-500/10 text-xs text-rose-200 flex items-start gap-2">
                        <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                        <span>{paymentEditorError}</span>
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label
                          htmlFor="admin-instapay-number"
                          className="block text-[11px] font-semibold text-slate-200 mb-1"
                        >
                          {t.instapayNumberLabel}
                        </label>
                        <input
                          id="admin-instapay-number"
                          type="text"
                          dir="ltr"
                          maxLength={80}
                          value={instapayDraft}
                          onChange={(e) => setInstapayDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              void handleSavePaymentNumbers();
                            }
                          }}
                          className="w-full px-3 py-2 rounded-lg bg-[#08090C] border border-white/15 text-xs text-white font-mono-num focus:outline-none focus:border-amber-300"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="admin-wallet-number"
                          className="block text-[11px] font-semibold text-slate-200 mb-1"
                        >
                          {t.vodafoneCashNumberLabel}
                        </label>
                        <input
                          id="admin-wallet-number"
                          type="tel"
                          dir="ltr"
                          maxLength={30}
                          value={walletDraft}
                          onChange={(e) => setWalletDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              void handleSavePaymentNumbers();
                            }
                          }}
                          className="w-full px-3 py-2 rounded-lg bg-[#08090C] border border-white/15 text-xs text-white font-mono-num focus:outline-none focus:border-amber-300"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-0.5">
                      <button
                        type="button"
                        onClick={handleTogglePaymentEditor}
                        disabled={savingPaymentNumbers}
                        className="px-3 py-1.5 rounded-md border border-white/15 text-xs font-medium text-slate-300 hover:text-white hover:bg-white/[0.05] disabled:opacity-50"
                      >
                        {t.cancelBtn}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleSavePaymentNumbers()}
                        disabled={savingPaymentNumbers}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-amber-400 hover:bg-amber-300 disabled:opacity-60 text-xs font-semibold text-[#08090C] transition-colors"
                      >
                        <Save className="w-3.5 h-3.5" />
                        {savingPaymentNumbers ? t.savingPaymentNumbers : t.savePaymentNumbers}
                      </button>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {PAYMENT_METHODS.map((pm) => {
                    const active = paymentMethod === pm.id;
                    const pmCopy = buildPaymentMethodCopy(pm.id, lang, paymentConfig);
                    return (
                      <button
                        key={pm.id}
                        type="button"
                        onClick={() => setPaymentMethod(pm.id)}
                        className={`text-start p-3 rounded-lg border transition-colors ${
                          active
                            ? 'border-white bg-white/[0.08]'
                            : 'border-white/10 bg-[#08090C] hover:border-white/25'
                        }`}
                      >
                        <p className="text-sm font-semibold text-white">{pmCopy.label}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{pmCopy.sub}</p>
                      </button>
                    );
                  })}
                </div>

                <div className="p-3.5 rounded-lg bg-[#08090C] border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-xs text-slate-300 leading-relaxed">
                      {activePayment.instructions}
                    </p>
                    <p className="text-xs font-bold text-white flex items-center gap-1.5 flex-wrap">
                      <span>{t.sendTo}</span>
                      <span className="font-mono-num" dir="ltr">
                        {activePayment.destination}
                      </span>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyDestination}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-white/12 bg-white/[0.05] hover:bg-white/[0.1] text-xs font-semibold text-white shrink-0 self-start sm:self-center"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    {t.copyNumber}
                  </button>
                </div>

                <div>
                  <label htmlFor="booking-ref" className="block text-xs font-medium text-slate-300 mb-1.5">
                    {t.transferRefLabel} <span className="text-rose-400">*</span>
                  </label>
                  <input
                    id="booking-ref"
                    type="text"
                    dir="ltr"
                    required
                    maxLength={80}
                    value={transferRef}
                    onChange={(e) => setTransferRef(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-lg bg-[#08090C] border border-white/12 text-sm text-white font-mono-num focus:outline-none focus:border-white/50"
                  />
                </div>
              </div>

              {/* Step 4: Ticket Holder Details */}
              <div className="space-y-2.5">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  {t.step4HolderDetails}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label htmlFor="holder-name" className="block text-xs font-medium text-slate-300 mb-1.5">
                      {t.fullName}
                    </label>
                    <input
                      id="holder-name"
                      type="text"
                      required
                      maxLength={100}
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-[#08090C] border border-white/12 text-sm text-white focus:outline-none focus:border-white/50"
                    />
                  </div>
                  <div>
                    <label htmlFor="holder-mobile" className="block text-xs font-medium text-slate-300 mb-1.5">
                      {t.mobile}
                    </label>
                    <input
                      id="holder-mobile"
                      type="tel"
                      dir="ltr"
                      required
                      maxLength={30}
                      value={customerMobile}
                      onChange={(e) => setCustomerMobile(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-[#08090C] border border-white/12 text-sm text-white font-mono-num focus:outline-none focus:border-white/50"
                    />
                  </div>
                  <div>
                    <label htmlFor="holder-email" className="block text-xs font-medium text-slate-300 mb-1.5">
                      {t.email}
                    </label>
                    <input
                      id="holder-email"
                      type="email"
                      dir="ltr"
                      required
                      maxLength={120}
                      value={customerEmail}
                      onChange={(e) => setCustomerEmail(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-[#08090C] border border-white/12 text-sm text-white focus:outline-none focus:border-white/50"
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
                    {totals.quantity}x {selectedTierLabel}{' '}
                    {totals.quantity > 1 ? t.passesWord : t.passWord}
                  </span>
                  {totals.discountEgp > 0 && (
                    <span className="font-modern-price text-emerald-400 font-semibold" dir="ltr">
                      (-{formatCurrencyEgp(totals.discountEgp, lang)} {totals.promoResult.code})
                    </span>
                  )}
                </div>
                <p className="font-modern-price text-xl font-bold tracking-tight rtl:tracking-normal text-white leading-tight">
                  {formatCurrencyEgp(totals.totalEgp, lang)}
                </p>
              </div>

              <button
                type={!user || !isVerifiedUser ? 'button' : 'submit'}
                onClick={!user || !isVerifiedUser ? onRequireAuth : undefined}
                disabled={submitting}
                className="sm:w-auto w-full px-6 py-3 rounded-lg bg-white hover:bg-neutral-200 disabled:opacity-60 text-sm font-semibold text-[#08090C] transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
              >
                {!user
                  ? t.signInToReserve
                  : !isVerifiedUser
                    ? t.verifyToReserve
                    : submitting
                      ? t.submitting
                      : `${t.reserveAction} ${totals.quantity} ${selectedTierLabel} ${
                          totals.quantity > 1 ? t.passesWord : t.passWord
                        }`}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
