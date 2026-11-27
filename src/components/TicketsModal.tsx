import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Copy,
  Download,
  Maximize2,
  MessageCircle,
  QrCode,
  Ticket,
  Trash2,
  X,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import { cancelPendingBooking } from '../services/firestoreService';
import { formatFriendlyFirebaseError } from '../firebase';
import type { Booking, Concert } from '../types';
import {
  canDisplayBookingQr,
  formatCheckInProgress,
  getBookingCheckedInCount,
  getTierColorHex,
  isPendingEmailVerification,
  isVerifiedFanAccount,
  resolveBookingConcertDetails,
} from '../utils/bookingLogic';
import {
  copyTextToClipboard,
  generateOriginalQrDataUrl,
  generateQrDataUrl,
  renderTicketPassPng,
  triggerDataUrlDownload,
} from '../utils/passExport';
import { useLanguage } from '../i18n/LanguageContext';
import {
  formatCurrencyEgp,
  getPaymentMethodLabel,
  getTierCopy,
  localizeKnownMessage,
  TICKET_ENTRY_TERMS,
} from '../i18n/translations';
import { buildQrDownloadFilename, buildTicketReceiptWhatsAppUrl } from '../utils/ticketDesign';
import { TicketVisualCard } from './TicketVisualCard';

interface TicketsModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  bookings: Booking[];
  concerts: Concert[];
  onRequireAuth: () => void;
  onNotify: (msg: string) => void;
}

