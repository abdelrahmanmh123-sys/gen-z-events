import React, { useEffect, useRef, useState } from 'react';
import { Calendar, Check, Heart, MapPin, Share2 } from 'lucide-react';
import { HERO_IMAGE_PATH } from '../data/defaults';
import { useLanguage } from '../i18n/LanguageContext';
import { formatCurrencyEgp, getGenreLabel } from '../i18n/translations';
import type { Concert } from '../types';
import { getTierUnitPrice } from '../utils/bookingLogic';
import { shareConcertDetails } from '../utils/shareConcert';

interface ConcertCardProps {
  concert: Concert;
  isFavorite: boolean;
  onToggleFavorite: (concertId: string) => void;
  onBook: (concert: Concert) => void;
  onNotify?: (message: string) => void;
}

const STAGE_MOODS: Record<string, { tint: string; objectPos: string }> = {
  'Indie Pop / Rap': {
    tint: 'from-rose-600/35 via-transparent to-[#101218]',
    objectPos: 'object-center',
  },
  'Electronic / Indie': {
    tint: 'from-cyan-500/35 via-indigo-900/20 to-[#101218]',
    objectPos: 'object-right',
  },
  'Acoustic / Fusion': {
    tint: 'from-amber-500/35 via-orange-950/20 to-[#101218]',
    objectPos: 'object-left',
  },
  'Alternative Rock': {
    tint: 'from-fuchsia-600/35 via-purple-950/20 to-[#101218]',
    objectPos: 'object-top',
  },
  'Hip-Hop / Pop': {
    tint: 'from-emerald-500/30 via-teal-950/20 to-[#101218]',
    objectPos: 'object-bottom',
  },
  'Shaabi / Urban': {
    tint: 'from-amber-400/35 via-rose-950/25 to-[#101218]',
    objectPos: 'object-[65%_35%]',
  },
};

