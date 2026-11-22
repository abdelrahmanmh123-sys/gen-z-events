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
import { useLanguage } from '../../i18n/LanguageContext';
import {
  formatCurrencyEgp,
  getPaymentMethodLabel,
  getTierCopy,
  localizeKnownMessage,
} from '../../i18n/translations';

interface AdminCheckinProps {
  bookings: Booking[];
  adminName: string;
  isVerifiedStaff: boolean;
  canConfirmPayments: boolean;
  canDeleteBookings: boolean;
  onNotify: (msg: string) => void;
}

type RosterFilter = 'all' | 'unpaid' | 'pending' | 'checked' | 'offline';

export const AdminCheckin: React.FC<AdminCheckinProps> = ({
  bookings,
  adminName,
  isVerifiedStaff,
  canConfirmPayments,
  canDeleteBookings,
  onNotify,
}) => {
  const { lang, isAr, t } = useLanguage();
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
      streamRef.current.getTracks().forEach((track) => track.stop());
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
      setScanResult({
        kind: 'error',
        message: isAr ? `لا توجد تذكرة مطابقة للكود «${code}».` : `No ticket found matching "${code}".`,
      });
      return;
    }
    if (found.checkedIn) {
      playGateTone('warn', soundEnabled);
      setScanResult({
        kind: 'warn',
        message: isAr
          ? `${found.customerName} (${found.bookingCode}) تم تسجيل دخوله مسبقاً في ${found.checkedInAt || 'وقت سابق'}.`
          : `${found.customerName} (${found.bookingCode}) already checked in at ${found.checkedInAt || 'earlier'}.`,
        booking: found,
      });
      return;
    }
    if (found.paymentStatus !== 'Paid') {
      playGateTone('warn', soundEnabled);
      setScanResult({
        kind: 'warn',
        message: canConfirmPayments
          ? isAr
            ? `${found.customerName} (${found.bookingCode}) لم يتم تأكيد الدفع بعد (${getPaymentMethodLabel(found.paymentMethod, lang)} · مرجع: ${found.transferRef}). أكّد التحويل بالأسفل قبل الدخول.`
            : `${found.customerName} (${found.bookingCode}) is UNPAID (${found.paymentMethod} Ref: ${found.transferRef}). Confirm transfer below before entry.`
          : isAr
            ? `${found.customerName} (${found.bookingCode}) لم يتم تأكيد الدفع بعد (${getPaymentMethodLabel(found.paymentMethod, lang)} · مرجع: ${found.transferRef}). تأكيد الدفع متاح للمشرف العام فقط.`
            : `${found.customerName} (${found.bookingCode}) is UNPAID (${found.paymentMethod} Ref: ${found.transferRef}). Payment confirmation requires a Super Admin.`,
        booking: found,
      });
      return;
    }
    verifyingRef.current = true;
    try {
      await adminToggleCheckIn(found, true, adminName, method);
      playGateTone('success', soundEnabled);
      const tierLabel = getTierCopy(found.tier, lang).name;
      setScanResult({
        kind: 'success',
        message: isAr
          ? `تمت الموافقة على الدخول · ${found.customerName} — ${found.quantity}x ${tierLabel} (${found.concertTitle})`
          : `ENTRY APPROVED · ${found.customerName} — ${found.quantity}x ${tierLabel} (${found.concertTitle})`,
        booking: { ...found, checkedIn: true },
      });
      onNotify(isAr ? `تم تسجيل دخول ${found.bookingCode}.` : `Checked in ${found.bookingCode}.`);
    } catch (err) {
      setScanResult({
        kind: 'error',
        message: localizeKnownMessage(formatFriendlyFirebaseError(err), lang),
      });
    } finally {
      verifyingRef.current = false;
    }
  };

  verifyCodeRef.current = verifyCode;

  const startCamera = async () => {
    if (!isVerifiedStaff) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      onNotify(
        isAr
          ? 'الكاميرا غير متاحة في هذا المتصفح. استخدم رفع صورة PNG أو الإدخال اليدوي.'
          : 'Camera API is unavailable on this browser. Use PNG upload or manual code.',
      );
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
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
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
      onNotify(
        isAr
          ? 'تم رفض الوصول للكاميرا أو أن المعاينة تمنعها. افتح الموقع المباشر لمسح الكاميرا، أو استخدم رفع صورة PNG أو الإدخال اليدوي.'
          : 'Camera access was denied or blocked in this preview frame. Open the live site for camera scanning, or use Scan Ticket PNG / manual code.',
      );
    }
  };

  const handleScanImageFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reportNotFound = (customMsg?: string) => {
      playGateTone('error', soundEnabled);
      setScanResult({
        kind: 'error',
        message:
          customMsg ||
          (isAr ? 'لم يتم اكتشاف رمز QR في الصورة المرفوعة.' : 'No QR code detected in the uploaded image.'),
      });
    };

    const reader = new FileReader();
    reader.onerror = () => {
      reportNotFound(isAr ? 'تعذر قراءة ملف الصورة.' : 'Could not read the selected image file.');
    };
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => {
        reportNotFound(isAr ? 'ملف الصورة غير صالح أو تالف.' : 'Invalid or corrupted image file.');
      };
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;

        // 1. Try full image first
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        const fullData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        let decoded = jsQR(fullData.data, fullData.width, fullData.height);

        // 2. Fallback: isolate right-hand ticket stub where our 3:1 pass QR sits (at 2x scale for small screenshots)
        if (!decoded?.data && img.width > 120 && img.height > 80) {
          const sx = Math.floor(img.width * 0.7);
          const sy = Math.floor(img.height * 0.35);
          const sw = img.width - sx;
          const sh = img.height - sy;
          const scale = sw < 400 ? 2 : 1;
          canvas.width = sw * scale;
          canvas.height = sh * scale;
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
          const stubData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          decoded = jsQR(stubData.data, stubData.width, stubData.height);
        }

        if (decoded?.data) {
          setManualCode(decoded.data);
          void verifyCode(decoded.data, 'PNG QR Upload');
        } else {
          reportNotFound();
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
      if (rosterFilter === 'offline' && b.paymentMethod !== 'Offline') return false;
      if (q) {
        const hay = `${b.bookingCode} ${b.customerName} ${b.customerMobile} ${b.concertTitle} ${b.transferRef}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [bookings, rosterSearch, rosterFilter]);

  const handleConfirmPay = async (b: Booking) => {
    if (!canConfirmPayments) return;
    setBusyCode(b.bookingCode);
    try {
      await adminConfirmPayment(b, adminName, 'Desk Confirm');
      playGateTone('success', soundEnabled);
      setScanResult((prev) =>
        prev?.booking?.bookingCode === b.bookingCode
          ? {
              kind: 'success',
              message: isAr
                ? `تم تأكيد الدفع · ${b.customerName} (${b.bookingCode}) — جاهز للدخول على البوابة.`
                : `PAYMENT CONFIRMED · ${b.customerName} (${b.bookingCode}) — Ready for gate entry.`,
              booking: { ...b, paymentStatus: 'Paid' },
            }
          : prev,
      );
      onNotify(
        isAr
          ? `تم تأكيد الدفع للكود ${b.bookingCode} وفُتح رمز الـ QR.`
          : `Payment confirmed for ${b.bookingCode}. QR unlocked.`,
      );
    } catch (err) {
      onNotify(localizeKnownMessage(formatFriendlyFirebaseError(err), lang));
    } finally {
      setBusyCode(null);
    }
  };

  const handleQuickApprove = async (b: Booking) => {
    if (!canConfirmPayments) return;
    setBusyCode(b.bookingCode);
    try {
      await adminConfirmAndCheckIn(b, adminName, 'Gate Pay + Entry');
      playGateTone('success', soundEnabled);
      setScanResult({
        kind: 'success',
        message: isAr
          ? `تم تأكيد الدفع والدخول · ${b.customerName} (${b.bookingCode})`
          : `PAID & CHECKED IN · ${b.customerName} (${b.bookingCode})`,
        booking: { ...b, paymentStatus: 'Paid', checkedIn: true },
      });
      onNotify(
        isAr
          ? `تم تأكيد الدفع وتسجيل دخول ${b.bookingCode}.`
          : `Confirmed payment and admitted ${b.bookingCode}.`,
      );
    } catch (err) {
      onNotify(localizeKnownMessage(formatFriendlyFirebaseError(err), lang));
    } finally {
      setBusyCode(null);
    }
  };

  const handleToggleCheckIn = async (b: Booking) => {
    if (b.paymentStatus !== 'Paid') return;
    setBusyCode(b.bookingCode);
    const nextCheckedIn = !b.checkedIn;
    try {
      await adminToggleCheckIn(b, nextCheckedIn, adminName, 'Roster Toggle');
      setScanResult((prev) =>
        prev?.booking?.bookingCode === b.bookingCode
          ? {
              kind: nextCheckedIn ? 'success' : 'warn',
              message: nextCheckedIn
                ? isAr
                  ? `تمت الموافقة على الدخول · ${b.customerName} (${b.bookingCode})`
                  : `ENTRY APPROVED · ${b.customerName} (${b.bookingCode})`
                : isAr
                  ? `تم التراجع عن تسجيل الدخول · ${b.customerName} (${b.bookingCode})`
                  : `CHECK-IN REVERTED · ${b.customerName} (${b.bookingCode})`,
              booking: { ...b, checkedIn: nextCheckedIn },
            }
          : prev,
      );
      onNotify(
        b.checkedIn
          ? isAr
            ? `تم التراجع عن تسجيل دخول ${b.bookingCode}.`
            : `Reverted check-in for ${b.bookingCode}.`
          : isAr
            ? `تم تسجيل دخول ${b.bookingCode}.`
            : `Checked in ${b.bookingCode}.`,
      );
    } catch (err) {
      onNotify(localizeKnownMessage(formatFriendlyFirebaseError(err), lang));
    } finally {
      setBusyCode(null);
    }
  };

  const handleDelete = async (b: Booking) => {
    if (!canDeleteBookings) return;
    setBusyCode(b.bookingCode);
    try {
      await adminDeleteBooking(b);
      setConfirmDeleteCode(null);
      setScanResult((prev) => (prev?.booking?.bookingCode === b.bookingCode ? null : prev));
      onNotify(isAr ? `تم حذف الحجز ${b.bookingCode}.` : `Deleted booking ${b.bookingCode}.`);
    } catch (err) {
      onNotify(localizeKnownMessage(formatFriendlyFirebaseError(err), lang));
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
              <h2 className="font-display font-bold text-lg text-white">{t.gateQrTitle}</h2>
              <p className="text-xs text-slate-400">{t.gateQrSubtitle}</p>
            </div>
            <button
              type="button"
              onClick={() => setSoundEnabled((v) => !v)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/12 text-xs text-slate-300 hover:text-white"
            >
              {soundEnabled ? <Volume2 className="w-3.5 h-3.5 text-emerald-400" /> : <VolumeX className="w-3.5 h-3.5 text-slate-500" />}
              {soundEnabled ? t.soundOn : t.soundMuted}
            </button>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void verifyCode(manualCode, 'Manual Desk');
            }}
            className="space-y-1.5"
          >
            <label htmlFor="checkin-manual-code" className="block text-xs font-medium text-slate-300">
              {t.bookingCodeLabel}
            </label>
            <div className="flex flex-col sm:flex-row gap-2.5">
              <input
                id="checkin-manual-code"
                type="text"
                dir="ltr"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value.toUpperCase())}
                className="flex-1 px-3.5 py-2.5 rounded-lg bg-[#08090C] border border-white/12 text-sm text-white font-mono-num uppercase focus:outline-none focus:border-white/50"
              />
              <button
                type="submit"
                className="px-5 py-2.5 rounded-lg bg-white hover:bg-neutral-200 text-xs font-semibold text-[#08090C] transition-colors whitespace-nowrap"
              >
                {t.verifyAndAdmit}
              </button>
            </div>
          </form>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={cameraActive ? stopCamera : () => void startCamera()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-white/12 bg-white/[0.04] hover:bg-white/[0.08] text-xs font-semibold text-white"
            >
              {cameraActive ? <CameraOff className="w-3.5 h-3.5 text-rose-400" /> : <Camera className="w-3.5 h-3.5 text-emerald-400" />}
              {cameraActive ? t.stopCamera : t.openCamera}
            </button>

            <label className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-white/12 bg-white/[0.04] hover:bg-white/[0.08] text-xs font-semibold text-white cursor-pointer">
              <ImageUp className="w-3.5 h-3.5 text-amber-300" />
              {t.scanTicketPng}
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
              {canConfirmPayments &&
                scanResult.booking &&
                scanResult.booking.paymentStatus === 'Pending' && (
                  <button
                    type="button"
                    disabled={busyCode === scanResult.booking.bookingCode}
                    onClick={() => void handleQuickApprove(scanResult.booking!)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {t.confirmPayAndApprove}
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
                {t.pointCameraHint}
              </p>
            </div>
          ) : (
            <div className="text-center space-y-2 text-slate-500">
              <Camera className="w-8 h-8 mx-auto opacity-60" />
              <p className="text-xs">{t.cameraIdleHint}</p>
            </div>
          )}
          <canvas ref={canvasRef} className="hidden" />
        </div>
      </div>

      {/* Live Attendee Roster */}
      <div className="bg-[#101218] border border-white/10 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-500 absolute start-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              aria-label={t.searchRosterAria}
              value={rosterSearch}
              onChange={(e) => setRosterSearch(e.target.value)}
              placeholder={t.searchRosterPlaceholder}
              className="w-full ps-9 pe-3 py-2 rounded-lg bg-[#08090C] border border-white/12 text-xs text-white focus:outline-none focus:border-white/50"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                ['all', t.filterAll],
                ['unpaid', t.filterUnpaid],
                ['pending', t.filterPaidReady],
                ['checked', t.filterCheckedIn],
                ['offline', t.filterOffline],
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
          <table className="w-full text-start text-xs">
            <thead className="bg-[#0B0D12] text-slate-400 uppercase tracking-wider text-[10px]">
              <tr>
                <th className="px-4 py-3 text-start">{t.colCode}</th>
                <th className="px-4 py-3 text-start">{t.colAttendee}</th>
                <th className="px-4 py-3 text-start">{t.colConcertTier}</th>
                <th className="px-4 py-3 text-start">{t.colPaymentRef}</th>
                <th className="px-4 py-3 text-end">{t.colActions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/8">
              {filteredRoster.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                    {t.noBookingsMatch}
                  </td>
                </tr>
              ) : (
                filteredRoster.map((b) => (
                  <tr key={b.bookingCode} className="hover:bg-white/[0.02]">
                    <td className="px-4 py-3 font-mono-num font-bold text-white whitespace-nowrap" dir="ltr">
                      {b.bookingCode}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-white">{b.customerName}</p>
                      <p className="text-[11px] font-mono-num text-slate-400" dir="ltr">
                        {b.customerMobile}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-slate-200">{b.concertTitle}</p>
                      <p className="text-[11px] text-slate-400">
                        {b.quantity}x {getTierCopy(b.tier, lang).name} ·{' '}
                        <span className="font-mono-num">{formatCurrencyEgp(b.totalEgp, lang)}</span>
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block font-mono-num text-[10px] font-bold uppercase ${
                          b.paymentStatus === 'Paid' ? 'text-emerald-400' : 'text-amber-300'
                        }`}
                      >
                        {b.paymentStatus === 'Paid' ? t.statusPaid : t.statusPending}
                      </span>
                      <p className="text-[11px] font-mono-num text-slate-400">
                        {getPaymentMethodLabel(b.paymentMethod, lang)} ·{' '}
                        <span dir="ltr">{b.transferRef}</span>
                      </p>
                    </td>
                    <td className="px-4 py-3 text-end whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        {b.paymentStatus !== 'Paid' ? (
                          canConfirmPayments ? (
                            <button
                              type="button"
                              disabled={busyCode === b.bookingCode}
                              onClick={() => void handleConfirmPay(b)}
                              className="px-2.5 py-1.5 rounded-md bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 text-amber-200 font-semibold"
                            >
                              {t.confirmPay}
                            </button>
                          ) : (
                            <span className="px-2.5 py-1.5 rounded-md border border-amber-400/25 bg-amber-400/5 text-[11px] font-medium text-amber-200/80">
                              {t.awaitingSuperAdmin}
                            </span>
                          )
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
                            {b.checkedIn ? t.statusCheckedIn : t.checkInBtn}
                          </button>
                        )}

                        {canDeleteBookings &&
                          (confirmDeleteCode === b.bookingCode ? (
                            <span className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                disabled={busyCode === b.bookingCode}
                                onClick={() => void handleDelete(b)}
                                className="px-2 py-1.5 rounded-md bg-rose-600 text-white font-semibold"
                              >
                                {t.sureBtn}
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteCode(null)}
                                aria-label={t.cancelDeleteAria}
                                className="p-1.5 rounded-md text-slate-400 hover:text-white"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteCode(b.bookingCode)}
                              aria-label={isAr ? `حذف ${b.bookingCode}` : `Delete ${b.bookingCode}`}
                              className="p-1.5 rounded-md text-slate-400 hover:text-rose-400 hover:bg-rose-500/10"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          ))}
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