export const TicketsModal: React.FC<TicketsModalProps> = ({
  isOpen,
  onClose,
  user,
  bookings,
  concerts,
  onRequireAuth,
  onNotify,
}) => {
  const { lang, t } = useLanguage();
  const [qrMap, setQrMap] = useState<Record<string, string>>({});
  const [previewPng, setPreviewPng] = useState<{ code: string; dataUrl: string; wasPaid: boolean } | null>(null);
  const [zoomQrBooking, setZoomQrBooking] = useState<Booking | null>(null);
  const [generatingPngCode, setGeneratingPngCode] = useState<string | null>(null);
  const [downloadingQrCode, setDownloadingQrCode] = useState<string | null>(null);
  const [confirmCancelCode, setConfirmCancelCode] = useState<string | null>(null);
  const [busyCode, setBusyCode] = useState<string | null>(null);

  const activeZoomBooking = zoomQrBooking
    ? (() => {
        const live = bookings.find(
          (b) => b.bookingCode === zoomQrBooking.bookingCode && canDisplayBookingQr(b),
        );
        if (!live) return null;
        const show = concerts.find((c) => c.id === live.concertId);
        return resolveBookingConcertDetails(live, show);
      })()
    : null;

  const activePreviewPng = previewPng
    ? (() => {
        const live = bookings.find((b) => b.bookingCode === previewPng.code);
        if (!live) return null;
        if (previewPng.wasPaid && !canDisplayBookingQr(live)) return null;
        return previewPng;
      })()
    : null;

  useEffect(() => {
    if (zoomQrBooking && !activeZoomBooking) {
      setZoomQrBooking(null);
    }
    if (previewPng && !activePreviewPng) {
      setPreviewPng(null);
    }
  }, [zoomQrBooking, activeZoomBooking, previewPng, activePreviewPng]);

  useEffect(() => {
    if (!isOpen) {
      setPreviewPng(null);
      setZoomQrBooking(null);
      setGeneratingPngCode(null);
      setDownloadingQrCode(null);
      setConfirmCancelCode(null);
      setQrMap({});
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (activeZoomBooking) {
          setZoomQrBooking(null);
        } else if (activePreviewPng) {
          setPreviewPng(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, activePreviewPng, activeZoomBooking, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    const paidBookings = bookings.filter((b) => canDisplayBookingQr(b));
    const paidCodeSet = new Set(paidBookings.map((b) => b.bookingCode));

    // Prune any ticket whose payment was undone immediately so no cached QR lingers
    setQrMap((prev) => {
      let changed = false;
      const pruned: Record<string, string> = {};
      for (const [code, url] of Object.entries(prev)) {
        if (paidCodeSet.has(code)) {
          pruned[code] = url;
        } else {
          changed = true;
        }
      }
      return changed ? pruned : prev;
    });

    const loadQrs = async () => {
      const entries = await Promise.all(
        paidBookings.map(async (b) => {
          try {
            const url = await generateQrDataUrl(b.bookingCode);
            return [b.bookingCode, url] as const;
          } catch {
            return null;
          }
        }),
      );
      const next: Record<string, string> = {};
      for (const entry of entries) {
        if (entry) next[entry[0]] = entry[1];
      }
      if (active) setQrMap(next);
    };
    void loadQrs();
    return () => {
      active = false;
    };
  }, [isOpen, bookings]);

  if (!isOpen) return null;

  const entryTerms = TICKET_ENTRY_TERMS[lang];

  const handleOpenPngPreview = async (booking: Booking) => {
    setGeneratingPngCode(booking.bookingCode);
    try {
      const show = concerts.find((c) => c.id === booking.concertId);
      const liveBooking = resolveBookingConcertDetails(booking, show);
      const tierHex = getTierColorHex(show, liveBooking.tier);
      const dataUrl = await renderTicketPassPng(liveBooking, tierHex);
      setPreviewPng({
        code: liveBooking.bookingCode,
        dataUrl,
        wasPaid: canDisplayBookingQr(liveBooking),
      });
    } catch {
      onNotify(t.pngRenderFailed);
    } finally {
      setGeneratingPngCode(null);
    }
  };

  const handleDownloadOriginalQr = async (booking: Booking) => {
    if (!canDisplayBookingQr(booking)) return;
    setDownloadingQrCode(booking.bookingCode);
    try {
      const qrDataUrl = await generateOriginalQrDataUrl(booking.bookingCode);
      triggerDataUrlDownload(buildQrDownloadFilename(booking.bookingCode), qrDataUrl);
      onNotify(`${t.qrDownloadedPrefix} ${booking.bookingCode}`);
    } catch {
      onNotify(t.qrDownloadFailed);
    } finally {
      setDownloadingQrCode(null);
    }
  };

  const buildWhatsAppHref = (booking: Booking) => {
    const show = concerts.find((c) => c.id === booking.concertId);
    const liveBooking = resolveBookingConcertDetails(booking, show);
    const tierLabel = getTierCopy(liveBooking.tier, lang).name;
    const totalQty = Math.max(1, Math.floor(liveBooking.quantity || 1));
    const scannedCount = getBookingCheckedInCount(liveBooking);
    const statusText =
      scannedCount >= totalQty
        ? totalQty > 1
          ? `${t.statusCheckedIn} ${formatCheckInProgress(scannedCount, totalQty)}`
          : t.statusCheckedIn
        : scannedCount > 0
          ? `${t.partialEnteredLabel} ${formatCheckInProgress(scannedCount, totalQty)}`
          : liveBooking.paymentStatus === 'Paid'
            ? t.statusPaidReady
            : t.statusPendingVerification;
    return buildTicketReceiptWhatsAppUrl(liveBooking, {
      lang,
      tierLabel,
      paymentMethodLabel: getPaymentMethodLabel(liveBooking.paymentMethod, lang),
      totalFormatted: formatCurrencyEgp(liveBooking.totalEgp, lang),
      statusText,
    });
  };

  const handleCancelBooking = async (bookingCode: string) => {
    if (busyCode === bookingCode) return;
    setBusyCode(bookingCode);
    try {
      await cancelPendingBooking(bookingCode);
      setConfirmCancelCode(null);
      onNotify(`${t.cancelledReservationPrefix} ${bookingCode}.`);
    } catch (err) {
      onNotify(localizeKnownMessage(formatFriendlyFirebaseError(err), lang));
    } finally {
      setBusyCode(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label={t.myBookedTickets}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-4xl bg-[#101218] border border-white/15 rounded-xl shadow-2xl overflow-hidden my-auto">
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Ticket className="w-4 h-4 text-white" />
            <h2 className="font-display font-bold text-lg text-white">{t.myBookedTickets}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.closeTicketsAria}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 sm:p-6 max-h-[82vh] overflow-y-auto space-y-5">
          {!isVerifiedFanAccount(user) ? (
            <div className="py-12 text-center space-y-4">
              <Ticket className="w-10 h-10 text-slate-500 mx-auto" />
              <div className="space-y-1">
                <p className="font-display font-bold text-lg text-white">
                  {isPendingEmailVerification(user)
                    ? t.verifyToViewPasses
                    : t.signInToViewPasses}
                </p>
                <p className="text-sm text-slate-400 max-w-sm mx-auto">
                  {isPendingEmailVerification(user)
                    ? `${t.verifyToViewPassesDescPrefix} ${user?.email} ${t.verifyToViewPassesDescSuffix}`
                    : t.signInToViewPassesDesc}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onRequireAuth();
                }}
                className="px-5 py-2.5 rounded-lg bg-white hover:bg-neutral-200 text-sm font-semibold text-[#08090C] transition-colors"
              >
                {isPendingEmailVerification(user) ? t.openEmailVerification : t.signInCreateAccount}
              </button>
            </div>
          ) : bookings.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <Ticket className="w-10 h-10 text-slate-500 mx-auto" />
              <p className="font-display font-bold text-lg text-white">{t.noPassesYet}</p>
              <p className="text-sm text-slate-400">{t.noPassesYetDesc}</p>
            </div>
          ) : (
            bookings.map((rawBooking) => {
              const show = concerts.find((c) => c.id === rawBooking.concertId);
              const b = resolveBookingConcertDetails(rawBooking, show);
              const isPaid = canDisplayBookingQr(b);
              const tierHex = getTierColorHex(show, b.tier);
              const tierLabel = getTierCopy(b.tier, lang).name;
              const qrUrl = isPaid ? qrMap[b.bookingCode] : undefined;
              return (
                <div
                  key={b.bookingCode}
                  className="bg-[#08090C] border border-white/10 rounded-xl p-3.5 sm:p-5 space-y-4"
                >
                  {/* Official 3:1 Ticket Artwork with Unique QR Replacing ZONE/ROW/SEAT/Barcode */}
                  <TicketVisualCard
                    booking={b}
                    qrDataUrl={qrUrl}
                    onEnlargeQr={() => {
                      if (isPaid && qrUrl) setZoomQrBooking(b);
                    }}
                  />

                  {/* Mobile-Only Instant Gate Scan QR Block for Effortless Phone Scanning */}
                  {isPaid && qrUrl && (
                    <div className="sm:hidden flex flex-col items-center justify-center bg-[#101218] border border-white/10 rounded-xl p-4 text-center space-y-2">
                      <button
                        type="button"
                        onClick={() => setZoomQrBooking(b)}
                        aria-label={`${t.enlargeQrAria} (${b.bookingCode})`}
                        className="w-48 h-48 rounded-xl bg-white p-2.5 shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                      >
                        <img
                          src={qrUrl}
                          alt={`QR ${b.bookingCode}`}
                          className="w-full h-full block"
                        />
                      </button>
                      <p className="font-mono-num text-sm font-bold text-white" dir="ltr">
                        {b.bookingCode}
                      </p>
                      <p className="text-[11px] text-slate-400">{t.gateScanReady}</p>
                    </div>
                  )}

                  {/* Ticket Details */}
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="font-display font-bold text-base sm:text-lg text-white truncate">
                          {b.concertTitle}
                        </h3>
                        <p className="text-xs text-slate-400">
                          <span dir="ltr">{b.concertDate} · {b.concertTime}</span> · {b.concertVenue}
                        </p>
                      </div>
                      {(() => {
                        const totalQty = Math.max(1, Math.floor(b.quantity || 1));
                        const scannedCount = getBookingCheckedInCount(b);
                        const isFullyEntered = scannedCount >= totalQty;
                        const isPartiallyEntered = scannedCount > 0 && !isFullyEntered;
                        const progress = totalQty > 1 ? ` ${formatCheckInProgress(scannedCount, totalQty)}` : '';
                        return (
                          <span
                            className={`text-[11px] font-mono-num font-bold uppercase tracking-wider px-2.5 py-1 rounded border shrink-0 ${
                              isFullyEntered
                                ? 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10'
                                : isPartiallyEntered
                                  ? 'text-cyan-200 border-cyan-400/40 bg-cyan-500/10'
                                  : isPaid
                                    ? 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10'
                                    : 'text-amber-300 border-amber-400/40 bg-amber-400/10'
                            }`}
                          >
                            {isFullyEntered ? (
                              <>
                                {t.statusCheckedIn}
                                {progress && <span dir="ltr">{progress}</span>}
                              </>
                            ) : isPartiallyEntered ? (
                              <>
                                {t.partialEnteredLabel} <span dir="ltr">{formatCheckInProgress(scannedCount, totalQty)}</span>
                              </>
                            ) : isPaid ? (
                              t.statusPaidReady
                            ) : (
                              t.statusPendingVerification
                            )}
                          </span>
                        );
                      })()}
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1 text-xs">
                      <div>
                        <span className="text-slate-500 block">{t.tierLabel}</span>
                        <span className="inline-flex items-center gap-1.5 font-semibold" style={{ color: tierHex }}>
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: tierHex }}
                            aria-hidden="true"
                          />
                          {tierLabel}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">{t.guestsLabel}</span>
                        <span className="font-mono-num font-semibold text-white">{b.quantity}x</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">{t.totalLabel}</span>
                        <span className="font-modern-price font-semibold tracking-tight rtl:tracking-normal text-white">
                          {formatCurrencyEgp(b.totalEgp, lang)}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">
                          {getPaymentMethodLabel(b.paymentMethod, lang)}
                        </span>
                        <span className="font-mono-num text-slate-300 truncate block" dir="ltr">
                          {b.transferRef}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Ticket Actions */}
                  <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-white/8">
                    {isPaid && qrUrl && (
                      <button
                        type="button"
                        onClick={() => setZoomQrBooking(b)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-neutral-200 text-xs font-semibold text-[#08090C] transition-colors"
                      >
                        <Maximize2 className="w-3.5 h-3.5" />
                        {t.enlargeQr}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        void copyTextToClipboard(b.bookingCode).then(() => {
                          onNotify(`${t.copiedCodePrefix} ${b.bookingCode}`);
                        });
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/12 bg-white/[0.04] hover:bg-white/[0.08] text-xs font-medium text-white"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      {t.copyCode}
                    </button>
                    <button
                      type="button"
                      disabled={generatingPngCode === b.bookingCode}
                      onClick={() => void handleOpenPngPreview(b)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/12 bg-white/[0.04] hover:bg-white/[0.08] disabled:opacity-60 text-xs font-medium text-white transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" />
                      {generatingPngCode === b.bookingCode ? t.ePassGenerating : t.ePassPng}
                    </button>
                    {isPaid && (
                      <button
                        type="button"
                        disabled={downloadingQrCode === b.bookingCode}
                        onClick={() => void handleDownloadOriginalQr(b)}
                        aria-label={`${t.downloadQrAria} (${b.bookingCode})`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/12 bg-white/[0.04] hover:bg-white/[0.08] disabled:opacity-60 text-xs font-medium text-white transition-colors"
                      >
                        <QrCode className="w-3.5 h-3.5" />
                        {downloadingQrCode === b.bookingCode ? t.qrDownloading : t.downloadQr}
                      </button>
                    )}
                    <div className="inline-flex flex-wrap items-center gap-2">
                      <a
                        href={buildWhatsAppHref(b)}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`${t.whatsappReceiptAria} (${b.bookingCode})`}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs no-underline transition-colors shrink-0 ${
                          isPaid
                            ? 'border-white/12 bg-white/[0.04] hover:bg-white/[0.08] font-medium text-white'
                            : 'border-emerald-500/40 bg-emerald-500/15 hover:bg-emerald-500/25 font-semibold text-emerald-200'
                        }`}
                      >
                        <MessageCircle className="w-3.5 h-3.5 text-emerald-400" />
                        {isPaid ? t.whatsappLabel : t.sendReceiptWhatsapp}
                      </a>
                      {!isPaid && (
                        <span className="text-[11px] leading-snug text-emerald-300/90">
                          {t.whatsappPaymentScreenshotNote}
                        </span>
                      )}
                    </div>

                    {!isPaid && getBookingCheckedInCount(b) === 0 && (
                      confirmCancelCode === b.bookingCode ? (
                        <div className="flex items-center gap-1.5 ms-auto">
                          <button
                            type="button"
                            disabled={busyCode === b.bookingCode}
                            onClick={() => void handleCancelBooking(b.bookingCode)}
                            className="px-2.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-xs font-semibold text-white"
                          >
                            {busyCode === b.bookingCode ? t.cancelling : t.confirmCancel}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmCancelCode(null)}
                            className="px-2.5 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white"
                          >
                            {t.keep}
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmCancelCode(b.bookingCode)}
                          className="ms-auto inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-rose-400 hover:bg-rose-500/10"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          {t.cancel}
                        </button>
                      )
                    )}

                    {getBookingCheckedInCount(b) > 0 && (
                      <span className="ms-auto inline-flex items-center gap-1 text-xs text-emerald-400">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {t.enteredLabel}{' '}
                        {b.quantity > 1 && (
                          <span className="font-mono-num font-bold" dir="ltr">
                            {formatCheckInProgress(getBookingCheckedInCount(b), b.quantity)}
                          </span>
                        )}{' '}
                        <span dir="ltr">{b.checkedInAt}</span>
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}

          {/* Entry Terms & Conditions below booked tickets */}
          {isVerifiedFanAccount(user) && bookings.length > 0 && (
            <section
              aria-label={entryTerms.title}
              className="rounded-xl border border-amber-400/30 bg-[#08090C] p-4 sm:p-5 space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-amber-400/20">
                <div className="flex items-center gap-2.5">
                  <span
                    aria-hidden="true"
                    className="w-1 h-5 rounded-full bg-gradient-to-b from-amber-300 to-amber-500 shrink-0"
                  />
                  <h3 className="font-display font-bold text-base sm:text-lg text-white">
                    {entryTerms.title}
                  </h3>
                </div>
                <span className="text-[10px] font-mono-num font-semibold uppercase tracking-[0.18em] text-amber-300/85">
                  {entryTerms.subtitle}
                </span>
              </div>

              <ol className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3.5">
                {entryTerms.items.map((item) => (
                  <li key={item.number} className="flex items-start gap-3">
                    <span
                      aria-hidden="true"
                      className="w-6 h-6 rounded-full bg-gradient-to-br from-amber-300 to-amber-500 text-[#08090C] font-display font-bold text-xs flex items-center justify-center shrink-0 mt-0.5 shadow-sm"
                    >
                      {item.number}
                    </span>
                    <p className="text-xs sm:text-[13px] leading-relaxed text-slate-200">
                      {item.text}
                    </p>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>
      </div>

      {/* Large Gate-Scan QR Lightbox */}
      {activeZoomBooking && qrMap[activeZoomBooking.bookingCode] && (
        <div
          className="fixed inset-0 z-[65] bg-black/90 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`${t.gateScanReady} — ${activeZoomBooking.bookingCode}`}
          onClick={(e) => {
            if (e.target === e.currentTarget) setZoomQrBooking(null);
          }}
        >
          <div className="w-full max-w-sm bg-[#101218] border border-white/15 rounded-2xl overflow-hidden shadow-2xl">
            <div className="px-5 py-3.5 border-b border-white/10 flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-300">{t.gateScanReady}</p>
              <button
                type="button"
                onClick={() => setZoomQrBooking(null)}
                aria-label={t.closePreviewAria}
                className="p-1 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 flex flex-col items-center text-center space-y-4">
              <div className="w-72 h-72 max-w-full aspect-square rounded-2xl bg-white p-3.5 shadow-xl">
                <img
                  src={qrMap[activeZoomBooking.bookingCode]}
                  alt={`QR ${activeZoomBooking.bookingCode}`}
                  className="w-full h-full block"
                />
              </div>
              <div className="space-y-1">
                <p className="font-mono-num text-xl font-bold text-white" dir="ltr">
                  {activeZoomBooking.bookingCode}
                </p>
                <p className="text-xs text-slate-300">{activeZoomBooking.concertTitle}</p>
                <p className="text-[11px] text-slate-400">
                  {getTierCopy(activeZoomBooking.tier, lang).name} · {activeZoomBooking.quantity}x
                </p>
              </div>
              <div className="w-full flex items-center gap-2">
                <button
                  type="button"
                  disabled={downloadingQrCode === activeZoomBooking.bookingCode}
                  onClick={() => void handleDownloadOriginalQr(activeZoomBooking)}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 rounded-lg border border-white/15 bg-white/[0.06] hover:bg-white/[0.12] disabled:opacity-60 text-xs font-semibold text-white transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  {downloadingQrCode === activeZoomBooking.bookingCode ? t.qrDownloading : t.downloadQr}
                </button>
                <button
                  type="button"
                  onClick={() => setZoomQrBooking(null)}
                  className="flex-1 py-2.5 rounded-lg bg-white hover:bg-neutral-200 text-xs font-semibold text-[#08090C] transition-colors"
                >
                  {t.close}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PNG E-Pass Preview Sub-Modal */}
      {activePreviewPng && (
        <div
          className="fixed inset-0 z-[60] bg-black/85 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`${t.ePassPreviewTitle} ${activePreviewPng.code}`}
          onClick={(e) => {
            if (e.target === e.currentTarget) setPreviewPng(null);
          }}
        >
          <div className="max-w-4xl w-full bg-[#101218] border border-white/15 rounded-xl overflow-hidden shadow-2xl">
            <div className="px-5 py-3.5 border-b border-white/10 flex items-center justify-between">
              <p className="font-mono-num text-sm font-bold text-white">
                {t.ePassPreviewTitle} · <span dir="ltr">{activePreviewPng.code}</span>
              </p>
              <button
                type="button"
                onClick={() => setPreviewPng(null)}
                aria-label={t.closePreviewAria}
                className="p-1 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <img
                src={activePreviewPng.dataUrl}
                alt={`${t.ePassPreviewTitle} ${activePreviewPng.code}`}
                className="w-full rounded-lg border border-white/10"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setPreviewPng(null)}
                  className="px-4 py-2 rounded-lg border border-white/12 text-xs font-medium text-slate-300 hover:text-white"
                >
                  {t.close}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    triggerDataUrlDownload(`${activePreviewPng.code}-genz-pass.png`, activePreviewPng.dataUrl)
                  }
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white hover:bg-neutral-200 text-xs font-semibold text-[#08090C] transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  {t.downloadPng}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

