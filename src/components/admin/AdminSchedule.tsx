import React, { useState } from 'react';
import { CalendarPlus, ImageUp, Wand2, X } from 'lucide-react';
import { adminSaveConcert } from '../../services/firestoreService';
import { formatFriendlyFirebaseError } from '../../firebase';
import {
  formatDateTimeDisplay,
  getDefaultUpcomingIsoDate,
  MAX_POSTER_DATA_URL_LENGTH,
  parseBoundedIntInput,
  sanitizeId,
  suggestTierPrices,
} from '../../utils/bookingLogic';
import { compressPosterImage } from '../../utils/passExport';

interface AdminScheduleProps {
  onNotify: (msg: string) => void;
  onCreated: () => void;
}

export const AdminSchedule: React.FC<AdminScheduleProps> = ({ onNotify, onCreated }) => {
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
    onNotify('Applied suggested tier pricing from Silver base.');
  };

  const handleUploadPoster = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressPosterImage(file);
      setPosterUrl(compressed);
      onNotify('Poster image compressed and ready.');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Failed to compress poster.');
    }
    e.target.value = '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      title.trim().length < 2 ||
      artist.trim().length < 2 ||
      venue.trim().length < 2 ||
      genre.trim().length < 2 ||
      description.trim().length < 4
    ) {
      onNotify('Please complete title, artist, venue, genre, and description.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate) || !/^\d{2}:\d{2}$/.test(isoTime)) {
      onNotify('Please pick a valid event date and start time.');
      return;
    }
    const trimmedPoster = posterUrl.trim();
    if (trimmedPoster.length > MAX_POSTER_DATA_URL_LENGTH) {
      onNotify('Poster image or URL is too large. Please upload a smaller image or shorter HTTPS link.');
      return;
    }
    const safePoster =
      trimmedPoster.startsWith('data:image/') || trimmedPoster.startsWith('https://')
        ? trimmedPoster
        : '';

    const seatsParsed = parseBoundedIntInput(totalSeats, 10, 50000);
    if (!seatsParsed.valid) {
      onNotify('Total capacity must be a whole number between 10 and 50,000.');
      return;
    }
    const silverParsed = parseBoundedIntInput(silver, 0, 100000);
    const goldParsed = parseBoundedIntInput(gold, 0, 100000);
    const vipParsed = parseBoundedIntInput(vip, 0, 100000);
    const loungeParsed = parseBoundedIntInput(lounge, 0, 100000);
    if (!silverParsed.valid || !goldParsed.valid || !vipParsed.valid || !loungeParsed.valid) {
      onNotify('All tier prices must be valid whole numbers between 0 and 100,000 EGP.');
      return;
    }

    const formatted = formatDateTimeDisplay(isoDate, isoTime);
    const id = `${sanitizeId(title, 'qena')}-${Date.now().toString(36).slice(-4)}`;

    setBusy(true);
    try {
      await adminSaveConcert(
        {
          id,
          title: title.trim().slice(0, 120),
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
          totalSeats: seatsParsed.value,
          seatsLeft: seatsParsed.value,
          description: description.trim().slice(0, 800),
          posterUrl: safePoster,
        },
        false,
      );
      setTitle('');
      setArtist('');
      setDescription('');
      setPosterUrl('');
      onNotify(`Published "${title.trim()}" to the live Qena lineup.`);
      onCreated();
    } catch (err) {
      onNotify(formatFriendlyFirebaseError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-3xl bg-[#101218] border border-white/10 rounded-xl p-6 space-y-6">
      <div>
        <h2 className="font-display font-bold text-xl text-white">Schedule New Qena Concert</h2>
        <p className="text-xs text-slate-400">Publishes immediately to the live storefront across all devices.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="sch-title" className="block text-xs font-medium text-slate-300 mb-1.5">
              Concert Title
            </label>
            <input
              id="sch-title"
              type="text"
              required
              maxLength={120}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Nile Sunset Sessions"
              className="w-full px-3.5 py-2.5 rounded-lg bg-[#08090C] border border-white/12 text-sm text-white focus:outline-none focus:border-white/50"
            />
          </div>
          <div>
            <label htmlFor="sch-artist" className="block text-xs font-medium text-slate-300 mb-1.5">
              Headliner / Artist
            </label>
            <input
              id="sch-artist"
              type="text"
              required
              maxLength={120}
              value={artist}
              onChange={(e) => setArtist(e.target.value)}
              placeholder="e.g. Upper Egypt Collective"
              className="w-full px-3.5 py-2.5 rounded-lg bg-[#08090C] border border-white/12 text-sm text-white focus:outline-none focus:border-white/50"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="sm:col-span-2">
            <label htmlFor="sch-venue" className="block text-xs font-medium text-slate-300 mb-1.5">
              Venue in Qena
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
              Vibe / Genre
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
              Event Date
            </label>
            <input
              id="sch-date"
              type="date"
              required
              value={isoDate}
              onChange={(e) => setIsoDate(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg bg-[#08090C] border border-white/12 text-sm text-white font-mono-num focus:outline-none focus:border-white/50"
            />
          </div>
          <div>
            <label htmlFor="sch-time" className="block text-xs font-medium text-slate-300 mb-1.5">
              Start Time
            </label>
            <input
              id="sch-time"
              type="time"
              required
              value={isoTime}
              onChange={(e) => setIsoTime(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg bg-[#08090C] border border-white/12 text-sm text-white font-mono-num focus:outline-none focus:border-white/50"
            />
          </div>
          <div>
            <label htmlFor="sch-seats" className="block text-xs font-medium text-slate-300 mb-1.5">
              Total Capacity
            </label>
            <input
              id="sch-seats"
              type="number"
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
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Custom Tier Pricing (EGP)
            </span>
            <button
              type="button"
              onClick={handleAutoSuggest}
              className="inline-flex items-center gap-1 text-xs font-semibold text-amber-300 hover:text-amber-200"
            >
              <Wand2 className="w-3.5 h-3.5" />
              Auto-Suggest from Silver
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
            ).map(([label, val, setter]) => (
              <div key={label}>
                <label className="block text-[11px] text-slate-400 mb-1">{label}</label>
                <input
                  type="number"
                  min={0}
                  max={100000}
                  required
                  value={val}
                  onChange={(e) => setter(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[#101218] border border-white/12 text-sm text-white font-mono-num"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Poster Upload or URL */}
        <div className="space-y-2">
          <label htmlFor="sch-poster" className="block text-xs font-medium text-slate-300">
            Concert Poster (Optional — HTTPS URL or Upload Compressed Image)
          </label>
          {posterUrl.startsWith('data:image/') ? (
            <div className="flex items-center gap-3 p-2.5 rounded-lg bg-[#08090C] border border-white/12">
              <img
                src={posterUrl}
                alt="Uploaded concert poster preview"
                className="w-16 h-10 object-cover rounded border border-white/10"
              />
              <span className="text-xs text-emerald-400 flex-1">Compressed poster ready</span>
              <button
                type="button"
                onClick={() => setPosterUrl('')}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-white/12 text-xs text-slate-300 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
                Remove
              </button>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row gap-2.5">
              <input
                id="sch-poster"
                type="url"
                value={posterUrl}
                onChange={(e) => setPosterUrl(e.target.value)}
                placeholder="https://... or upload image"
                className="flex-1 px-3.5 py-2.5 rounded-lg bg-[#08090C] border border-white/12 text-xs text-white focus:outline-none focus:border-white/50"
              />
              <label className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg border border-white/15 bg-white/[0.05] hover:bg-white/[0.1] text-xs font-semibold text-white cursor-pointer whitespace-nowrap">
                <ImageUp className="w-3.5 h-3.5 text-neutral-300" />
                Upload Image
                <input type="file" accept="image/*" onChange={(e) => void handleUploadPoster(e)} className="sr-only" />
              </label>
            </div>
          )}
        </div>

        <div>
          <label htmlFor="sch-desc" className="block text-xs font-medium text-slate-300 mb-1.5">
            Event Description
          </label>
          <textarea
            id="sch-desc"
            rows={3}
            required
            maxLength={800}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe the live lineup, stage production, and doors schedule..."
            className="w-full px-3.5 py-2.5 rounded-lg bg-[#08090C] border border-white/12 text-sm text-white focus:outline-none focus:border-white/50"
          />
        </div>

        <button
          type="submit"
          disabled={busy}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-white hover:bg-neutral-200 disabled:opacity-60 text-sm font-semibold text-[#08090C] transition-colors"
        >
          <CalendarPlus className="w-4 h-4" />
          {busy ? 'Publishing Concert...' : 'Publish Concert to Lineup'}
        </button>
      </form>
    </div>
  );
};
