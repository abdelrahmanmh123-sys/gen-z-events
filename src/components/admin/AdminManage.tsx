import React, { useState } from 'react';
import { Copy, Download, Edit3, Save, Trash2, X } from 'lucide-react';
import { DEFAULT_TIER_COLORS, TICKET_TIERS } from '../../data/defaults';
import {
  adminDeleteConcert,
  adminSaveConcert,
  deleteWaitlistEntry,
} from '../../services/firestoreService';
import { formatFriendlyFirebaseError } from '../../firebase';
import { useLanguage } from '../../i18n/LanguageContext';
import { getTierCopy, localizeKnownMessage } from '../../i18n/translations';
import type { Booking, Concert, TierColors, TierId, WaitlistEntry } from '../../types';
import {
  buildAttendeesCsv,
  getTierColorHex,
  getTierUnitPrice,
  parseBoundedIntInput,
  validateTierColors,
} from '../../utils/bookingLogic';
import { copyTextToClipboard, triggerFileDownload } from '../../utils/passExport';
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

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editSeatsLeft, setEditSeatsLeft] = useState('0');
  const [editSilver, setEditSilver] = useState('200');
  const [editGold, setEditGold] = useState('300');
  const [editVip, setEditVip] = useState('450');
  const [editLounge, setEditLounge] = useState('700');
  const [editUseCustomColors, setEditUseCustomColors] = useState(false);
  const [editTierColors, setEditTierColors] = useState<TierColors>({ ...DEFAULT_TIER_COLORS });
  const [editHexDrafts, setEditHexDrafts] = useState<TierColors>({ ...DEFAULT_TIER_COLORS });
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const startEdit = (c: Concert) => {
    setEditingId(c.id);
    setEditSeatsLeft(String(c.seatsLeft));
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
  };

  const handleEditTierColor = (tier: TierId, hex: string) => {
    const upper = hex.toUpperCase();
    setEditTierColors((prev) => ({ ...prev, [tier]: upper }));
    setEditHexDrafts((prev) => ({ ...prev, [tier]: upper }));
  };

  const handleSaveEdit = async (c: Concert) => {
    const seatsParsed = parseBoundedIntInput(editSeatsLeft, 0, c.totalSeats);
    if (!seatsParsed.valid) {
      onNotify(
        isAr
          ? `يجب أن تكون المقاعد المتبقية عدداً صحيحاً بين 0 و ${c.totalSeats.toLocaleString('en-US')}.`
          : `Seats left must be a whole number between 0 and ${c.totalSeats.toLocaleString()}.`,
      );
      return;
    }
    const silverParsed = parseBoundedIntInput(editSilver, 0, 100000);
    const goldParsed = parseBoundedIntInput(editGold, 0, 100000);
    const vipParsed = parseBoundedIntInput(editVip, 0, 100000);
    const loungeParsed = parseBoundedIntInput(editLounge, 0, 100000);
    if (!silverParsed.valid || !goldParsed.valid || !vipParsed.valid || !loungeParsed.valid) {
      onNotify(
        isAr
          ? 'يجب أن تكون أسعار جميع الفئات أعداداً صحيحة بين 0 و 100,000 ج.م.'
          : 'All tier prices must be valid whole numbers between 0 and 100,000 EGP.',
      );
      return;
    }

    let resolvedTierColors: TierColors | undefined;
    if (editUseCustomColors) {
      const check = validateTierColors(editHexDrafts);
      if (!check.valid || !check.normalized) {
        onNotify(
          isAr
            ? 'يرجى تصحيح أكواد الألوان (Hex) غير الصالحة قبل الحفظ.'
            : check.error || 'Please fix invalid hex colors before saving.',
        );
        return;
      }
      resolvedTierColors = check.normalized;
    }

    setBusyId(c.id);
    try {
      await adminSaveConcert(
        {
          ...c,
          seatsLeft: seatsParsed.value,
          priceEgp: silverParsed.value,
          tierPrices: {
            Silver: silverParsed.value,
            Gold: goldParsed.value,
            VIP: vipParsed.value,
            Lounge: loungeParsed.value,
          },
          tierColors: resolvedTierColors,
        },
        true,
      );
      setEditingId(null);
      onNotify(
        isAr
          ? `تم تحديث الأسعار والألوان والمقاعد لحفل ${c.title}.`
          : `Updated pricing, colors, and seats for ${c.title}.`,
      );
    } catch (err) {
      onNotify(localizeKnownMessage(formatFriendlyFirebaseError(err), lang));
    } finally {
      setBusyId(null);
    }
  };

  const handleDeleteConcert = async (c: Concert) => {
    setBusyId(c.id);
    try {
      await adminDeleteConcert(c.id);
      setConfirmDeleteId(null);
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
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white"
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
                concerts.map((c) => {
                  const isEditing = editingId === c.id;
                  return (
                    <React.Fragment key={c.id}>
                      <tr className="hover:bg-white/[0.02]">
                        <td className="px-4 py-3.5">
                          <p className="font-semibold text-white">{c.title}</p>
                          <p className="text-[11px] text-slate-400">
                            <span dir="ltr" className="inline-block">{c.date}</span> · {c.venue}
                          </p>
                        </td>
                        <td className="px-4 py-3.5 font-mono-num">
                          {isEditing ? (
                            <input
                              type="number"
                              dir="ltr"
                              min={0}
                              max={c.totalSeats}
                              aria-label={t.colSeatsLeft}
                              value={editSeatsLeft}
                              onChange={(e) => setEditSeatsLeft(e.target.value)}
                              className="w-24 px-2 py-1 rounded bg-[#08090C] border border-white/20 text-white"
                            />
                          ) : (
                            <span
                              dir="ltr"
                              className={`inline-block ${c.seatsLeft === 0 ? 'text-rose-400 font-bold' : 'text-white'}`}
                            >
                              {c.seatsLeft.toLocaleString('en-US')} / {c.totalSeats.toLocaleString('en-US')}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 font-mono-num">
                          {isEditing ? (
                            <div className="flex flex-wrap gap-1.5">
                              {(
                                [
                                  ['Silver', editSilver, setEditSilver],
                                  ['Gold', editGold, setEditGold],
                                  ['VIP', editVip, setEditVip],
                                  ['Lounge', editLounge, setEditLounge],
                                ] as const
                              ).map(([tierId, v, setter]) => (
                                <input
                                  key={tierId}
                                  type="number"
                                  dir="ltr"
                                  min={0}
                                  max={100000}
                                  aria-label={getTierCopy(tierId, lang).name}
                                  value={v}
                                  onChange={(e) => setter(e.target.value)}
                                  className="w-16 px-2 py-1 rounded bg-[#08090C] border border-white/20 text-white text-xs"
                                />
                              ))}
                            </div>
                          ) : (
                            <div className="space-y-1">
                              <span dir="ltr" className="inline-block text-slate-300">
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
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-end whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            {isEditing ? (
                              <>
                                <button
                                  type="button"
                                  disabled={busyId === c.id}
                                  onClick={() => void handleSaveEdit(c)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-emerald-600 text-white font-semibold"
                                >
                                  <Save className="w-3 h-3" />
                                  {t.saveBtn}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingId(null)}
                                  aria-label={isAr ? 'إلغاء التعديل' : 'Cancel edit'}
                                  className="p-1.5 rounded-md text-slate-400 hover:text-white"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                onClick={() => startEdit(c)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-white/12 text-slate-200 hover:bg-white/[0.06]"
                              >
                                <Edit3 className="w-3 h-3" />
                                {t.editBtn}
                              </button>
                            )}

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
                      {isEditing && (
                        <tr className="bg-[#0B0D12]/60">
                          <td colSpan={4} className="px-4 py-4">
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
                              idPrefix={`edit-color-${c.id}`}
                            />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
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
                                isAr ? `تم نسخ رقم الموبايل ${w.mobile}` : `Copied mobile ${w.mobile}`,
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
                            isAr ? `إزالة ${w.name} من قائمة الانتظار` : `Remove ${w.name} from waitlist`
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
    </div>
  );
};

