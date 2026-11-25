import React, { useEffect, useRef, useState } from 'react';
import { Lock, Maximize2 } from 'lucide-react';
import type { Booking } from '../types';
import { canDisplayBookingQr } from '../utils/bookingLogic';
import { getTicketDesignForTier, TICKET_STUB_SLOT } from '../utils/ticketDesign';
import { useLanguage } from '../i18n/LanguageContext';

interface TicketVisualCardProps {
  booking: Booking;
  qrDataUrl?: string;
  onEnlargeQr?: () => void;
}

export const TicketVisualCard: React.FC<TicketVisualCardProps> = ({
  booking,
  qrDataUrl,
  onEnlargeQr,
}) => {
  const { t } = useLanguage();
  const [imgFailed, setImgFailed] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const design = getTicketDesignForTier(booking.tier);
  const isPaid = canDisplayBookingQr(booking);

  useEffect(() => {
    setImgFailed(false);
    const el = imgRef.current;
    setImgLoaded(Boolean(el && el.complete && el.naturalWidth > 0));
  }, [design.imagePath]);

  const showStubBackground = imgLoaded || imgFailed;

  return (
    <div
      dir="ltr"
      className="relative w-full aspect-[3/1] rounded-xl overflow-hidden bg-[#08090C] border border-white/15 shadow-lg select-none"
      data-testid={`ticket-visual-${booking.bookingCode}`}
    >
      {!imgFailed && !imgLoaded && (
        <div
          aria-hidden="true"
          className="absolute inset-0 animate-pulse"
          style={{
            background: `linear-gradient(110deg, #0A0C12 0%, ${design.stubMid} 55%, #0A0C12 100%)`,
          }}
        />
      )}

      {!imgFailed ? (
        <img
          ref={imgRef}
          src={design.imagePath}
          alt={`${booking.concertTitle} — ${design.label}`}
          loading="eager"
          decoding="async"
          onLoad={() => setImgLoaded(true)}
          onError={() => setImgFailed(true)}
          className={`w-full h-full object-cover block transition-opacity duration-200 ${
            imgLoaded ? 'opacity-100' : 'opacity-0'
          }`}
        />
      ) : (
        <div
          className="w-full h-full flex items-center justify-between px-6"
          style={{
            background: `linear-gradient(120deg, #08090C 0%, ${design.stubMid} 70%, ${design.stubBottom} 100%)`,
          }}
        >
          <div className="space-y-1 max-w-[70%]">
            <p className="text-[11px] font-mono-num uppercase tracking-widest text-slate-300">
              GEN Z EVENTS · {design.label}
            </p>
            <p className="font-display font-bold text-lg sm:text-2xl text-white truncate">
              {booking.concertTitle}
            </p>
            <p className="text-xs text-slate-300 truncate">
              {booking.concertDate} · {booking.concertTime} · {booking.concertVenue}
            </p>
          </div>
        </div>
      )}

      {/* Official Digital QR Seal mounted cleanly over the physical OFFICIAL STAMP circle */}
      <div
        className={`absolute flex flex-col items-center justify-between p-[1%] rounded-[9%] border shadow-[0_10px_28px_rgba(0,0,0,0.72)] transition-opacity duration-200 ${
          showStubBackground ? 'opacity-100' : 'opacity-0'
        }`}
        style={{
          left: `${TICKET_STUB_SLOT.patchLeft * 100}%`,
          width: `${TICKET_STUB_SLOT.patchWidth * 100}%`,
          top: `${TICKET_STUB_SLOT.patchTop * 100}%`,
          height: `${TICKET_STUB_SLOT.patchHeight * 100}%`,
          background: `linear-gradient(180deg, ${design.stubTop} 0%, #090B10 55%, ${design.stubBottom} 100%)`,
          borderColor: design.accentHex,
        }}
      >
        <div className="relative z-10 flex flex-col items-center justify-between w-full h-full py-[2%]">
          {isPaid && qrDataUrl ? (
            <button
              type="button"
              onClick={onEnlargeQr}
              aria-label={`${t.enlargeQrAria} (${booking.bookingCode})`}
              title={t.tapQrToEnlarge}
              className="group relative w-[88%] aspect-square rounded-[7%] bg-white p-[3.2%] shadow-[0_6px_18px_rgba(0,0,0,0.55)] ring-1 ring-white/25 hover:ring-2 hover:ring-white transition-transform hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <img
                src={qrDataUrl}
                alt={`QR ${booking.bookingCode}`}
                className="w-full h-full block rounded-[2%]"
              />
              <span
                aria-hidden="true"
                className="hidden sm:flex items-center justify-center absolute -bottom-1.5 -right-1.5 w-5 h-5 rounded-full bg-[#08090C]/90 border border-white/30 text-white opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Maximize2 className="w-2.5 h-2.5" />
              </span>
            </button>
          ) : (
            <div className="w-[88%] aspect-square rounded-[7%] border border-amber-400/45 bg-black/70 flex flex-col items-center justify-center p-1 text-center text-amber-300 gap-0.5">
              <Lock className="w-3 h-3 sm:w-4 sm:h-4 shrink-0" />
              <span className="text-[6px] sm:text-[9px] font-bold uppercase leading-tight">
                {t.qrLocked}
              </span>
            </div>
          )}

          <p
            className="font-mono-num text-[7px] sm:text-[10px] md:text-[11px] font-bold text-white leading-none tracking-wider truncate max-w-full drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)]"
            dir="ltr"
          >
            {booking.bookingCode}
          </p>
        </div>
      </div>
    </div>
  );
};
