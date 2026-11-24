import React, { useState } from 'react';
import { CalendarPlus, ImageUp, Wand2, X } from 'lucide-react';
import { DEFAULT_TIER_COLORS } from '../../data/defaults';
import { adminSaveConcert } from '../../services/firestoreService';
import { formatFriendlyFirebaseError } from '../../firebase';
import { useLanguage } from '../../i18n/LanguageContext';
import { getTierCopy, localizeKnownMessage } from '../../i18n/translations';
import type { TierColors, TierId } from '../../types';
import {
  formatDateTimeDisplay,
  getDefaultUpcomingIsoDate,
  isSafeImageUrl,
  MAX_POSTER_DATA_URL_LENGTH,
  parseBoundedIntInput,
  sanitizeId,
  suggestTierPrices,
  validateTierColors,
} from '../../utils/bookingLogic';
import { compressPosterImage } from '../../utils/passExport';
import { TierColorEditor } from './TierColorEditor';

interface AdminScheduleProps {
  onNotify: (msg: string) => void;
  onCreated: () => void;
}

export const AdminSchedule: React.FC<AdminScheduleProps> = ({ onNotify, onCreated }) => {
  const { lang, t } = useLanguage();
  const isAr = lang === 'ar';

  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [venue, setVenue] = useState('Qena Cultural Palace Arena');
  const [genre, setGenre] = useState('Indie Pop / Rap');
  const [isoDate, setIsoDate] = useState(() => getDefaultUpcomingIsoDate());
  const [isoTime, setIsoTime] = useState('20:00');
  const [totalSeats, setTotalSeats] = useState('140');
  const [silver, setSilver] = useState('200');
  const [gold, setGold] = useState('290');
  const [vip, setVip] = useState('420');
  const [lounge, setLounge] = useState('640');
  const [useCustomColors, setUseCustomColors] = useState(false);
  const [tierColors, setTierColors] = useState<TierColors>(() => ({ ...DEFAULT_TIER_COLORS }));
  const [hexDrafts, setHexDrafts] = useState<TierColors>(() => ({ ...DEFAULT_TIER_COLORS }));
  const [posterUrl, setPosterUrl] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);

  const handleAutoSuggest = () => {
    const parsedSilver = parseBoundedIntInput(silver, 50, 100000);
    const suggested = suggestTierPrices(parsedSilver.valid ? parsedSilver.value : 200);
    setSilver(String(suggested.Silver));
    setGold(String(suggested.Gold));
    setVip(String(suggested.VIP));
    setLounge(String(suggested.Lounge));
    onNotify(
      isAr
        ? 'تم تطبيق الأسعار المقترحة لجميع الفئات بناءً على سعر سيلفر.'
        : 'Applied suggested tier pricing from Silver base.',
    );
  };

  const handleChangeTierColor = (tier: TierId, hex: string) => {
    const upper = hex.toUpperCase();
    setTierColors((prev) => ({ ...prev, [tier]: upper }));
    setHexDrafts((prev) => ({ ...prev, [tier]: upper }));
  };

  const handleChangeHexDraft = (tier: TierId, raw: string) => {
    setHexDrafts((prev) => ({ ...prev, [tier]: raw }));
  };

  const handleResetColors = () => {
    setTierColors({ ...DEFAULT_TIER_COLORS });
    setHexDrafts({ ...DEFAULT_TIER_COLORS });
    onNotify(
      isAr
        ? 'تمت إعادة ألوان فئات التذاكر إلى الألوان الافتراضية.'
        : 'Reset ticket category colors to default palette.',
    );
  };

  const handleUploadPoster = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressPosterImage(file);
      setPosterUrl(compressed);
      onNotify(isAr ? 'تم ضغط صورة البوستر وتجهيزها.' : 'Poster image compressed and ready.');
    } catch (err) {
      onNotify(
        err instanceof Error
          ? err.message
          : isAr
            ? 'تعذر ضغط صورة البوستر.'
            : 'Failed to compress poster.',
      );
    }
    e.target.value = '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitle = title.trim();
    if (
      cleanTitle.length < 2 ||
      artist.trim().length < 2 ||
      venue.trim().length < 2 ||
      genre.trim().length < 2 ||
      description.trim().length < 4
    ) {
      onNotify(
        isAr
          ? 'يرجى استكمال اسم الحفل والفنان والمكان والتصنيف والوصف.'
          : 'Please complete title, artist, venue, genre, and description.',
      );
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate) || !/^\d{2}:\d{2}$/.test(isoTime)) {
      onNotify(
        isAr
          ? 'يرجى اختيار تاريخ ووقت بداية صحيحين للحفل.'
          : 'Please pick a valid event date and start time.',
      );
      return;
    }
    const trimmedPoster = posterUrl.trim();
    if (trimmedPoster.length > MAX_POSTER_DATA_URL_LENGTH) {
      onNotify(
        isAr
          ? 'حجم صورة البوستر أو الرابط كبير جداً. يرجى رفع صورة أصغر أو رابط HTTPS أقصر.'
          : 'Poster image or URL is too large. Please upload a smaller image or shorter HTTPS link.',
      );
      return;
    }
    if (trimmedPoster.length > 0 && !isSafeImageUrl(trimmedPoster)) {
      onNotify(
        isAr
          ? 'يجب أن يبدأ رابط البوستر بـ https:// أو استخدام زر رفع صورة (JPG/PNG/WebP).'
          : 'Poster URL must start with https:// or use Upload Image (JPG/PNG/WebP).',
      );
      return;
    }

    const seatsParsed = parseBoundedIntInput(totalSeats, 10, 50000);
    if (!seatsParsed.valid) {
      onNotify(
        isAr
          ? 'يجب أن تكون السعة الإجمالية عدداً صحيحاً بين 10 و 50,000.'
          : 'Total capacity must be a whole number between 10 and 50,000.',
      );
      return;
    }
    const silverParsed = parseBoundedIntInput(silver, 0, 100000);
    const goldParsed = parseBoundedIntInput(gold, 0, 100000);
    const vipParsed = parseBoundedIntInput(vip, 0, 100000);
    const loungeParsed = parseBoundedIntInput(lounge, 0, 100000);
    if (!silverParsed.valid || !goldParsed.valid || !vipParsed.valid || !loungeParsed.valid) {
      onNotify(
        isAr
          ? 'يجب أن تكون أسعار جميع الفئات أعداداً صحيحة بين 0 و 100,000 ج.م.'
          : 'All tier prices must be valid whole numbers between 0 and 100,000 EGP.',
      );
      return;
    }

    let resolvedTierColors: TierColors | undefined;
    if (useCustomColors) {
      const colorCheck = validateTierColors(hexDrafts);
      if (!colorCheck.valid || !colorCheck.normalized) {
        onNotify(
          isAr
            ? 'يرجى تصحيح أكواد الألوان (Hex) غير الصالحة قبل النشر.'
            : colorCheck.error || 'Please fix invalid hex colors before publishing.',
        );
        return;
      }
      resolvedTierColors = colorCheck.normalized;
    }

    const formatted = formatDateTimeDisplay(isoDate, isoTime);
    const id = `${sanitizeId(cleanTitle, 'qena')}-${Date.now().toString(36).slice(-4)}`;

    setBusy(true);
    try {
      await adminSaveConcert(
        {
          id,
          title: cleanTitle.slice(0, 120),
          artist: artist.trim().slice(0, 120),
          venue: venue.trim().slice(0, 140),
          isoDate,
          isoTime,
          date: formatted.date,
          time: formatted.time,
          doors: formatted.doors,
          genre: genre.trim().slice(0, 60),
          priceEgp: silverParsed.value,
          tierPrices: {
            Silver: silverParsed.value,
            Gold: goldParsed.value,
            VIP: vipParsed.value,
            Lounge: loungeParsed.value,
          },
          tierSeatsLeft: {
            Silver: Math.round(seatsParsed.value * 0.4),
            Gold: Math.round(seatsParsed.value * 0.3),
            VIP: Math.round(seatsParsed.value * 0.2),
            Lounge: Math.max(0, seatsParsed.value - Math.round(seatsParsed.value * 0.9)),
          },
          ...(resolvedTierColors ? { tierColors: resolvedTierColors } : {}),
          totalSeats: seatsParsed.value,
          seatsLeft: seatsParsed.value,
          description: description.trim().slice(0, 800),
          posterUrl: trimmedPoster,
        },
        false,
      );
      setTitle('');
      setArtist('');
      setDescription('');
      setPosterUrl('');
      setUseCustomColors(false);
      setTierColors({ ...DEFAULT_TIER_COLORS });
      setHexDrafts({ ...DEFAULT_TIER_COLORS });
      onNotify(
        isAr
          ? `تم نشر حفل «${cleanTitle}» في جدول حفلات قنا المباشر.`
          : `Published "${cleanTitle}" to the live Qena lineup.`,
      );
      onCreated();
    } catch (err) {
      onNotify(localizeKnownMessage(formatFriendlyFirebaseError(err), lang));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-3xl bg-[#101218] border border-white/10 rounded-xl p-6 space-y-6">
      <div>
        <h2 className="font-display font-bold text-xl text-white">{t.scheduleTitle}</h2>
        <p className="text-xs text-slate-400">{t.scheduleSubtitle}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="sch-title" className="block text-xs font-medium text-slate-300 mb-1.5">
              {t.concertTitleLabel}
            </label>
            <input
              id="sch-title"
              type="text"
              required
              maxLength={120}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg bg-[#08090C] border border-white/12 text-sm text-white focus:outline-none focus:border-white/50"
            />
          </div>
          <div>
            <label htmlFor="sch-artist" className="block text-xs font-medium text-slate-300 mb-1.5">
              {t.headlinerArtistLabel}
            </label>
            <input
              id="sch-artist"
              type="text"
              required
              maxLength={120}
              value={artist}
              onChange={(e) => setArtist(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg bg-[#08090C] border border-white/12 text-sm text-white focus:outline-none focus:border-white/50"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="sm:col-span-2">
            <label htmlFor="sch-venue" className="block text-xs font-medium text-slate-300 mb-1.5">
              {t.venueQenaLabel}
            </label>
            <input
              id="sch-venue"
              type="text"
              required
              maxLength={140}
              value={venue}
              onChange={(e) => setVenue(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg bg-[#08090C] border border-white/12 text-sm text-white focus:outline-none focus:border-white/50"
            />
          </div>
          <div>
            <label htmlFor="sch-genre" className="block text-xs font-medium text-slate-300 mb-1.5">
              {t.vibeGenreLabel}
            </label>
            <input
              id="sch-genre"
              type="text"
              required
              maxLength={60}
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg bg-[#08090C] border border-white/12 text-sm text-white focus:outline-none focus:border-white/50"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label htmlFor="sch-date" className="block text-xs font-medium text-slate-300 mb-1.5">
              {t.eventDateLabel}
            </label>
            <input
              id="sch-date"
              type="date"
              dir="ltr"
              required
              value={isoDate}
              onChange={(e) => setIsoDate(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg bg-[#08090C] border border-white/12 text-sm text-white font-mono-num focus:outline-none focus:border-white/50"
            />
          </div>
          <div>
            <label htmlFor="sch-time" className="block text-xs font-medium text-slate-300 mb-1.5">
              {t.startTimeLabel}
            </label>
            <input
              id="sch-time"
              type="time"
              dir="ltr"
              required
              value={isoTime}
              onChange={(e) => setIsoTime(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg bg-[#08090C] border border-white/12 text-sm text-white font-mono-num focus:outline-none focus:border-white/50"
            />
          </div>
          <div>
            <label htmlFor="sch-seats" className="block text-xs font-medium text-slate-300 mb-1.5">
              {t.totalCapacityLabel}
            </label>
            <input
              id="sch-seats"
              type="number"
              dir="ltr"
              min={10}
              max={50000}
              required
              value={totalSeats}
              onChange={(e) => setTotalSeats(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg bg-[#08090C] border border-white/12 text-sm text-white font-mono-num focus:outline-none focus:border-white/50"
            />
          </div>
        </div>

        {/* Manual Tier Pricing */}
        <div className="p-4 rounded-lg bg-[#08090C] border border-white/10 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              {t.customTierPricing}
            </span>
            <button
              type="button"
              onClick={handleAutoSuggest}
              className="inline-flex items-center gap-1 text-xs font-semibold text-amber-300 hover:text-amber-200"
            >
              <Wand2 className="w-3.5 h-3.5" />
              {t.autoSuggestFromSilver}
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {(
              [
                ['Silver', silver, setSilver],
                ['Gold', gold, setGold],
                ['VIP', vip, setVip],
                ['Lounge', lounge, setLounge],
              ] as const
            ).map(([tierId, val, setter]) => (
              <div key={tierId}>
                <label htmlFor={`sch-tier-${tierId}`} className="block text-[11px] text-slate-400 mb-1">
                  {getTierCopy(tierId, lang).name}
                </label>
                <input
                  id={`sch-tier-${tierId}`}
                  type="number"
                  dir="ltr"
                  min={0}
                  max={100000}
                  required
                  value={val}
                  onChange={(e) => setter(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[#101218] border border-white/12 text-sm text-white font-modern-price focus:outline-none focus:border-white/50"
                />
              </div>
            ))}
          </div>
        </div>

        {/* High-Precision Custom Category Colors Toggle */}
        <TierColorEditor
          enabled={useCustomColors}
          onToggle={setUseCustomColors}
          colors={tierColors}
          hexDrafts={hexDrafts}
          onChangeColor={handleChangeTierColor}
          onChangeDraft={handleChangeHexDraft}
          onResetDefaults={handleResetColors}
          tierPrices={{ Silver: silver, Gold: gold, VIP: vip, Lounge: lounge }}
          idPrefix="sch-color"
        />

        {/* Poster Upload or URL */}
        <div className="space-y-2">
          <label htmlFor="sch-poster" className="block text-xs font-medium text-slate-300">
            {t.concertPosterLabel}
          </label>
          {posterUrl.startsWith('data:image/') ? (
            <div className="flex items-center gap-3 p-2.5 rounded-lg bg-[#08090C] border border-white/12">
              <img
                src={posterUrl}
                alt={isAr ? 'معاينة بوستر الحفل' : 'Uploaded concert poster preview'}
                className="w-16 h-10 object-cover rounded border border-white/10"
              />
              <span className="text-xs text-emerald-400 flex-1">{t.compressedPosterReady}</span>
              <button
                type="button"
                onClick={() => setPosterUrl('')}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-white/12 text-xs text-slate-300 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
                {t.removeBtn}
              </button>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row gap-2.5">
              <input
                id="sch-poster"
                type="text"
                inputMode="url"
                dir="ltr"
                value={posterUrl}
                onChange={(e) => setPosterUrl(e.target.value)}
                className="flex-1 px-3.5 py-2.5 rounded-lg bg-[#08090C] border border-white/12 text-xs text-white focus:outline-none focus:border-white/50"
              />
              <label className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg border border-white/15 bg-white/[0.05] hover:bg-white/[0.1] text-xs font-semibold text-white cursor-pointer whitespace-nowrap">
                <ImageUp className="w-3.5 h-3.5 text-neutral-300" />
                {t.uploadImage}
                <input type="file" accept="image/*" onChange={(e) => void handleUploadPoster(e)} className="sr-only" />
              </label>
            </div>
          )}
        </div>

        <div>
          <label htmlFor="sch-desc" className="block text-xs font-medium text-slate-300 mb-1.5">
            {t.eventDescriptionLabel}
          </label>
          <textarea
            id="sch-desc"
            rows={3}
            required
            maxLength={800}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-lg bg-[#08090C] border border-white/12 text-sm text-white focus:outline-none focus:border-white/50"
          />
        </div>

        <button
          type="submit"
          disabled={busy}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-white hover:bg-neutral-200 disabled:opacity-60 text-sm font-semibold text-[#08090C] transition-colors"
        >
          <CalendarPlus className="w-4 h-4" />
          {busy ? t.publishingConcert : t.publishConcertBtn}
        </button>
      </form>
    </div>
  );
};

