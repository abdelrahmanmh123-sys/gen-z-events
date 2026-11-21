import React, { useEffect, useMemo, useRef, useState } from 'react';
import jsQR from 'jsqr';
import {
  Camera,
  CameraOff,
  CheckCircle2,
  ImageUp,
  Search,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import {
  adminConfirmAndCheckIn,
  adminConfirmPayment,
  adminDeleteBooking,
  adminToggleCheckIn,
} from '../../services/firestoreService';
import { formatFriendlyFirebaseError } from '../../firebase';
import type { Booking } from '../../types';
import { playGateTone } from '../../utils/passExport';

interface AdminCheckinProps {
  bookings: Booking[];
  adminName: string;
  onNotify: (msg: string) => void;
}

type RosterFilter = 'all' | 'unpaid' | 'pending' | 'checked';

export const AdminCheckin: React.FC<AdminCheckinProps> = ({
  bookings,
  adminName,
  onNotify,
}) => {
  const [manualCode, setManualCode] = useState('');
  const [scanResult, setScanResult] = useState<{
    kind: 'success' | 'warn' | 'error';
    message: string;
    booking?: Booking;
  } | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [cameraActive, setCameraActive] = useState(false);
  const [rosterSearch, setRosterSearch] = useState('');
  const [rosterFilter, setRosterFilter] = useState<RosterFilter>('all');
  const [confirmDeleteCode, setConfirmDeleteCode] = useState<string | null>(null);
  const [busyCode, setBusyCode] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const cameraTimerRef = useRef<number | null>(null);
  const cooldownTimerRef = useRef<number | null>(null);
  const verifyingRef = useRef(false);
  const lastScannedRef = useRef<string>('');
  const verifyCodeRef = useRef<(code: string, method: string) => Promise<void>>(async () => {});

  const stopCamera = () => {
    if (cameraTimerRef.current !== null) {
      window.clearTimeout(cameraTimerRef.current);
      cameraTimerRef.current = null;
    }
    if (cooldownTimerRef.current !== null) {
      window.clearTimeout(cooldownTimerRef.current);
      cooldownTimerRef.current = null;
    }
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  useEffect(() => {
    return () => stopCamera();
  }, []);

  const verifyCode = async (rawCode: string, method: string) => {
    const code = rawCode.trim().toUpperCase();
    if (!code || verifyingRef.current) return;
    const found = bookings.find((b) => b.bookingCode.toUpperCase() === code);
    if (!found) {
      playGateTone('error', soundEnabled);
      setScanResult({ kind: 'error', message: `No ticket found matching "${code}".` });
      return;
    }
    if (found.checkedIn) {
      playGateTone('warn', soundEnabled);
      setScanResult({
        kind: 'warn',
        message: `${found.customerName} (${found.bookingCode}) already checked in at ${found.checkedInAt || 'earlier'}.`,
        booking: found,
      });
      return;
    }
    if (found.paymentStatus !== 'Paid') {
      playGateTone('warn', soundEnabled);
      setScanResult({
        kind: 'warn',
        message: `${found.customerName} (${found.bookingCode}) is UNPAID (${found.paymentMethod} Ref: ${found.transferRef}). Confirm transfer below before entry.`,
        booking: found,
      });
      return;
    }
    verifyingRef.current = true;
    try {
      await adminToggleCheckIn(found, true, adminName, method);
      playGateTone('success', soundEnabled);
      setScanResult({
        kind: 'success',
        message: `ENTRY APPROVED · ${found.customerName} — ${found.quantity}x ${found.tier} (${found.concertTitle})`,
        booking: { ...found, checkedIn: true },
      });
      onNotify(`Checked in ${found.bookingCode}.`);
    } catch (err) {
      setScanResult({ kind: 'error', message: formatFriendlyFirebaseError(err) });
    } finally {
      verifyingRef.current = false;
    }
  };

  verifyCodeRef.current = verifyCode;

  const startCamera = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      onNotify('Camera API is unavailable on this browser. Use PNG upload or manual code.');
      return;
    }
    stopCamera();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      streamRef.current = stream;
      setCameraActive(true);
      cameraTimerRef.current = window.setTimeout(() => {
        cameraTimerRef.current = null;
        if (!streamRef.current) return;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play();
        }
        const scanLoop = () => {
          const video = videoRef.current;
          const canvas = canvasRef.current;
          if (!video || !canvas || !streamRef.current) return;
          if (video.readyState === video.HAVE_ENOUGH_DATA) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
              const decoded = jsQR(imgData.data, imgData.width, imgData.height);
              if (decoded?.data && decoded.data !== lastScannedRef.current) {
                lastScannedRef.current = decoded.data;
                setManualCode(decoded.data);
                void verifyCodeRef.current(decoded.data, 'Camera QR');
                if (cooldownTimerRef.current !== null) {
                  window.clearTimeout(cooldownTimerRef.current);
                }
                cooldownTimerRef.current = window.setTimeout(() => {
                  lastScannedRef.current = '';
                  cooldownTimerRef.current = null;
                }, 3000);
              }
            }
          }
          rafRef.current = requestAnimationFrame(scanLoop);
        };
        rafRef.current = requestAnimationFrame(scanLoop);
      }, 150);
    } catch {
      onNotify('Camera access denied or unavailable. Use PNG upload or manual code.');
    }
  };

  const handleScanImageFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0);
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const decoded = jsQR(imgData.data, imgData.width, imgData.height);
        if (decoded?.data) {
          setManualCode(decoded.data);
          void verifyCode(decoded.data, 'PNG QR Upload');
        } else {
          playGateTone('error', soundEnabled);
          setScanResult({ kind: 'error', message: 'No QR code detected in the uploaded image.' });
        }
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const filteredRoster = useMemo(() => {
    const q = rosterSearch.trim().toLowerCase();
    return bookings.filter((b) => {
      if (rosterFilter === 'unpaid' && b.paymentStatus !== 'Pending') return false;
      if (rosterFilter === 'pending' && (b.paymentStatus !== 'Paid' || b.checkedIn)) return false;
      if (rosterFilter === 'checked' && !b.checkedIn) return false;
      if (q) {
        const hay = `${b.bookingCode} ${b.customerName} ${b.customerMobile} ${b.concertTitle} ${b.transferRef}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [bookings, rosterSearch, rosterFilter]);

  const handleConfirmPay = async (b: Booking) => {
    setBusyCode(b.bookingCode);
    try {
      await adminConfirmPayment(b, adminName, 'Desk Confirm');
      playGateTone('success', soundEnabled);
      setScanResult((prev) =>
        prev?.booking?.bookingCode === b.bookingCode
          ? {
              kind: 'success',
              message: `PAYMENT CONFIRMED · ${b.customerName} (${b.bookingCode}) — Ready for gate entry.`,
              booking: { ...b, paymentStatus: 'Paid' },
            }
          : prev,
      );
      onNotify(`Payment confirmed for ${b.bookingCode}. QR unlocked.`);
    } catch (err) {
      onNotify(formatFriendlyFirebaseError(err));
    } finally {
      setBusyCode(null);
    }
  };

  const handleQuickApprove = async (b: Booking) => {
    setBusyCode(b.bookingCode);
    try {
      await adminConfirmAndCheckIn(b, adminName, 'Gate Pay + Entry');
      playGateTone('success', soundEnabled);
      setScanResult({
        kind: 'success',
        message: `PAID & CHECKED IN · ${b.customerName} (${b.bookingCode})`,
        booking: { ...b, paymentStatus: 'Paid', checkedIn: true },
      });
      onNotify(`Confirmed payment and admitted ${b.bookingCode}.`);
    } catch (err) {
      onNotify(formatFriendlyFirebaseError(err));
    } finally {
      setBusyCode(null);
    }
  };

  const handleToggleCheckIn = async (b: Booking) => {
    setBusyCode(b.bookingCode);
    const nextCheckedIn = !b.checkedIn;
    try {
      await adminToggleCheckIn(b, nextCheckedIn, adminName, 'Roster Toggle');
      setScanResult((prev) =>
        prev?.booking?.bookingCode === b.bookingCode
          ? {
              kind: nextCheckedIn ? 'success' : 'warn',
              message: nextCheckedIn
                ? `ENTRY APPROVED · ${b.customerName} (${b.bookingCode})`
                : `CHECK-IN REVERTED · ${b.customerName} (${b.bookingCode})`,
              booking: { ...b, checkedIn: nextCheckedIn },
            }
          : prev,
      );
      onNotify(b.checkedIn ? `Reverted check-in for ${b.bookingCode}.` : `Checked in ${b.bookingCode}.`);
    } catch (err) {
      onNotify(formatFriendlyFirebaseError(err));
    } finally {
      setBusyCode(null);
    }
  };

  const handleDelete = async (b: Booking) => {
    setBusyCode(b.bookingCode);
    try {
      await adminDeleteBooking(b);
      setConfirmDeleteCode(null);
      setScanResult((prev) => (prev?.booking?.bookingCode === b.bookingCode ? null : prev));
      onNotify(`Deleted booking ${b.bookingCode}.`);
    } catch (err) {
      onNotify(formatFriendlyFirebaseError(err));
    } finally {
      setBusyCode(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Gate Scanner & Manual Verify */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Manual & PNG Scan Card */}
        <div className="lg:col-span-7 bg-[#101218] border border-white/10 rounded-xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display font-bold text-lg text-white">Gate QR &amp; Code Verification</h2>
              <p className="text-xs text-slate-400">Scan a fan&apos;s E-Pass or enter booking code manually.</p>
            </div>
            <button
              type="button"
              onClick={() => setSoundEnabled((v) => !v)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/12 text-xs text-slate-300 hover:text-white"
            >
              {soundEnabled ? <Volume2 className="w-3.5 h-3.5 text-emerald-400" /> : <VolumeX className="w-3.5 h-3.5 text-slate-500" />}
              Sound {soundEnabled ? 'On' : 'Muted'}
            </button>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void verifyCode(manualCode, 'Manual Desk');
            }}
            className="flex flex-col sm:flex-row gap-2.5"
          >
            <input
              type="text"
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value.toUpperCase())}
              placeholder="Enter Booking Code (e.g. GZ-7K9P2M)"
              className="flex-1 px-3.5 py-2.5 rounded-lg bg-[#08090C] border border-white/12 text-sm text-white font-mono-num uppercase focus:outline-none focus:border-rose-500"
            />
            <button
              type="submit"
              className="px-5 py-2.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-xs font-semibold text-white whitespace-nowrap"
            >
              Verify &amp; Admit
            </button>
          </form>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={cameraActive ? stopCamera : () => void startCamera()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-white/12 bg-white/[0.04] hover:bg-white/[0.08] text-xs font-semibold text-white"
            >
              {cameraActive ? <CameraOff className="w-3.5 h-3.5 text-rose-400" /> : <Camera className="w-3.5 h-3.5 text-emerald-400" />}
              {cameraActive ? 'Stop Camera Scanner' : 'Open Camera Scanner'}
            </button>

            <label className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-white/12 bg-white/[0.04] hover:bg-white/[0.08] text-xs font-semibold text-white cursor-pointer">
              <ImageUp className="w-3.5 h-3.5 text-amber-300" />
              Scan Ticket PNG
              <input type="file" accept="image/*" onChange={handleScanImageFile} className="sr-only" />
            </label>
          </div>

          {scanResult && (
            <div
              className={`p-3.5 rounded-lg border text-xs space-y-2.5 ${
                scanResult.kind === 'success'
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                  : scanResult.kind === 'warn'
                    ? 'border-amber-400/40 bg-amber-400/10 text-amber-100'
                    : 'border-rose-500/40 bg-rose-500/10 text-rose-200'
              }`}
            >
              <p className="font-medium leading-relaxed">{scanResult.message}</p>
              {scanResult.booking && scanResult.booking.paymentStatus === 'Pending' && (
                <button
                  type="button"
                  disabled={busyCode === scanResult.booking.bookingCode}
                  onClick={() => void handleQuickApprove(scanResult.booking!)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Confirm Payment &amp; Approve Entry
                </button>
              )}
            </div>
          )}
        </div>

        {/* Camera Viewport */}
        <div className="lg:col-span-5 bg-[#101218] border border-white/10 rounded-xl p-5 flex flex-col justify-center items-center min-h-[210px]">
          {cameraActive ? (
            <div className="w-full space-y-2">
              <video
                ref={videoRef}
                muted
                playsInline
                className="w-full h-48 object-cover rounded-lg bg-black border border-emerald-500/40"
              />
              <p className="text-[11px] text-center text-emerald-400 font-mono-num">
                Point camera at fan QR pass…
              </p>
            </div>
          ) : (
            <div className="text-center space-y-2 text-slate-500">
              <Camera className="w-8 h-8 mx-auto opacity-60" />
              <p className="text-xs">Camera scanner idle. Tap Open Camera Scanner or upload a PNG pass.</p>
            </div>
          )}
          <canvas ref={canvasRef} className="hidden" />
        </div>
      </div>

      {/* Live Attendee Roster */}
      <div className="bg-[#101218] border border-white/10 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={rosterSearch}
              onChange={(e) => setRosterSearch(e.target.value)}
              placeholder="Search code, name, mobile, or transfer ref..."
              className="w-full pl-9 pr-3 py-2 rounded-lg bg-[#08090C] border border-white/12 text-xs text-white focus:outline-none focus:border-rose-500"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                ['all', 'All'],
                ['unpaid', 'Unpaid'],
                ['pending', 'Paid · Ready'],
                ['checked', 'Checked In'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setRosterFilter(id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
                  rosterFilter === id
                    ? 'bg-white text-[#08090C] font-semibold'
                    : 'text-slate-400 hover:text-white hover:bg-white/[0.05]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#0B0D12] text-slate-400 uppercase tracking-wider text-[10px]">
              <tr>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Attendee</th>
                <th className="px-4 py-3">Concert &amp; Tier</th>
                <th className="px-4 py-3">Payment / Ref</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/8">
              {filteredRoster.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                    No bookings match this filter.
                  </td>
                </tr>
              ) : (
                filteredRoster.map((b) => (
                  <tr key={b.bookingCode} className="hover:bg-white/[0.02]">
                    <td className="px-4 py-3 font-mono-num font-bold text-white whitespace-nowrap">
                      {b.bookingCode}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-white">{b.customerName}</p>
                      <p className="text-[11px] font-mono-num text-slate-400">{b.customerMobile}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-slate-200">{b.concertTitle}</p>
                      <p className="text-[11px] text-slate-400">
                        {b.quantity}x {b.tier} · <span className="font-mono-num">{b.totalEgp.toLocaleString()} EGP</span>
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block font-mono-num text-[10px] font-bold uppercase ${
                          b.paymentStatus === 'Paid' ? 'text-emerald-400' : 'text-amber-300'
                        }`}
                      >
                        {b.paymentStatus}
                      </span>
                      <p className="text-[11px] font-mono-num text-slate-400">
                        {b.paymentMethod} · {b.transferRef}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        {b.paymentStatus !== 'Paid' ? (
                          <button
                            type="button"
                            disabled={busyCode === b.bookingCode}
                            onClick={() => void handleConfirmPay(b)}
                            className="px-2.5 py-1.5 rounded-md bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 text-amber-200 font-semibold"
                          >
                            Confirm Pay
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={busyCode === b.bookingCode}
                            onClick={() => void handleToggleCheckIn(b)}
                            className={`px-2.5 py-1.5 rounded-md font-semibold border ${
                              b.checkedIn
                                ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                                : 'bg-white/[0.06] border-white/15 text-white hover:bg-white/[0.12]'
                            }`}
                          >
                            {b.checkedIn ? 'Checked In' : 'Check In'}
                          </button>
                        )}

                        {confirmDeleteCode === b.bookingCode ? (
                          <span className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              disabled={busyCode === b.bookingCode}
                              onClick={() => void handleDelete(b)}
                              className="px-2 py-1.5 rounded-md bg-rose-600 text-white font-semibold"
                            >
                              Sure?
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteCode(null)}
                              aria-label="Cancel delete"
                              className="p-1.5 rounded-md text-slate-400 hover:text-white"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteCode(b.bookingCode)}
                            aria-label={`Delete booking ${b.bookingCode}`}
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
    </div>
  );
};
