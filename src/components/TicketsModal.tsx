import React, { useEffect, useState } from 'react';
import {
  CalendarPlus,
  CheckCircle2,
  Copy,
  Download,
  Lock,
  MessageCircle,
  Ticket,
  Trash2,
  X,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import { cancelPendingBooking } from '../services/firestoreService';
import { formatFriendlyFirebaseError } from '../firebase';
import type { Booking, Concert } from '../types';
import { buildCalendarIcs, isPendingEmailVerification, isVerifiedFanAccount } from '../utils/bookingLogic';
import { copyTextToClipboard, generateQrDataUrl, renderTicketPassPng, triggerFileDownload } from '../utils/passExport';

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
  const [qrMap, setQrMap] = useState<Record<string, string>>({});
  const [previewPng, setPreviewPng] = useState<{ code: string; dataUrl: string } | null>(null);
  const [confirmCancelCode, setConfirmCancelCode] = useState<string | null>(null);
  const [busyCode, setBusyCode] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setPreviewPng(null);
      setConfirmCancelCode(null);
      setQrMap({});
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (previewPng) {
          setPreviewPng(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, previewPng, onClose]);

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
    try {
      const dataUrl = await renderTicketPassPng(booking);
      setPreviewPng({ code: booking.bookingCode, dataUrl });
    } catch {
      onNotify('Could not render PNG pass.');
    }
  };

  const handleDownloadIcs = (booking: Booking) => {
    const show = concerts.find((c) => c.id === booking.concertId);
    const ics = buildCalendarIcs(booking, show);
    triggerFileDownload(`${booking.bookingCode}-genz-events.ics`, ics, 'text/calendar;charset=utf-8');
    onNotify('Calendar invite downloaded.');
  };

  const buildWhatsAppHref = (booking: Booking) => {
    const text = encodeURIComponent(
      `Gen Z Events E-Pass\nCode: ${booking.bookingCode}\nShow: ${booking.concertTitle}\nDate: ${booking.concertDate} · ${booking.concertTime}\nVenue: ${booking.concertVenue}\nPass: ${booking.quantity}x ${booking.tier} (${booking.totalEgp.toLocaleString()} EGP)\nStatus: ${booking.paymentStatus}`,
    );
    return `https://wa.me/?text=${text}`;
  };

  const handleCancelBooking = async (bookingCode: string) => {
    setBusyCode(bookingCode);
    try {
      await cancelPendingBooking(bookingCode);
      setConfirmCancelCode(null);
      onNotify(`Cancelled reservation ${bookingCode}.`);
    } catch (err) {
      onNotify(formatFriendlyFirebaseError(err));
    } finally {
      setBusyCode(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="My booked tickets"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-3xl bg-[#101218] border border-white/15 rounded-xl shadow-2xl overflow-hidden my-auto">
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Ticket className="w-4 h-4 text-white" />
            <h2 className="font-display font-bold text-lg text-white">My Booked Tickets</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close tickets modal"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 max-h-[80vh] overflow-y-auto space-y-4">
          {!isVerifiedFanAccount(user) ? (
            <div className="py-12 text-center space-y-4">
              <Ticket className="w-10 h-10 text-slate-500 mx-auto" />
              <div className="space-y-1">
                <p className="font-display font-bold text-lg text-white">
                  {isPendingEmailVerification(user)
                    ? 'Verify your email to view your passes'
                    : 'Sign in to view your passes'}
                </p>
                <p className="text-sm text-slate-400 max-w-sm mx-auto">
                  {isPendingEmailVerification(user)
                    ? `Confirm the link sent to ${user?.email} to activate your account and sync your concert passes.`
                    : 'Your QR passes, payment verification status, and downloadable PNG tickets sync automatically with your verified account.'}
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
                {isPendingEmailVerification(user) ? 'Open Email Verification' : 'Sign In / Create Account'}
              </button>
            </div>
          ) : bookings.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <Ticket className="w-10 h-10 text-slate-500 mx-auto" />
              <p className="font-display font-bold text-lg text-white">No concert passes yet</p>
              <p className="text-sm text-slate-400">
                Book any live show in Qena and your pass will appear here instantly.
              </p>
            </div>
          ) : (
            bookings.map((b) => {
              const isPaid = b.paymentStatus === 'Paid';
              return (
                <div
                  key={b.bookingCode}
                  className="bg-[#08090C] border border-white/10 rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row gap-5"
                >
                  {/* QR Stub */}
                  <div className="sm:w-40 shrink-0 flex flex-col items-center justify-center bg-[#101218] border border-white/10 rounded-lg p-3 text-center">
                    {isPaid && qrMap[b.bookingCode] ? (
                      <img
                        src={qrMap[b.bookingCode]}
                        alt={`Gate QR for ${b.bookingCode}`}
                        className="w-32 h-32 rounded bg-white p-1"
                      />
                    ) : (
                      <div className="w-32 h-32 rounded border border-amber-400/35 bg-amber-400/5 flex flex-col items-center justify-center p-2 text-amber-300 space-y-1.5">
                        <Lock className="w-6 h-6" />
                        <span className="text-[11px] font-bold uppercase tracking-wider">QR Locked</span>
                        <span className="text-[10px] text-slate-400 leading-tight">
                          Unlocks after transfer check
                        </span>
                      </div>
                    )}
                    <p className="font-mono-num text-xs font-bold text-white mt-2.5">
                      {b.bookingCode}
                    </p>
                  </div>

                  {/* Ticket Details */}
                  <div className="flex-1 min-w-0 flex flex-col justify-between gap-4">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="font-display font-bold text-lg text-white truncate">
                          {b.concertTitle}
                        </h3>
                        <span
                          className={`text-[11px] font-mono-num font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${
                            b.checkedIn
                              ? 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10'
                              : isPaid
                                ? 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10'
                                : 'text-amber-300 border-amber-400/40 bg-amber-400/10'
                          }`}
                        >
                          {b.checkedIn ? 'Checked In' : isPaid ? 'Paid · QR Ready' : 'Pending Verification'}
                        </span>
                      </div>

                      <p className="text-xs text-slate-300">
                        {b.concertDate} · {b.concertTime} · {b.concertVenue}
                      </p>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 text-xs">
                        <div>
                          <span className="text-slate-500 block">Tier</span>
                          <span className="font-semibold text-white">{b.tier}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block">Guests</span>
                          <span className="font-mono-num font-semibold text-white">{b.quantity}x</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block">Total</span>
                          <span className="font-mono-num font-semibold text-white">
                            {b.totalEgp.toLocaleString()} EGP
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500 block">{b.paymentMethod}</span>
                          <span className="font-mono-num text-slate-300 truncate block">{b.transferRef}</span>
                        </div>
                      </div>
                    </div>

                    {/* Ticket Actions */}
                    <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-white/8">
                      <button
                        type="button"
                        onClick={() => {
                          void copyTextToClipboard(b.bookingCode).then(() => {
                            onNotify(`Copied booking code ${b.bookingCode}`);
                          });
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/12 bg-white/[0.04] hover:bg-white/[0.08] text-xs font-medium text-white"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        Copy Code
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleOpenPngPreview(b)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/12 bg-white/[0.04] hover:bg-white/[0.08] text-xs font-medium text-white"
                      >
                        <Download className="w-3.5 h-3.5" />
                        E-Pass PNG
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDownloadIcs(b)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/12 bg-white/[0.04] hover:bg-white/[0.08] text-xs font-medium text-white"
                      >
                        <CalendarPlus className="w-3.5 h-3.5" />
                        .ICS
                      </button>
                      <a
                        href={buildWhatsAppHref(b)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/12 bg-white/[0.04] hover:bg-white/[0.08] text-xs font-medium text-white"
                      >
                        <MessageCircle className="w-3.5 h-3.5 text-emerald-400" />
                        WhatsApp
                      </a>

                      {!isPaid && !b.checkedIn && (
                        confirmCancelCode === b.bookingCode ? (
                          <div className="flex items-center gap-1.5 ml-auto">
                            <button
                              type="button"
                              disabled={busyCode === b.bookingCode}
                              onClick={() => void handleCancelBooking(b.bookingCode)}
                              className="px-2.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-xs font-semibold text-white"
                            >
                              {busyCode === b.bookingCode ? 'Cancelling...' : 'Confirm Cancel'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmCancelCode(null)}
                              className="px-2 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white"
                            >
                              Keep
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmCancelCode(b.bookingCode)}
                            className="ml-auto inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-rose-400 hover:bg-rose-500/10"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Cancel
                          </button>
                        )
                      )}

                      {b.checkedIn && (
                        <span className="ml-auto inline-flex items-center gap-1 text-xs text-emerald-400">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Entered {b.checkedInAt}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* PNG E-Pass Preview Sub-Modal */}
      {previewPng && (
        <div className="fixed inset-0 z-[60] bg-black/85 flex items-center justify-center p-4">
          <div className="max-w-3xl w-full bg-[#101218] border border-white/15 rounded-xl overflow-hidden shadow-2xl">
            <div className="px-5 py-3.5 border-b border-white/10 flex items-center justify-between">
              <p className="font-mono-num text-sm font-bold text-white">
                E-Pass · {previewPng.code}
              </p>
              <button
                type="button"
                onClick={() => setPreviewPng(null)}
                aria-label="Close E-Pass preview"
                className="p-1 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <img
                src={previewPng.dataUrl}
                alt={`Rendered concert E-Pass ${previewPng.code}`}
                className="w-full rounded-lg border border-white/10"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setPreviewPng(null)}
                  className="px-4 py-2 rounded-lg border border-white/12 text-xs font-medium text-slate-300 hover:text-white"
                >
                  Close
                </button>
                <a
                  href={previewPng.dataUrl}
                  download={`${previewPng.code}-genz-pass.png`}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white hover:bg-neutral-200 text-xs font-semibold text-[#08090C] transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download PNG
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
