import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUpRight,
  Calendar,
  CheckCircle2,
  Copy,
  MessageCircle,
  RotateCcw,
  Search,
  Tag,
  Ticket,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import type { AdminRole, Booking, Concert, Promo, WaitlistEntry } from '../../types';
import {
  adminConfirmPayment,
  adminScanCheckIn,
  adminUndoPayment,
} from '../../services/firestoreService';
import { formatFriendlyFirebaseError } from '../../firebase';
import {
  formatCheckInProgress,
  getBookingCheckedInCount,
  isBookingFullyCheckedIn,
  type AdminTab,
  type StaffPermissions,
} from '../../utils/bookingLogic';
import {
  buildStaffWhatsAppBookingUrl,
  buildStaffWhatsAppWaitlistUrl,
  runStaffQuickSearch,
  type QuickSearchScope,
} from '../../utils/staffQuickSearch';
import { copyTextToClipboard } from '../../utils/passExport';
import { useLanguage } from '../../i18n/LanguageContext';
import {
  formatCurrencyEgp,
  formatPromoTiersSummary,
  getPaymentMethodLabel,
  getTierCopy,
  localizeKnownMessage,
} from '../../i18n/translations';

interface AdminQuickSearchModalProps {
  open: boolean;
  onClose: () => void;
  bookings: Booking[];
  concerts: Concert[];
  promos: Promo[];
  waitlist: WaitlistEntry[];
  permissions: StaffPermissions;
  adminName: string;
  adminRole: AdminRole;
  navItems: ReadonlyArray<{ id: AdminTab; label: string }>;
  onNavigateTab: (tab: AdminTab) => void;
  onNotify: (msg: string) => void;
}

