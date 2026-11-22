import React, { useEffect, useState } from 'react';
import {
  CalendarPlus,
  CheckCircle2,
  Copy,
  Download,
  Maximize2,
  MessageCircle,
  Ticket,
  Trash2,
  X,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import { cancelPendingBooking } from '../services/firestoreService';
import { formatFriendlyFirebaseError } from '../firebase';
import type { Booking, Concert } from '../types';
import { buildCalendarIcs, getTierColorHex, isPendingEmailVerification, isVerifiedFanAccount } from '../utils/bookingLogic';
import { copyTextToClipboard, generateQrDataUrl, renderTicketPassPng, triggerFileDownload } from '../utils/passExport';
import { useLanguage } from '../i18n/LanguageContext';
import {
  formatCurrencyEgp,
  getPaymentMethodLabel,
  getTierCopy,
  localizeKnownMessage,
} from '../i18n/translations';
import { buildTicketReceiptWhatsAppUrl } from '../utils/ticketDesign';
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
  const [previewPng, setPreviewPng] = useState<{ code: string; dataUrl: string } | null>(null);
  const [zoomQrBooking, setZoomQrBooking] = useState<Booking | null>(null);
  const [generatingPngCode, setGeneratingPngCode] = useState<string | null>(null);
  const [confirmCancelCode, setConfirmCancelCode] = useState<string | null>(null);
  const [busyCode, setBusyCode] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setPreviewPng(null);
      setZoomQrBooking(null);
      setGeneratingPngCode(null);
      setConfirmCancelCode(null);
      setQrMap({});
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (zoomQrBooking) {
          setZoomQrBooking(null);
        } else if (previewPng) {
          setPreviewPng(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, previewPng, zoomQrBooking, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    const loadQrs = async () => {
      const next: Record<string, string> = {};
      for (const b of bookings) {
        if (b.paymentStatus === 'Paid') {
          try {
            next[b.bookingCode] = await generateQrDataUrl(b.bookingCode);
          } catch {
            // ignore QR generation failure
          }
        }
      }
      if (active) setQrMap(next);
    };
    void loadQrs();
    return () => {
      active = false;
    };
  }, [isOpen, bookings]);

  if (!isOpen) return null;

  const handleOpenPngPreview = async (booking: Booking) => {
    setGeneratingPngCode(booking.bookingCode);
    try {
      const show = concerts.find((c) => c.id === booking.concertId);
      const tierHex = getTierColorHex(show, booking.tier);
      const dataUrl = await renderTicketPassPng(booking, tierHex);
      setPreviewPng({ code: booking.bookingCode, dataUrl });
    } catch {
      onNotify(t.pngRenderFailed);
    } finally {
      setGeneratingPngCode(null);
    }
  };

  const handleDownloadIcs = (booking: Booking) => {
    const show = concerts.find((c) => c.id === booking.concertId);
    const ics = buildCalendarIcs(booking, show);
    triggerFileDownload(`${booking.bookingCode}-genz-events.ics`, ics, 'text/calendar;charset=utf-8');
    onNotify(t.calendarDownloaded);
  };

  const buildWhatsAppHref = (booking: Booking) => {
    const tierLabel = getTierCopy(booking.tier, lang).name;
    const statusText = booking.checkedIn
      ? t.statusCheckedIn
      : booking.paymentStatus === 'Paid'
        ? t.statusPaidReady
        : t.statusPendingVerification;
    return buildTicketReceiptWhatsAppUrl(booking, {
      lang,
      tierLabel,
      paymentMethodLabel: getPaymentMethodLabel(booking.paymentMethod, lang),
      totalFormatted: formatCurrencyEgp(booking.totalEgp, lang),
      statusText,
    });
  };

  const handleCancelBooking = async (bookingCode: string) => {
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
            bookings.map((b) => {
              const isPaid = b.paymentStatus === 'Paid';
              const show = concerts.find((c) => c.id === b.concertId);
              const tierHex = getTierColorHex(show, b.tier);
              const tierLabel = getTierCopy(b.tier, lang).name;
              const qrUrl = qrMap[b.bookingCode];
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
                      <span
                        className={`text-[11px] font-mono-num font-bold uppercase tracking-wider px-2.5 py-1 rounded border shrink-0 ${
                          b.checkedIn
                            ? 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10'
                            : isPaid
                              ? 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10'
                              : 'text-amber-300 border-amber-400/40 bg-amber-400/10'
                        }`}
                      >
                        {b.checkedIn
                          ? t.statusCheckedIn
                          : isPaid
                            ? t.statusPaidReady
                            : t.statusPendingVerification}
                      </span>
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
                        <span className="font-mono-num font-semibold text-white">
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
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/12 bg-white/[0.04] hover:bg-white/[0.08] disabled:opacity-60 text-xs font-medium text-white"
                    >
                      <Download className="w-3.5 h-3.5" />
                      {generatingPngCode === b.bookingCode ? t.ePassGenerating : t.ePassPng}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDownloadIcs(b)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/12 bg-white/[0.04] hover:bg-white/[0.08] text-xs font-medium text-white"
                    >
                      <CalendarPlus className="w-3.5 h-3.5" />
                      {t.icsLabel}
                    </button>
                    <a
                      href={buildWhatsAppHref(b)}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`${t.whatsappReceiptAria} (${b.bookingCode})`}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs transition-colors ${
                        isPaid
                          ? 'border-white/12 bg-white/[0.04] hover:bg-white/[0.08] font-medium text-white'
                          : 'border-emerald-500/40 bg-emerald-500/15 hover:bg-emerald-500/25 font-semibold text-emerald-200'
                      }`}
                    >
                      <MessageCircle className="w-3.5 h-3.5 text-emerald-400" />
                      {isPaid ? t.whatsappLabel : t.sendReceiptWhatsapp}
                    </a>

                    {!isPaid && !b.checkedIn && (
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

                    {b.checkedIn && (
                      <span className="ms-auto inline-flex items-center gap-1 text-xs text-emerald-400">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {t.enteredLabel} <span dir="ltr">{b.checkedInAt}</span>
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Large Gate-Scan QR Lightbox */}
      {zoomQrBooking && qrMap[zoomQrBooking.bookingCode] && (
        <div
          className="fixed inset-0 z-[65] bg-black/90 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`${t.gateScanReady} — ${zoomQrBooking.bookingCode}`}
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
                  src={qrMap[zoomQrBooking.bookingCode]}
                  alt={`QR ${zoomQrBooking.bookingCode}`}
                  className="w-full h-full block"
                />
              </div>
              <div className="space-y-1">
                <p className="font-mono-num text-xl font-bold text-white" dir="ltr">
                  {zoomQrBooking.bookingCode}
                </p>
                <p className="text-xs text-slate-300">{zoomQrBooking.concertTitle}</p>
                <p className="text-[11px] text-slate-400">
                  {getTierCopy(zoomQrBooking.tier, lang).name} · {zoomQrBooking.quantity}x
                </p>
              </div>
              <button
                type="button"
                onClick={() => setZoomQrBooking(null)}
                className="w-full py-2.5 rounded-lg bg-white hover:bg-neutral-200 text-xs font-semibold text-[#08090C] transition-colors"
              >
                {t.close}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PNG E-Pass Preview Sub-Modal */}
      {previewPng && (
        <div
          className="fixed inset-0 z-[60] bg-black/85 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`${t.ePassPreviewTitle} ${previewPng.code}`}
          onClick={(e) => {
            if (e.target === e.currentTarget) setPreviewPng(null);
          }}
        >
          <div className="max-w-4xl w-full bg-[#101218] border border-white/15 rounded-xl overflow-hidden shadow-2xl">
            <div className="px-5 py-3.5 border-b border-white/10 flex items-center justify-between">
              <p className="font-mono-num text-sm font-bold text-white">
                {t.ePassPreviewTitle} · <span dir="ltr">{previewPng.code}</span>
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
                src={previewPng.dataUrl}
                alt={`${t.ePassPreviewTitle} ${previewPng.code}`}
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
                <a
                  href={previewPng.dataUrl}
                  download={`${previewPng.code}-genz-pass.png`}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white hover:bg-neutral-200 text-xs font-semibold text-[#08090C] transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  {t.downloadPng}
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

