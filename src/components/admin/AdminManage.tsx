import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  Copy,
  Download,
  Edit3,
  ImageUp,
  Save,
  Trash2,
  Wand2,
  X,
} from 'lucide-react';
import { DEFAULT_TIER_COLORS, TICKET_TIERS } from '../../data/defaults';
import {
  adminDeleteConcert,
  adminSaveConcert,
  deleteWaitlistEntry,
} from '../../services/firestoreService';
import { formatFriendlyFirebaseError } from '../../firebase';
import { useLanguage } from '../../i18n/LanguageContext';
import { getGenreLabel, getTierCopy, localizeKnownMessage } from '../../i18n/translations';
import type { Booking, Concert, TierColors, TierId, WaitlistEntry } from '../../types';
import {
  buildAttendeesCsv,
  computeAdjustedSeatsLeft,
  formatDateTimeDisplay,
  getDefaultUpcomingIsoDate,
  getTierColorHex,
  getTierUnitPrice,
  isSafeImageUrl,
  parseBoundedIntInput,
  suggestTierPrices,
  validateAndBuildConcertEditPayload,
} from '../../utils/bookingLogic';
import {
  compressPosterImage,
  copyTextToClipboard,
  triggerFileDownload,
} from '../../utils/passExport';
import { TierColorEditor } from './TierColorEditor';

interface AdminManageProps {
  concerts: Concert[];
  bookings: Booking[];
  waitlist: WaitlistEntry[];
  onNotify: (msg: string) => void;
}