export const AdminQuickSearchModal: React.FC<AdminQuickSearchModalProps> = ({
  open,
  onClose,
  bookings,
  concerts,
  promos,
  waitlist,
  permissions,
  adminName,
  adminRole,
  navItems,
  onNavigateTab,
  onNotify,
}) => {
  const { lang, isAr, t } = useLanguage();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<QuickSearchScope>('all');
  const [busyCode, setBusyCode] = useState<string | null>(null);
  const [confirmUndoCode, setConfirmUndoCode] = useState<string | null>(null);

  const actor = useMemo(() => ({ name: adminName, role: adminRole }), [adminName, adminRole]);

  useEffect(() => {
    if (!open) {
      setConfirmUndoCode(null);
      return;
    }
    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 20);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  const effectiveScope: QuickSearchScope =
    (scope === 'promos' && !permissions.canManagePromos) ||
    (scope === 'waitlist' && !permissions.isSuperAdmin)
      ? 'all'
      : scope;

  const results = useMemo(
    () =>
      runStaffQuickSearch(
        { bookings, concerts, promos, waitlist },
        query,
        permissions,
        effectiveScope,
      ),
    [bookings, concerts, promos, waitlist, query, permissions, effectiveScope],
  );

  if (!open) return null;

  const scopeChips: Array<{ id: QuickSearchScope; label: string }> = [
    { id: 'all', label: t.quickSearchScopeAll },
    { id: 'bookings', label: t.quickSearchScopeBookings },
    { id: 'concerts', label: t.quickSearchScopeConcerts },
    ...(permissions.canManagePromos
      ? [{ id: 'promos' as const, label: t.quickSearchScopePromos }]
      : []),
    ...(permissions.isSuperAdmin
      ? [{ id: 'waitlist' as const, label: t.quickSearchScopeWaitlist }]
      : []),
  ];

  const handleConfirmPay = async (b: Booking) => {
    if (!permissions.canConfirmPayments || busyCode === b.bookingCode) return;
    setBusyCode(b.bookingCode);
    try {
      await adminConfirmPayment(b, adminName, 'Quick Search', actor);
      onNotify(
        isAr
          ? `تم تأكيد الدفع للكود ${b.bookingCode} وفُتح رمز الـ QR.`
          : `Payment confirmed for ${b.bookingCode}. QR unlocked.`,
      );
    } catch (err) {
      onNotify(localizeKnownMessage(formatFriendlyFirebaseError(err), lang));
    } finally {
      setBusyCode(null);
    }
  };

  const handleUndoPay = async (b: Booking) => {
    if (!permissions.canUndoPayments || busyCode === b.bookingCode) return;
    setBusyCode(b.bookingCode);
    try {
      const reverted = await adminUndoPayment(b, actor);
      setConfirmUndoCode(null);
      if (!reverted) {
        onNotify(
          isAr
            ? `الحجز ${b.bookingCode} بالفعل بانتظار مراجعة التحويل.`
            : `Booking ${b.bookingCode} is already pending verification.`,
        );
        return;
      }
      onNotify(
        isAr
          ? `تم التراجع عن تأكيد الدفع للكود ${b.bookingCode} وإخفاء رمز الـ QR عن العميل.`
          : `Payment undone for ${b.bookingCode}. Fan QR is now hidden.`,
      );
    } catch (err) {
      onNotify(localizeKnownMessage(formatFriendlyFirebaseError(err), lang));
    } finally {
      setBusyCode(null);
    }
  };

  const handleCheckIn = async (b: Booking) => {
    if (!permissions.canGateCheckIn || b.paymentStatus !== 'Paid' || busyCode === b.bookingCode) {
      return;
    }
    setBusyCode(b.bookingCode);
    try {
      const res = await adminScanCheckIn(b, adminName, 'Quick Search', actor);
      const suffix = res.quantity > 1 ? ` ${formatCheckInProgress(res.checkedInCount, res.quantity)}` : '';
      onNotify(
        isAr
          ? `تم تسجيل دخول ${b.bookingCode}${suffix}.`
          : `Checked in ${b.bookingCode}${suffix}.`,
      );
    } catch (err) {
      const rawMsg = err instanceof Error ? err.message : '';
      if (rawMsg.startsWith('ALREADY_CHECKED_IN|')) {
        onNotify(
          isAr
            ? `التذكرة ${b.bookingCode} تم استخدامها بالكامل بالفعل.`
            : `Ticket ${b.bookingCode} is already fully checked in.`,
        );
      } else {
        onNotify(localizeKnownMessage(formatFriendlyFirebaseError(err), lang));
      }
    } finally {
      setBusyCode(null);
    }
  };

  const handleCopy = (value: string, labelEn: string, labelAr: string) => {
    void copyTextToClipboard(value).then(() => {
      onNotify(isAr ? `${labelAr}: ${value}` : `${labelEn}: ${value}`);
    });
  };

  const handleJump = (tab: AdminTab) => {
    onNavigateTab(tab);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t.quickSearchAria}
      className="fixed inset-0 z-[80] flex items-start justify-center p-3 sm:p-6 pt-12 sm:pt-16 bg-black/75 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-2xl bg-[#101218] border border-white/15 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[82vh]">
        {/* Search Input Header */}
        <div className="p-3.5 sm:p-4 border-b border-white/10 space-y-3 bg-[#0B0D12]">
          <div className="flex items-center gap-2.5">
            <Search className="w-4 h-4 text-slate-400 shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t.quickSearchPlaceholder}
              aria-label={t.quickSearchPlaceholder}
              className="flex-1 bg-transparent text-sm text-white placeholder:text-slate-500 focus:outline-none min-w-0"
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  inputRef.current?.focus();
                }}
                aria-label={t.clear}
                className="px-2 py-1 rounded text-[11px] text-slate-400 hover:text-white hover:bg-white/[0.06]"
              >
                {t.clear}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label={t.close}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.08]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Scope Chips */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1.5">
              {scopeChips.map((chip) => {
                const active = effectiveScope === chip.id;
                return (
                  <button
                    key={chip.id}
                    type="button"
                    onClick={() => setScope(chip.id)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-colors ${
                      active
                        ? 'border-white bg-white text-[#08090C]'
                        : 'border-white/12 bg-[#101218] text-slate-300 hover:border-white/30 hover:text-white'
                    }`}
                  >
                    {chip.label}
                  </button>
                );
              })}
            </div>
            <span className="hidden sm:inline-block text-[10px] font-mono-num text-slate-500">
              {t.quickSearchEscHint}
            </span>
          </div>
        </div>

        {/* Scrollable Results Body */}
        <div className="flex-1 overflow-y-auto p-3.5 sm:p-4 space-y-5">
          {/* Quick Tab Jump Shortcuts when query is empty */}
          {results.isDefaultPreview && (
            <div className="space-y-2">
              <p className="text-[11px] uppercase tracking-wider font-semibold text-slate-500">
                {t.quickSearchJumpTabs}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {navItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleJump(item.id)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-white/10 bg-[#08090C] hover:border-white/30 hover:text-white text-xs text-slate-300 transition-colors"
                  >
                    <span>{item.label}</span>
                    <ArrowUpRight className="w-3 h-3 text-slate-500" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Empty State */}
          {results.totalCount === 0 ? (
            <div className="py-10 text-center space-y-1.5">
              <p className="text-sm font-semibold text-slate-300">{t.quickSearchNoMatches}</p>
              <p className="text-xs text-slate-500">{t.quickSearchNoMatchesHint}</p>
            </div>
          ) : (
            <>
              {/* Bookings Section */}
              {results.bookings.length > 0 && (
                <section className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider font-semibold text-slate-400">
                      <Ticket className="w-3.5 h-3.5" />
                      {results.isDefaultPreview
                        ? permissions.canConfirmPayments
                          ? t.quickSearchPendingPreview
                          : t.quickSearchReadyPreview
                        : t.quickSearchSectionBookings}
                    </p>
                    <span className="text-[11px] font-mono-num text-slate-500">
                      {results.bookings.length}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {results.bookings.map((b) => {
                      const isPaid = b.paymentStatus === 'Paid';
                      const scanned = getBookingCheckedInCount(b);
                      const totalQty = Math.max(1, Math.floor(b.quantity || 1));
                      const fullyIn = isBookingFullyCheckedIn(b);
                      const busy = busyCode === b.bookingCode;
                      const waUrl =
                        isPaid || permissions.canConfirmPayments
                          ? buildStaffWhatsAppBookingUrl(b, lang)
                          : null;
                      const tierName = getTierCopy(b.tier, lang).name;
                      const targetTab: AdminTab = b.paymentMethod === 'Offline' ? 'offline' : 'checkin';

                      return (
                        <div
                          key={b.bookingCode}
                          className="p-3 rounded-xl bg-[#08090C] border border-white/10 hover:border-white/20 transition-colors space-y-2.5"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0 space-y-0.5">
                              <div className="flex flex-wrap items-center gap-2">
                                <span dir="ltr" className="font-mono-num font-bold text-xs text-white">
                                  {b.bookingCode}
                                </span>
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${
                                    isPaid
                                      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                                      : 'border-amber-400/40 bg-amber-400/10 text-amber-300'
                                  }`}
                                >
                                  {isPaid ? t.statusPaid : t.statusPending}
                                </span>
                                {isPaid && (
                                  <span
                                    className={`px-1.5 py-0.5 rounded text-[10px] font-mono-num font-semibold border ${
                                      fullyIn
                                        ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300'
                                        : 'border-white/10 bg-white/[0.04] text-slate-300'
                                    }`}
                                  >
                                    {formatCheckInProgress(scanned, totalQty)}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs font-semibold text-white truncate">
                                {b.customerName} ·{' '}
                                <span dir="ltr" className="font-mono-num text-slate-300 font-normal">
                                  {b.customerMobile}
                                </span>
                              </p>
                              <p className="text-[11px] text-slate-400 truncate">
                                {b.concertTitle} · {totalQty}× {tierName} ·{' '}
                                {getPaymentMethodLabel(b.paymentMethod, lang)}
                                {b.transferRef && (
                                  <>
                                    {' '}
                                    ·{' '}
                                    <span dir="ltr" className="font-mono-num text-slate-300">
                                      {b.transferRef}
                                    </span>
                                  </>
                                )}
                              </p>
                            </div>

                            {permissions.canViewRevenueAnalytics && (
                              <span className="font-modern-price text-xs font-bold text-white shrink-0">
                                {formatCurrencyEgp(b.totalEgp, lang)}
                              </span>
                            )}
                          </div>

                          {/* Instant Action Row */}
                          <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-white/8">
                            {!isPaid && permissions.canConfirmPayments && (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void handleConfirmPay(b)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-[11px] font-semibold text-white transition-colors"
                              >
                                <CheckCircle2 className="w-3 h-3" />
                                {t.confirmPay}
                              </button>
                            )}

                            {isPaid && permissions.canGateCheckIn && !fullyIn && (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void handleCheckIn(b)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-white hover:bg-neutral-200 disabled:opacity-50 text-[11px] font-semibold text-[#08090C] transition-colors"
                              >
                                <UserCheck className="w-3 h-3" />
                                {totalQty > 1 && scanned > 0 ? t.admitNextBtn : t.checkInBtn}
                              </button>
                            )}

                            {isPaid && permissions.canUndoPayments && (
                              confirmUndoCode === b.bookingCode ? (
                                <span className="inline-flex items-center gap-1">
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => void handleUndoPay(b)}
                                    className="px-2 py-1 rounded-md bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-[11px] font-semibold text-[#08090C]"
                                  >
                                    {t.undoPayConfirm}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmUndoCode(null)}
                                    aria-label={t.cancelUndoPayAria}
                                    className="p-1 text-slate-400 hover:text-white"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => setConfirmUndoCode(b.bookingCode)}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-amber-400/35 bg-amber-400/10 hover:bg-amber-400/20 disabled:opacity-50 text-[11px] font-semibold text-amber-200"
                                >
                                  <RotateCcw className="w-3 h-3" />
                                  {t.undoPay}
                                </button>
                              )
                            )}

                            <button
                              type="button"
                              onClick={() =>
                                handleCopy(b.bookingCode, 'Copied code', 'تم نسخ الكود')
                              }
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-white/12 bg-white/[0.04] hover:bg-white/[0.1] text-[11px] text-slate-200"
                            >
                              <Copy className="w-3 h-3" />
                              {t.copyCode}
                            </button>

                            {waUrl && (
                              <a
                                href={waUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label={t.quickSearchWhatsappAria}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-emerald-500/35 bg-emerald-500/10 hover:bg-emerald-500/20 text-[11px] font-semibold text-emerald-300"
                              >
                                <MessageCircle className="w-3 h-3" />
                                {t.whatsappLabel}
                              </a>
                            )}

                            <button
                              type="button"
                              onClick={() => handleJump(targetTab)}
                              className="ms-auto inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-slate-400 hover:text-white hover:bg-white/[0.06]"
                            >
                              {t.quickSearchOpenTab}
                              <ArrowUpRight className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* Concerts Section */}
              {results.concerts.length > 0 && (
                <section className="space-y-2">
                  <p className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider font-semibold text-slate-400">
                    <Calendar className="w-3.5 h-3.5" />
                    {t.quickSearchSectionConcerts}
                  </p>
                  <div className="space-y-1.5">
                    {results.concerts.map((c) => (
                      <div
                        key={c.id}
                        className="p-3 rounded-xl bg-[#08090C] border border-white/10 flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-white truncate">
                            {c.title} · <span className="font-normal text-slate-300">{c.artist}</span>
                          </p>
                          <p className="text-[11px] text-slate-400 truncate">
                            <span dir="ltr">{c.date} · {c.time}</span> · {c.venue} ·{' '}
                            <span className="font-mono-num text-amber-300">
                              {c.seatsLeft}/{c.totalSeats} {t.seatsLeftWord}
                            </span>
                          </p>
                        </div>
                        {permissions.canManageConcerts && (
                          <button
                            type="button"
                            onClick={() => handleJump('manage')}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-white/15 bg-white/[0.04] hover:bg-white/[0.1] text-[11px] font-semibold text-white shrink-0"
                          >
                            {t.editBtn}
                            <ArrowUpRight className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Promo Codes Section (Super Admin Only) */}
              {results.promos.length > 0 && permissions.canManagePromos && (
                <section className="space-y-2">
                  <p className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider font-semibold text-slate-400">
                    <Tag className="w-3.5 h-3.5" />
                    {t.quickSearchSectionPromos}
                  </p>
                  <div className="space-y-1.5">
                    {results.promos.map((p) => (
                      <div
                        key={p.code}
                        className="p-3 rounded-xl bg-[#08090C] border border-white/10 flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span dir="ltr" className="font-mono-num text-xs font-bold text-white">
                              {p.code}
                            </span>
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${
                                p.active
                                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                                  : 'border-white/15 text-slate-400'
                              }`}
                            >
                              {p.active ? t.liveWord : t.hiddenWord}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400 truncate">
                            {p.label} · {formatPromoTiersSummary(p.tiers, lang)}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleCopy(p.code, 'Copied promo', 'تم نسخ كود الخصم')}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-white/12 bg-white/[0.04] hover:bg-white/[0.1] text-[11px] text-slate-200"
                          >
                            <Copy className="w-3 h-3" />
                            {t.copyBtn}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleJump('promos')}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-slate-400 hover:text-white hover:bg-white/[0.06]"
                          >
                            <ArrowUpRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Waitlist Section (Super Admin Only) */}
              {results.waitlist.length > 0 && permissions.isSuperAdmin && (
                <section className="space-y-2">
                  <p className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider font-semibold text-slate-400">
                    <Users className="w-3.5 h-3.5" />
                    {t.quickSearchSectionWaitlist}
                  </p>
                  <div className="space-y-1.5">
                    {results.waitlist.map((w) => {
                      const waUrl = buildStaffWhatsAppWaitlistUrl(w, lang);
                      return (
                        <div
                          key={w.id}
                          className="p-3 rounded-xl bg-[#08090C] border border-white/10 flex flex-wrap items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-white truncate">
                              {w.name} ·{' '}
                              <span dir="ltr" className="font-mono-num text-slate-300 font-normal">
                                {w.mobile}
                              </span>
                            </p>
                            <p className="text-[11px] text-slate-400 truncate">{w.concertTitle}</p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() =>
                                handleCopy(w.mobile, 'Copied mobile', 'تم نسخ رقم الموبايل')
                              }
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-white/12 bg-white/[0.04] hover:bg-white/[0.1] text-[11px] text-slate-200"
                            >
                              <Copy className="w-3 h-3" />
                              {t.quickSearchCopyMobile}
                            </button>
                            {waUrl && (
                              <a
                                href={waUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-emerald-500/35 bg-emerald-500/10 hover:bg-emerald-500/20 text-[11px] font-semibold text-emerald-300"
                              >
                                <MessageCircle className="w-3 h-3" />
                                {t.whatsappLabel}
                              </a>
                            )}
                            <button
                              type="button"
                              onClick={() => handleJump('manage')}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-slate-400 hover:text-white hover:bg-white/[0.06]"
                            >
                              <ArrowUpRight className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