export const ConcertCard: React.FC<ConcertCardProps> = ({
  concert,
  isFavorite,
  onToggleFavorite,
  onBook,
  onNotify,
}) => {
  const { lang, t } = useLanguage();
  const [shareFeedback, setShareFeedback] = useState<'idle' | 'copied'>('idle');
  const feedbackTimerRef = useRef<number | null>(null);
  const soldOut = concert.seatsLeft <= 0;
  const startingPrice = getTierUnitPrice(concert, 'Silver');
  const mood = STAGE_MOODS[concert.genre] || STAGE_MOODS['Indie Pop / Rap'];
  const compactDate = concert.date.replace(/,\s*\d{4}$/, '');

  useEffect(() => {
    return () => {
      if (feedbackTimerRef.current) {
        window.clearTimeout(feedbackTimerRef.current);
      }
    };
  }, []);

  const handleShare = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const outcome = await shareConcertDetails(concert, { lang });
    if (outcome === 'shared') {
      onNotify?.(t.toastEventShared);
    } else if (outcome === 'copied') {
      setShareFeedback('copied');
      if (feedbackTimerRef.current) window.clearTimeout(feedbackTimerRef.current);
      feedbackTimerRef.current = window.setTimeout(() => setShareFeedback('idle'), 2000);
      onNotify?.(t.toastEventCopied);
    } else if (outcome === 'failed') {
      onNotify?.(t.toastEventShareFailed);
    }
  };

  return (
    <article className="group flex flex-col bg-[#101218] border border-white/10 hover:border-white/25 rounded-xl overflow-hidden transition-all duration-200 hover:-translate-y-0.5">
      {/* Uniform 16:10 Poster Header with Distinct Stage Lighting Mood */}
      <div className="relative aspect-[16/10] bg-[#161923] overflow-hidden">
        <img
          src={concert.posterUrl || HERO_IMAGE_PATH}
          alt={concert.title}
          className={`w-full h-full object-cover ${concert.posterUrl ? 'object-center' : mood.objectPos} group-hover:scale-[1.03] transition-transform duration-500`}
          loading="lazy"
        />
        <div
          className={`absolute inset-0 bg-gradient-to-b ${concert.posterUrl ? 'from-black/15 via-[#101218]/25 to-[#101218]' : mood.tint}`}
        />

        {/* Top-End Action Controls */}
        <div className="absolute top-3 end-3 flex items-center gap-1.5">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite(concert.id);
            }}
            aria-label={`${isFavorite ? t.removeFavAria : t.saveFavAria}: ${concert.title}`}
            className={`w-8 h-8 rounded-lg flex items-center justify-center backdrop-blur-md border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${
              isFavorite
                ? 'bg-white border-white text-[#08090C]'
                : 'bg-black/55 border-white/15 text-slate-200 hover:bg-black/80'
            }`}
          >
            <Heart className={`w-4 h-4 ${isFavorite ? 'fill-current' : ''}`} />
          </button>
          <button
            type="button"
            onClick={(e) => void handleShare(e)}
            aria-label={`${t.shareEventAria}: ${concert.title}`}
            className={`h-8 px-2.5 rounded-lg inline-flex items-center gap-1.5 backdrop-blur-md border text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${
              shareFeedback === 'copied'
                ? 'bg-emerald-500/25 border-emerald-400/50 text-emerald-200'
                : 'bg-black/60 border-white/15 text-slate-100 hover:bg-black/85'
            }`}
          >
            {shareFeedback === 'copied' ? (
              <Check className="w-3.5 h-3.5 text-emerald-300" />
            ) : (
              <Share2 className="w-3.5 h-3.5" />
            )}
            <span>{shareFeedback === 'copied' ? t.shareCopiedLabel : t.shareLabel}</span>
          </button>
        </div>

        {/* Clean Sold Out Status Tag Only */}
        {soldOut && (
          <div className="absolute bottom-3 start-4">
            <span className="text-[11px] font-bold uppercase tracking-[0.12em] rtl:tracking-normal px-2 py-0.5 rounded bg-black/80 border text-rose-300 border-rose-500/40">
              {t.soldOut}
            </span>
          </div>
        )}
      </div>

      {/* Card Body — Crisp Unclipped Metadata & Uniform Baseline */}
      <div className="flex flex-col flex-1 p-5 space-y-3">
        <div className="flex items-center justify-between gap-2 text-[11px]">
          <span className="uppercase tracking-[0.1em] rtl:tracking-normal text-neutral-300 font-semibold truncate">
            {getGenreLabel(concert.genre, lang)}
          </span>
          <span
            dir="ltr"
            className="inline-flex items-center gap-1 font-mono-num text-slate-300 shrink-0 whitespace-nowrap"
          >
            <Calendar className="w-3 h-3 text-slate-500" />
            {compactDate} · {concert.time}
          </span>
        </div>

        <div className="space-y-1">
          <h3 className="font-display font-bold text-lg text-white leading-snug line-clamp-1">
            {concert.title}
          </h3>
          <p className="text-sm text-slate-300 line-clamp-1">{concert.artist}</p>
        </div>

        <p className="text-xs text-slate-400 inline-flex items-center gap-1.5 line-clamp-1">
          <MapPin className="w-3.5 h-3.5 text-neutral-300 shrink-0" />
          <span className="truncate">{concert.venue}</span>
        </p>

        <p className="text-xs text-slate-400 leading-relaxed line-clamp-2">
          {concert.description}
        </p>

        {/* Aligned Price & CTA Footer */}
        <div className="mt-auto pt-4 border-t border-white/8 flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-wider rtl:tracking-normal text-slate-500 font-semibold">
              {t.startingFrom}
            </p>
            <p className="font-modern-price text-base font-bold tracking-tight rtl:tracking-normal text-white">
              {formatCurrencyEgp(startingPrice, lang)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onBook(concert)}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 ${
              soldOut
                ? 'border border-white/15 bg-white/[0.05] hover:bg-white/[0.1] text-white'
                : 'bg-white hover:bg-neutral-200 text-[#08090C]'
            }`}
          >
            {soldOut ? t.joinWaitlist : t.bookPass}
          </button>
        </div>
      </div>
    </article>
  );
};