export const AdminManage: React.FC<AdminManageProps> = ({
  concerts,
  bookings,
  waitlist,
  onNotify,
}) => {
  const { lang, t } = useLanguage();
  const isAr = lang === 'ar';

  const [editingConcert, setEditingConcert] = useState<Concert | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editArtist, setEditArtist] = useState('');
  const [editVenue, setEditVenue] = useState('');
  const [editGenre, setEditGenre] = useState('');
  const [editIsoDate, setEditIsoDate] = useState('');
  const [editIsoTime, setEditIsoTime] = useState('20:00');
  const [editTotalSeats, setEditTotalSeats] = useState('140');
  const [editSeatsLeft, setEditSeatsLeft] = useState('0');
  const [seatsLeftManuallyEdited, setSeatsLeftManuallyEdited] = useState(false);
  const [editSilver, setEditSilver] = useState('200');
  const [editGold, setEditGold] = useState('300');
  const [editVip, setEditVip] = useState('450');
  const [editLounge, setEditLounge] = useState('700');
  const [editUseCustomColors, setEditUseCustomColors] = useState(false);
  const [editTierColors, setEditTierColors] = useState<TierColors>({ ...DEFAULT_TIER_COLORS });
  const [editHexDrafts, setEditHexDrafts] = useState<TierColors>({ ...DEFAULT_TIER_COLORS });
  const [editPosterUrl, setEditPosterUrl] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editError, setEditError] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!editingConcert) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && busyId !== editingConcert.id) {
        setEditingConcert(null);
        setEditError('');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editingConcert, busyId]);

  const startEdit = (c: Concert) => {
    setEditingConcert(c);
    setEditTitle(c.title);
    setEditArtist(c.artist);
    setEditVenue(c.venue);
    setEditGenre(c.genre);
    setEditIsoDate(c.isoDate || getDefaultUpcomingIsoDate());
    const rawTime = (c.isoTime || '20:00').trim();
    setEditIsoTime(/^\d{2}:\d{2}:\d{2}$/.test(rawTime) ? rawTime.slice(0, 5) : rawTime);
    setEditTotalSeats(String(c.totalSeats));
    setEditSeatsLeft(String(c.seatsLeft));
    setSeatsLeftManuallyEdited(false);
    setEditSilver(String(getTierUnitPrice(c, 'Silver')));
    setEditGold(String(getTierUnitPrice(c, 'Gold')));
    setEditVip(String(getTierUnitPrice(c, 'VIP')));
    setEditLounge(String(getTierUnitPrice(c, 'Lounge')));
    const hasCustom = Boolean(c.tierColors);
    setEditUseCustomColors(hasCustom);
    const resolved: TierColors = {
      Silver: getTierColorHex(c, 'Silver'),
      Gold: getTierColorHex(c, 'Gold'),
      VIP: getTierColorHex(c, 'VIP'),
      Lounge: getTierColorHex(c, 'Lounge'),
    };
    setEditTierColors(resolved);
    setEditHexDrafts(resolved);
    setEditPosterUrl(c.posterUrl || '');
    setEditDescription(c.description || '');
    setEditError('');
  };

  const closeEditModal = () => {
    if (editingConcert && busyId === editingConcert.id) return;
    setEditingConcert(null);
    setEditError('');
  };

  const handleCapacityChange = (rawValue: string) => {
    setEditTotalSeats(rawValue);
    if (!editingConcert || seatsLeftManuallyEdited) return;
    const parsed = parseBoundedIntInput(rawValue, 1, 50000);
    if (parsed.valid) {
      const adjusted = computeAdjustedSeatsLeft(
        editingConcert.totalSeats,
        editingConcert.seatsLeft,
        parsed.value,
      );
      setEditSeatsLeft(String(adjusted));
    }
  };

  const handleAutoSuggestPrices = () => {
    const parsedSilver = parseBoundedIntInput(editSilver, 50, 100000);
    const suggested = suggestTierPrices(parsedSilver.valid ? parsedSilver.value : 200);
    setEditSilver(String(suggested.Silver));
    setEditGold(String(suggested.Gold));
    setEditVip(String(suggested.VIP));
    setEditLounge(String(suggested.Lounge));
    onNotify(
      isAr
        ? 'تم تطبيق الأسعار المقترحة لجميع الفئات بناءً على سعر سيلفر.'
        : 'Applied suggested tier pricing from Silver base.',
    );
  };

  const handleEditTierColor = (tier: TierId, hex: string) => {
    const upper = hex.toUpperCase();
    setEditTierColors((prev) => ({ ...prev, [tier]: upper }));
    setEditHexDrafts((prev) => ({ ...prev, [tier]: upper }));
  };

  const handleUploadEditPoster = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressPosterImage(file);
      setEditPosterUrl(compressed);
      setEditError('');
      onNotify(isAr ? 'تم ضغط صورة البوستر وتجهيزها.' : 'Poster image compressed and ready.');
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : isAr
            ? 'تعذر ضغط صورة البوستر.'
            : 'Failed to compress poster.';
      setEditError(msg);
      onNotify(msg);
    }
    e.target.value = '';
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingConcert) return;
    setEditError('');

    const validation = validateAndBuildConcertEditPayload(editingConcert, {
      title: editTitle,
      artist: editArtist,
      venue: editVenue,
      genre: editGenre,
      isoDate: editIsoDate,
      isoTime: editIsoTime,
      totalSeats: editTotalSeats,
      seatsLeft: editSeatsLeft,
      silver: editSilver,
      gold: editGold,
      vip: editVip,
      lounge: editLounge,
      useCustomColors: editUseCustomColors,
      hexDrafts: editHexDrafts,
      posterUrl: editPosterUrl,
      description: editDescription,
    });

    if (!validation.valid) {
      const msg = isAr ? validation.errorAr : validation.errorEn;
      setEditError(msg);
      onNotify(msg);
      return;
    }

    setBusyId(editingConcert.id);
    try {
      await adminSaveConcert(validation.concert, true);
      setEditingConcert(null);
      setEditError('');
      onNotify(
        isAr
          ? `تم تحديث جميع تفاصيل حفل «${validation.concert.title}» بنجاح.`
          : `Updated all details for "${validation.concert.title}".`,
      );
    } catch (err) {
      const msg = localizeKnownMessage(formatFriendlyFirebaseError(err), lang);
      setEditError(msg);
      onNotify(msg);
    } finally {
      setBusyId(null);
    }
  };

  const handleDeleteConcert = async (c: Concert) => {
    setBusyId(c.id);
    try {
      await adminDeleteConcert(c.id);
      setConfirmDeleteId(null);
      if (editingConcert?.id === c.id) {
        setEditingConcert(null);
      }
      onNotify(
        isAr
          ? `تمت إزالة حفل ${c.title} من الجدول المباشر.`
          : `Removed ${c.title} from live lineup.`,
      );
    } catch (err) {
      onNotify(localizeKnownMessage(formatFriendlyFirebaseError(err), lang));
    } finally {
      setBusyId(null);
    }
  };

  const handleExportCsv = () => {
    const csv = buildAttendeesCsv(bookings);
    triggerFileDownload(
      `genz-events-attendees-${new Date().toISOString().slice(0, 10)}.csv`,
      csv,
      'text/csv;charset=utf-8',
    );
    onNotify(
      isAr
        ? `تم تصدير ${bookings.length} سجل حضور إلى ملف CSV.`
        : `Exported ${bookings.length} attendee rows to CSV.`,
    );
  };

  const handleRemoveWaitlist = async (id: string) => {
    try {
      await deleteWaitlistEntry(id);
      onNotify(isAr ? 'تمت إزالة السجل من قائمة الانتظار.' : 'Waitlist entry removed.');
    } catch (err) {
      onNotify(localizeKnownMessage(formatFriendlyFirebaseError(err), lang));
    }
  };

  const liveSchedulePreview =
    /^\d{4}-\d{2}-\d{2}$/.test(editIsoDate) && /^\d{2}:\d{2}$/.test(editIsoTime)
      ? formatDateTimeDisplay(editIsoDate, editIsoTime)
      : null;

  const originalBookedCount = editingConcert
    ? Math.max(0, editingConcert.totalSeats - editingConcert.seatsLeft)
    : 0;

  return (
    <div className="space-y-6">
      {/* Header & CSV Export */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display font-bold text-xl text-white">{t.manageTitle}</h2>
          <p className="text-xs text-slate-400">{t.manageSubtitle}</p>
        </div>
        <button
          type="button"
          onClick={handleExportCsv}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          {t.exportAttendeesCsv} ({bookings.length})
        </button>
      </div>

      {/* Concerts Inventory Table */}
      <div className="bg-[#101218] border border-white/10 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-start text-xs">
            <thead className="bg-[#0B0D12] text-slate-400 uppercase tracking-wider text-[10px]">
              <tr>
                <th className="px-4 py-3 text-start">{t.colShowVenue}</th>
                <th className="px-4 py-3 text-start">{t.colSeatsLeft}</th>
                <th className="px-4 py-3 text-start">{t.colTierPrices}</th>
                <th className="px-4 py-3 text-end">{t.colActions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/8">
              {concerts.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-slate-500">
                    {t.noLiveConcertsYet}
                  </td>
                </tr>
              ) : (
                concerts.map((c) => (
                  <tr key={c.id} className="hover:bg-white/[0.02]">
                    <td className="px-4 py-3.5">
                      <p className="font-semibold text-white">{c.title}</p>
                      <p className="text-[11px] text-slate-300">
                        {c.artist} · {getGenreLabel(c.genre, lang)}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        <span dir="ltr" className="inline-block">
                          {c.date} · {c.time}
                        </span>{' '}
                        · {c.venue}
                      </p>
                    </td>
                    <td className="px-4 py-3.5 font-mono-num">
                      <span
                        dir="ltr"
                        className={`inline-block ${
                          c.seatsLeft === 0 ? 'text-rose-400 font-bold' : 'text-white'
                        }`}
                      >
                        {c.seatsLeft.toLocaleString('en-US')} / {c.totalSeats.toLocaleString('en-US')}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 font-modern-price">
                      <div className="space-y-1">
                        <span
                          dir="ltr"
                          className="inline-block font-modern-price font-semibold text-slate-200"
                        >
                          {getTierUnitPrice(c, 'Silver').toLocaleString('en-US')} /{' '}
                          {getTierUnitPrice(c, 'Gold').toLocaleString('en-US')} /{' '}
                          {getTierUnitPrice(c, 'VIP').toLocaleString('en-US')} /{' '}
                          {getTierUnitPrice(c, 'Lounge').toLocaleString('en-US')}{' '}
                          {isAr ? 'ج.م' : 'EGP'}
                        </span>
                        <div className="flex items-center gap-1.5">
                          {TICKET_TIERS.map((tier) => (
                            <span
                              key={tier.id}
                              title={`${getTierCopy(tier.id, lang).name}: ${getTierColorHex(c, tier.id)}`}
                              className="w-2.5 h-2.5 rounded-full border border-white/20"
                              style={{ backgroundColor: getTierColorHex(c, tier.id) }}
                            />
                          ))}
                          {c.tierColors && (
                            <span className="text-[10px] text-slate-400 font-sans ms-1">
                              {t.customPaletteTag}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-end whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => startEdit(c)}
                          aria-label={isAr ? `تعديل ${c.title}` : `Edit ${c.title}`}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-white/12 text-slate-200 hover:bg-white/[0.06] transition-colors"
                        >
                          <Edit3 className="w-3 h-3" />
                          {t.editBtn}
                        </button>

                        {confirmDeleteId === c.id ? (
                          <span className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              disabled={busyId === c.id}
                              onClick={() => void handleDeleteConcert(c)}
                              className="px-2.5 py-1.5 rounded-md bg-rose-600 text-white font-semibold"
                            >
                              {t.confirmDeleteBtn}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              aria-label={t.cancelDeleteAria}
                              className="p-1.5 rounded-md text-slate-400 hover:text-white"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(c.id)}
                            aria-label={isAr ? `حذف ${c.title}` : `Delete ${c.title}`}
                            className="p-1.5 rounded-md text-slate-400 hover:text-rose-400 hover:bg-rose-500/10"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Sold-Out Waitlist */}
      <div className="bg-[#101218] border border-white/10 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-white/10 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">{t.waitlistTitle}</h3>
          <span className="font-mono-num text-xs text-slate-400">
            {waitlist.length} {t.waitingWord}
          </span>
        </div>
        {waitlist.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">{t.noWaitlistYet}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-start text-xs">
              <thead className="bg-[#0B0D12] text-slate-400 uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="px-4 py-3 text-start">{t.colFan}</th>
                  <th className="px-4 py-3 text-start">{t.colConcert}</th>
                  <th className="px-4 py-3 text-start">{t.colMobile}</th>
                  <th className="px-4 py-3 text-end">{t.colActions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/8">
                {waitlist.map((w) => (
                  <tr key={w.id} className="hover:bg-white/[0.02]">
                    <td className="px-4 py-3">
                      <p className="font-medium text-white">{w.name}</p>
                      <p dir="ltr" className="text-[11px] text-slate-400 inline-block">
                        {w.email}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-slate-300">{w.concertTitle}</td>
                    <td className="px-4 py-3 font-mono-num text-white">
                      <span dir="ltr" className="inline-block">
                        {w.mobile}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-end whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            void copyTextToClipboard(w.mobile).then(() => {
                              onNotify(
                                isAr
                                  ? `تم نسخ رقم الموبايل ${w.mobile}`
                                  : `Copied mobile ${w.mobile}`,
                              );
                            });
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-white/12 text-slate-200 hover:bg-white/[0.06]"
                        >
                          <Copy className="w-3 h-3" />
                          {t.copyBtn}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleRemoveWaitlist(w.id)}
                          aria-label={
                            isAr
                              ? `إزالة ${w.name} من قائمة الانتظار`
                              : `Remove ${w.name} from waitlist`
                          }
                          className="p-1.5 rounded text-slate-400 hover:text-rose-400"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Full Published Concert Editor Modal */}
      {editingConcert && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5"
          role="dialog"
          aria-modal="true"
          aria-label={`${t.editConcertTitle} — ${editingConcert.title}`}
          onClick={(e) => {
            if (e.target === e.currentTarget) closeEditModal();
          }}
        >
          <div className="relative w-full max-w-3xl max-h-[90vh] bg-[#101218] border border-white/15 rounded-xl shadow-2xl overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="px-5 sm:px-6 py-4 border-b border-white/10 flex items-start justify-between gap-4 shrink-0">
              <div className="space-y-0.5 min-w-0">
                <h3 className="font-display font-bold text-lg text-white">
                  {t.editConcertTitle}
                </h3>
                <p className="text-xs text-slate-400">{t.editConcertSubtitle}</p>
              </div>
              <button
                type="button"
                onClick={closeEditModal}
                aria-label={t.cancelBtn}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06] shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={(e) => void handleSaveEdit(e)}
              noValidate
              className="flex flex-col flex-1 min-h-0"
            >
              {/* Scrollable Form Fields */}
              <div className="p-5 sm:p-6 overflow-y-auto space-y-5 flex-1">
                {editError && (
                  <div className="p-3 rounded-lg border border-rose-500/35 bg-rose-500/10 text-xs text-rose-200 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    <span>{editError}</span>
                  </div>
                )}

                {/* Title & Artist */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="edit-concert-title"
                      className="block text-xs font-medium text-slate-300 mb-1.5"
                    >
                      {t.concertTitleLabel}
                    </label>
                    <input
                      id="edit-concert-title"
                      type="text"
                      required
                      maxLength={120}
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-lg bg-[#08090C] border border-white/12 text-sm text-white focus:outline-none focus:border-white/50"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="edit-concert-artist"
                      className="block text-xs font-medium text-slate-300 mb-1.5"
                    >
                      {t.headlinerArtistLabel}
                    </label>
                    <input
                      id="edit-concert-artist"
                      type="text"
                      required
                      maxLength={120}
                      value={editArtist}
                      onChange={(e) => setEditArtist(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-lg bg-[#08090C] border border-white/12 text-sm text-white focus:outline-none focus:border-white/50"
                    />
                  </div>
                </div>

                {/* Venue in Qena & Genre */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="sm:col-span-2">
                    <label
                      htmlFor="edit-concert-venue"
                      className="block text-xs font-medium text-slate-300 mb-1.5"
                    >
                      {t.venueQenaLabel}
                    </label>
                    <input
                      id="edit-concert-venue"
                      type="text"
                      required
                      maxLength={140}
                      value={editVenue}
                      onChange={(e) => setEditVenue(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-lg bg-[#08090C] border border-white/12 text-sm text-white focus:outline-none focus:border-white/50"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="edit-concert-genre"
                      className="block text-xs font-medium text-slate-300 mb-1.5"
                    >
                      {t.vibeGenreLabel}
                    </label>
                    <input
                      id="edit-concert-genre"
                      type="text"
                      required
                      maxLength={60}
                      value={editGenre}
                      onChange={(e) => setEditGenre(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-lg bg-[#08090C] border border-white/12 text-sm text-white focus:outline-none focus:border-white/50"
                    />
                  </div>
                </div>

                {/* Date, Start Time, Total Capacity & Seats Left */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div>
                    <label
                      htmlFor="edit-concert-date"
                      className="block text-xs font-medium text-slate-300 mb-1.5"
                    >
                      {t.eventDateLabel}
                    </label>
                    <input
                      id="edit-concert-date"
                      type="date"
                      dir="ltr"
                      required
                      value={editIsoDate}
                      onChange={(e) => setEditIsoDate(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-lg bg-[#08090C] border border-white/12 text-sm text-white font-mono-num focus:outline-none focus:border-white/50"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="edit-concert-time"
                      className="block text-xs font-medium text-slate-300 mb-1.5"
                    >
                      {t.startTimeLabel}
                    </label>
                    <input
                      id="edit-concert-time"
                      type="time"
                      dir="ltr"
                      required
                      value={editIsoTime}
                      onChange={(e) => setEditIsoTime(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-lg bg-[#08090C] border border-white/12 text-sm text-white font-mono-num focus:outline-none focus:border-white/50"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="edit-concert-capacity"
                      className="block text-xs font-medium text-slate-300 mb-1.5"
                    >
                      {t.totalCapacityLabel}
                    </label>
                    <input
                      id="edit-concert-capacity"
                      type="number"
                      dir="ltr"
                      min={1}
                      max={50000}
                      required
                      value={editTotalSeats}
                      onChange={(e) => handleCapacityChange(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-lg bg-[#08090C] border border-white/12 text-sm text-white font-mono-num focus:outline-none focus:border-white/50"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="edit-concert-seats-left"
                      className="block text-xs font-medium text-slate-300 mb-1.5"
                    >
                      {t.seatsLeftLabel}
                    </label>
                    <input
                      id="edit-concert-seats-left"
                      type="number"
                      dir="ltr"
                      min={0}
                      max={50000}
                      required
                      value={editSeatsLeft}
                      onChange={(e) => {
                        setEditSeatsLeft(e.target.value);
                        setSeatsLeftManuallyEdited(true);
                      }}
                      className="w-full px-3 py-2.5 rounded-lg bg-[#08090C] border border-white/12 text-sm text-white font-mono-num focus:outline-none focus:border-white/50"
                    />
                  </div>
                </div>

                {/* Live Schedule & Capacity Summary Strip */}
                <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 rounded-lg bg-[#08090C] border border-white/8 text-[11px] text-slate-400">
                  {liveSchedulePreview ? (
                    <span>
                      {t.showLabel}:{' '}
                      <strong className="text-slate-200 font-mono-num" dir="ltr">
                        {liveSchedulePreview.date} · {liveSchedulePreview.time}
                      </strong>{' '}
                      ({t.doorsLabel}{' '}
                      <span className="text-slate-200 font-mono-num" dir="ltr">
                        {liveSchedulePreview.doors}
                      </span>
                      )
                    </span>
                  ) : (
                    <span>
                      {isAr
                        ? 'اختر تاريخاً ووقتاً لمعاينة الموعد'
                        : 'Select date and time to preview schedule'}
                    </span>
                  )}
                  <span>
                    {t.bookedSeatsLabel}:{' '}
                    <strong className="text-white font-mono-num" dir="ltr">
                      {originalBookedCount.toLocaleString('en-US')}
                    </strong>
                  </span>
                </div>

                {/* Tier Pricing */}
                <div className="p-4 rounded-lg bg-[#08090C] border border-white/10 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                      {t.customTierPricing}
                    </span>
                    <button
                      type="button"
                      onClick={handleAutoSuggestPrices}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-amber-300 hover:text-amber-200"
                    >
                      <Wand2 className="w-3.5 h-3.5" />
                      {t.autoSuggestFromSilver}
                    </button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {(
                      [
                        ['Silver', editSilver, setEditSilver],
                        ['Gold', editGold, setEditGold],
                        ['VIP', editVip, setEditVip],
                        ['Lounge', editLounge, setEditLounge],
                      ] as const
                    ).map(([tierId, val, setter]) => (
                      <div key={tierId}>
                        <label
                          htmlFor={`edit-tier-${tierId}`}
                          className="block text-[11px] text-slate-400 mb-1"
                        >
                          {getTierCopy(tierId, lang).name}
                        </label>
                        <input
                          id={`edit-tier-${tierId}`}
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

                {/* Custom Ticket Category Colors */}
                <TierColorEditor
                  enabled={editUseCustomColors}
                  onToggle={setEditUseCustomColors}
                  colors={editTierColors}
                  hexDrafts={editHexDrafts}
                  onChangeColor={handleEditTierColor}
                  onChangeDraft={(tier, raw) =>
                    setEditHexDrafts((prev) => ({ ...prev, [tier]: raw }))
                  }
                  onResetDefaults={() => {
                    setEditTierColors({ ...DEFAULT_TIER_COLORS });
                    setEditHexDrafts({ ...DEFAULT_TIER_COLORS });
                  }}
                  tierPrices={{
                    Silver: editSilver,
                    Gold: editGold,
                    VIP: editVip,
                    Lounge: editLounge,
                  }}
                  compact
                  idPrefix={`edit-color-${editingConcert.id}`}
                />

                {/* Poster URL or Upload */}
                <div className="space-y-2">
                  <label
                    htmlFor="edit-concert-poster"
                    className="block text-xs font-medium text-slate-300"
                  >
                    {t.concertPosterLabel}
                  </label>
                  {editPosterUrl.startsWith('data:image/') ? (
                    <div className="flex items-center gap-3 p-2.5 rounded-lg bg-[#08090C] border border-white/12">
                      {isSafeImageUrl(editPosterUrl) && (
                        <img
                          src={editPosterUrl}
                          alt={isAr ? 'معاينة بوستر الحفل' : 'Uploaded concert poster preview'}
                          className="w-16 h-10 object-cover rounded border border-white/10"
                        />
                      )}
                      <span className="text-xs text-emerald-400 flex-1">
                        {t.compressedPosterReady}
                      </span>
                      <button
                        type="button"
                        onClick={() => setEditPosterUrl('')}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-white/12 text-xs text-slate-300 hover:text-white"
                      >
                        <X className="w-3.5 h-3.5" />
                        {t.removeBtn}
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col sm:flex-row gap-2.5">
                      <input
                        id="edit-concert-poster"
                        type="text"
                        inputMode="url"
                        dir="ltr"
                        value={editPosterUrl}
                        onChange={(e) => setEditPosterUrl(e.target.value)}
                        className="flex-1 px-3.5 py-2.5 rounded-lg bg-[#08090C] border border-white/12 text-xs text-white focus:outline-none focus:border-white/50"
                      />
                      <label className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg border border-white/15 bg-white/[0.05] hover:bg-white/[0.1] text-xs font-semibold text-white cursor-pointer whitespace-nowrap">
                        <ImageUp className="w-3.5 h-3.5 text-neutral-300" />
                        {t.uploadImage}
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => void handleUploadEditPoster(e)}
                          className="sr-only"
                        />
                      </label>
                    </div>
                  )}
                </div>

                {/* Event Description */}
                <div>
                  <label
                    htmlFor="edit-concert-desc"
                    className="block text-xs font-medium text-slate-300 mb-1.5"
                  >
                    {t.eventDescriptionLabel}
                  </label>
                  <textarea
                    id="edit-concert-desc"
                    rows={3}
                    required
                    maxLength={800}
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-lg bg-[#08090C] border border-white/12 text-sm text-white focus:outline-none focus:border-white/50"
                  />
                </div>
              </div>

              {/* Sticky Footer */}
              <div className="px-5 sm:px-6 py-4 border-t border-white/12 bg-[#0B0D12] shrink-0 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  disabled={busyId === editingConcert.id}
                  onClick={closeEditModal}
                  className="px-4 py-2.5 rounded-lg border border-white/12 text-xs font-semibold text-slate-300 hover:text-white hover:bg-white/[0.05] disabled:opacity-50 transition-colors"
                >
                  {t.cancelBtn}
                </button>
                <button
                  type="submit"
                  disabled={busyId === editingConcert.id}
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-white hover:bg-neutral-200 disabled:opacity-60 text-xs sm:text-sm font-semibold text-[#08090C] transition-colors"
                >
                  <Save className="w-3.5 h-3.5" />
                  {busyId === editingConcert.id ? t.savingChangesBtn : t.saveChangesBtn}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
