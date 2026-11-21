import React, { useState } from 'react';
import { Copy, Download, Edit3, Save, Trash2, X } from 'lucide-react';
import {
  adminDeleteConcert,
  adminSaveConcert,
  deleteWaitlistEntry,
} from '../../services/firestoreService';
import { formatFriendlyFirebaseError } from '../../firebase';
import type { Booking, Concert, WaitlistEntry } from '../../types';
import { buildAttendeesCsv, getTierUnitPrice, parseBoundedIntInput } from '../../utils/bookingLogic';
import { copyTextToClipboard, triggerFileDownload } from '../../utils/passExport';

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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editSeatsLeft, setEditSeatsLeft] = useState('0');
  const [editSilver, setEditSilver] = useState('200');
  const [editGold, setEditGold] = useState('300');
  const [editVip, setEditVip] = useState('450');
  const [editLounge, setEditLounge] = useState('700');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const startEdit = (c: Concert) => {
    setEditingId(c.id);
    setEditSeatsLeft(String(c.seatsLeft));
    setEditSilver(String(getTierUnitPrice(c, 'Silver')));
    setEditGold(String(getTierUnitPrice(c, 'Gold')));
    setEditVip(String(getTierUnitPrice(c, 'VIP')));
    setEditLounge(String(getTierUnitPrice(c, 'Lounge')));
  };

  const handleSaveEdit = async (c: Concert) => {
    const seatsParsed = parseBoundedIntInput(editSeatsLeft, 0, c.totalSeats);
    if (!seatsParsed.valid) {
      onNotify(`Seats left must be a whole number between 0 and ${c.totalSeats}.`);
      return;
    }
    const silverParsed = parseBoundedIntInput(editSilver, 0, 100000);
    const goldParsed = parseBoundedIntInput(editGold, 0, 100000);
    const vipParsed = parseBoundedIntInput(editVip, 0, 100000);
    const loungeParsed = parseBoundedIntInput(editLounge, 0, 100000);
    if (!silverParsed.valid || !goldParsed.valid || !vipParsed.valid || !loungeParsed.valid) {
      onNotify('All tier prices must be valid whole numbers between 0 and 100,000 EGP.');
      return;
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
        },
        true,
      );
      setEditingId(null);
      onNotify(`Updated pricing and seats for ${c.title}.`);
    } catch (err) {
      onNotify(formatFriendlyFirebaseError(err));
    } finally {
      setBusyId(null);
    }
  };

  const handleDeleteConcert = async (c: Concert) => {
    setBusyId(c.id);
    try {
      await adminDeleteConcert(c.id);
      setConfirmDeleteId(null);
      onNotify(`Removed ${c.title} from live lineup.`);
    } catch (err) {
      onNotify(formatFriendlyFirebaseError(err));
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
    onNotify(`Exported ${bookings.length} attendee rows to CSV.`);
  };

  const handleRemoveWaitlist = async (id: string) => {
    try {
      await deleteWaitlistEntry(id);
      onNotify('Waitlist entry removed.');
    } catch (err) {
      onNotify(formatFriendlyFirebaseError(err));
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & CSV Export */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display font-bold text-xl text-white">Manage Concerts &amp; Waitlist</h2>
          <p className="text-xs text-slate-400">Adjust live tier pricing, seat inventory, and export attendee CSV sheets.</p>
        </div>
        <button
          type="button"
          onClick={handleExportCsv}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white"
        >
          <Download className="w-3.5 h-3.5" />
          Export Attendees CSV ({bookings.length})
        </button>
      </div>

      {/* Concerts Inventory Table */}
      <div className="bg-[#101218] border border-white/10 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#0B0D12] text-slate-400 uppercase tracking-wider text-[10px]">
              <tr>
                <th className="px-4 py-3">Show &amp; Venue</th>
                <th className="px-4 py-3">Seats Left</th>
                <th className="px-4 py-3">Tier Prices (S / G / V / L)</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/8">
              {concerts.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-slate-500">
                    No live concerts yet. Seed the default lineup or schedule a new concert.
                  </td>
                </tr>
              ) : (
                concerts.map((c) => {
                  const isEditing = editingId === c.id;
                  return (
                    <tr key={c.id} className="hover:bg-white/[0.02]">
                      <td className="px-4 py-3.5">
                        <p className="font-semibold text-white">{c.title}</p>
                        <p className="text-[11px] text-slate-400">
                          {c.date} · {c.venue}
                        </p>
                      </td>
                      <td className="px-4 py-3.5 font-mono-num">
                        {isEditing ? (
                          <input
                            type="number"
                            min={0}
                            max={c.totalSeats}
                            aria-label="Seats left"
                            value={editSeatsLeft}
                            onChange={(e) => setEditSeatsLeft(e.target.value)}
                            className="w-20 px-2 py-1 rounded bg-[#08090C] border border-white/20 text-white"
                          />
                        ) : (
                          <span className={c.seatsLeft === 0 ? 'text-rose-400 font-bold' : 'text-white'}>
                            {c.seatsLeft} / {c.totalSeats}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 font-mono-num">
                        {isEditing ? (
                          <div className="flex flex-wrap gap-1.5">
                            {(
                              [
                                ['S', editSilver, setEditSilver],
                                ['G', editGold, setEditGold],
                                ['V', editVip, setEditVip],
                                ['L', editLounge, setEditLounge],
                              ] as const
                            ).map(([lbl, v, setter]) => (
                              <input
                                key={lbl}
                                type="number"
                                min={0}
                                max={100000}
                                aria-label={`${lbl} price`}
                                value={v}
                                onChange={(e) => setter(e.target.value)}
                                className="w-16 px-2 py-1 rounded bg-[#08090C] border border-white/20 text-white text-xs"
                              />
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-300">
                            {getTierUnitPrice(c, 'Silver')} / {getTierUnitPrice(c, 'Gold')} / {getTierUnitPrice(c, 'VIP')} / {getTierUnitPrice(c, 'Lounge')} EGP
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-right whitespace-nowrap">
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
                                Save
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingId(null)}
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
                              Edit
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
                                Confirm Delete
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(null)}
                                aria-label="Cancel delete"
                                className="p-1.5 rounded-md text-slate-400 hover:text-white"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(c.id)}
                              aria-label={`Delete ${c.title}`}
                              className="p-1.5 rounded-md text-slate-400 hover:text-rose-400 hover:bg-rose-500/10"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
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
          <h3 className="text-sm font-semibold text-white">Sold-Out Waitlist Requests</h3>
          <span className="font-mono-num text-xs text-slate-400">{waitlist.length} waiting</span>
        </div>
        {waitlist.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            No waitlist entries yet. When a concert hits 0 seats left, fans can join here.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#0B0D12] text-slate-400 uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="px-4 py-3">Fan</th>
                  <th className="px-4 py-3">Concert</th>
                  <th className="px-4 py-3">Mobile</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/8">
                {waitlist.map((w) => (
                  <tr key={w.id} className="hover:bg-white/[0.02]">
                    <td className="px-4 py-3">
                      <p className="font-medium text-white">{w.name}</p>
                      <p className="text-[11px] text-slate-400">{w.email}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-300">{w.concertTitle}</td>
                    <td className="px-4 py-3 font-mono-num text-white">{w.mobile}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            void copyTextToClipboard(w.mobile).then(() => {
                              onNotify(`Copied mobile ${w.mobile}`);
                            });
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-white/12 text-slate-200 hover:bg-white/[0.06]"
                        >
                          <Copy className="w-3 h-3" />
                          Copy
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleRemoveWaitlist(w.id)}
                          aria-label={`Remove ${w.name} from waitlist`}
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
