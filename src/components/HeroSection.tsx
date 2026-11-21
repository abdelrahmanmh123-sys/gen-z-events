import React, { useEffect, useState } from 'react';
import { ArrowRight, Calendar, MapPin, Tag } from 'lucide-react';
import { HERO_IMAGE_PATH } from '../data/defaults';
import type { Concert, Promo } from '../types';
import { computeCountdown, getTierUnitPrice } from '../utils/bookingLogic';

interface HeroSectionProps {
  nextConcert: Concert | null;
  activePromos: Promo[];
  onBookConcert: (concert: Concert) => void;
  onCopyPromo: (code: string) => void;
}

export const HeroSection: React.FC<HeroSectionProps> = ({
  nextConcert,
  activePromos,
  onBookConcert,
  onCopyPromo,
}) => {
  const [nowMs, setNowMs] = useState(() => Date.now());

  const nextConcertDate = nextConcert?.isoDate ?? '';
  const nextConcertTime = nextConcert?.isoTime ?? '';

  useEffect(() => {
    if (!nextConcertDate) return;
    const now = Date.now();
    setNowMs(now);
    if (computeCountdown(nextConcertDate, nextConcertTime, now).isPast) {
      return;
    }
    const id = window.setInterval(() => {
      const tickNow = Date.now();
      setNowMs(tickNow);
      if (computeCountdown(nextConcertDate, nextConcertTime, tickNow).isPast) {
        window.clearInterval(id);
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [nextConcertDate, nextConcertTime]);

  const countdown = nextConcert
    ? computeCountdown(nextConcert.isoDate, nextConcert.isoTime, nowMs)
    : null;

  return (
    <section id="top" className="relative overflow-hidden border-b border-white/10">
      {/* Background Stage Photo with Atmospheric Vignette */}
      <div className="absolute inset-0">
        <img
          src={HERO_IMAGE_PATH}
          alt="Live concert stage in Qena with crowd lights"
          className="w-full h-full object-cover object-center opacity-40"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#08090C] via-[#08090C]/85 to-[#08090C]/45" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#08090C] via-transparent to-[#08090C]/40" />
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 pb-12 lg:pt-20 lg:pb-16">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-8 items-end">
          {/* Left Editorial Pitch */}
          <div className="lg:col-span-7 space-y-6">
            <p className="text-xs font-mono-num uppercase tracking-[0.22em] text-rose-400 font-semibold">
              Qena Live · Winter 2026/27 Season
            </p>
            <h1 className="font-display font-extrabold text-4xl sm:text-5xl lg:text-[3.75rem] leading-[1.06] tracking-tight text-white">
              Upper Egypt&apos;s stage for live sound &amp; night culture.
            </h1>
            <p className="text-base sm:text-lg text-slate-300 max-w-xl leading-relaxed">
              Reserve Silver, Gold, VIP, or Private Lounge passes across Qena&apos;s flagship open-air arenas with instant QR gate check-in.
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <a
                href="#lineup"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold text-sm transition-colors"
              >
                Explore Lineup
                <ArrowRight className="w-4 h-4" />
              </a>
              <a
                href="#passes"
                className="inline-flex items-center gap-2 px-5 py-3 rounded-lg border border-white/15 bg-white/[0.04] hover:bg-white/[0.08] text-slate-100 font-medium text-sm transition-colors"
              >
                Compare Pass Tiers
              </a>
            </div>
          </div>

          {/* Right Next-Show Countdown Panel */}
          {nextConcert && countdown && (
            <div className="lg:col-span-5">
              <div className="bg-[#101218]/90 backdrop-blur-md border border-white/12 rounded-xl p-5 sm:p-6 space-y-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <p className="text-[11px] font-mono-num uppercase tracking-[0.18em] text-amber-300 font-semibold">
                      Next Up in Qena
                    </p>
                    <h2 className="font-display font-bold text-xl text-white leading-snug">
                      {nextConcert.title}
                    </h2>
                    <p className="text-sm text-slate-300">{nextConcert.artist}</p>
                  </div>
                  <span className="font-mono-num text-sm font-bold text-white shrink-0">
                    {getTierUnitPrice(nextConcert, 'Silver')} EGP+
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-400">
                  <span className="inline-flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-rose-400" />
                    {nextConcert.date} · {nextConcert.time}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-rose-400" />
                    {nextConcert.venue}
                  </span>
                </div>

                {/* Live Tabular Countdown */}
                <div className="grid grid-cols-4 gap-2 pt-1">
                  {[
                    { label: 'Days', value: countdown.days },
                    { label: 'Hours', value: countdown.hours },
                    { label: 'Mins', value: countdown.mins },
                    { label: 'Secs', value: countdown.secs },
                  ].map((unit) => (
                    <div
                      key={unit.label}
                      className="bg-[#08090C] border border-white/10 rounded-lg py-2.5 text-center"
                    >
                      <div className="font-mono-num text-xl sm:text-2xl font-bold text-white leading-none">
                        {String(unit.value).padStart(2, '0')}
                      </div>
                      <div className="text-[10px] uppercase tracking-widest text-slate-400 mt-1.5">
                        {unit.label}
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => onBookConcert(nextConcert)}
                  className="w-full py-2.5 px-4 rounded-lg bg-white text-[#08090C] hover:bg-slate-200 font-semibold text-sm transition-colors"
                >
                  {nextConcert.seatsLeft > 0 ? 'Book Next Show' : 'Join Waitlist'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Slim Live Promo Strip */}
        {activePromos.length > 0 && (
          <div className="mt-10 pt-5 border-t border-white/10 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
            <span className="inline-flex items-center gap-1.5 uppercase tracking-[0.16em] text-slate-400 font-semibold">
              <Tag className="w-3.5 h-3.5 text-rose-400" />
              Active Club Codes
            </span>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              {activePromos.map((promo) => (
                <button
                  key={promo.code}
                  type="button"
                  onClick={() => onCopyPromo(promo.code)}
                  className="inline-flex items-center gap-2 text-slate-200 hover:text-white transition-colors group"
                >
                  <span className="font-mono-num font-bold text-rose-400 group-hover:text-rose-300 underline decoration-rose-500/40 underline-offset-4">
                    {promo.code}
                  </span>
                  <span className="text-slate-400">{promo.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
