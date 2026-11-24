import React, { useEffect, useMemo, useRef, useState } from 'react';
import jsQR from 'jsqr';
import {
  AlertTriangle,
  Camera,
  CameraOff,
  CheckCircle2,
  ImageUp,
  RotateCcw,
  Search,
  ShieldAlert,
  Trash2,
  Volume2,
  VolumeX,
  X,
  XCircle,
} from 'lucide-react';
import {
  adminConfirmAndCheckIn,
  adminConfirmPayment,
  adminDeleteBooking,
  adminToggleCheckIn,
} from '../../services/firestoreService';
import { formatFriendlyFirebaseError } from '../../firebase';
import type { Booking } from '../../types';
import {
  buildUnreadableQrVerdict,
  classifyCameraError,
  computeDecodedImageDimensions,
  evaluateGateQrScan,
  getCameraConstraintFallbacks,
  type CameraErrorInfo,
  type GateScanVerdict,
} from '../../utils/gateScanLogic';
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
  const [scanResult, setScanResult] = useState<GateScanVerdict | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<CameraErrorInfo | null>(null);
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
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  useEffect(() => {
    return () => stopCamera();
  }, []);

  const resetScanForNext = () => {
    setScanResult(null);
    setManualCode('');
    lastScannedRef.current = '';
    if (cooldownTimerRef.current !== null) {
      window.clearTimeout(cooldownTimerRef.current);
      cooldownTimerRef.current = null;
    }
  };

  const verifyCode = async (rawCode: string, method: string) => {
    const trimmed = rawCode.trim();
    if (!trimmed || verifyingRef.current) return;

    const evaluation = evaluateGateQrScan(trimmed, bookings, {
      lang,
      canConfirmPayments,
    });

    if (!evaluation.isValid || !evaluation.booking) {
      playGateTone(evaluation.tone === 'warn' ? 'warn' : 'error', soundEnabled);
      setScanResult(evaluation);
      return;
    }

    const found = bookings.find(
      (b) => b.bookingCode.trim().toUpperCase() === evaluation.booking!.bookingCode.trim().toUpperCase(),
    );
    if (!found) {
      playGateTone('error', soundEnabled);
      setScanResult(evaluation);
      return;
    }

    verifyingRef.current = true;
    try {
      await adminToggleCheckIn(found, true, adminName, method);
      playGateTone('success', soundEnabled);
      setScanResult(evaluation);
      const nextScan = (typeof found.scansUsed === 'number' ? found.scansUsed : 0) + 1;
      const maxScans = Math.max(1, found.quantity);
      onNotify(isAr
        ? `تم تسجيل دخول ${found.bookingCode} (${nextScan}/${maxScans}).`
        : `Checked in ${found.bookingCode} (${nextScan}/${maxScans}).`);
    } catch (err) {
      playGateTone('error', soundEnabled);
      const rawMsg = err instanceof Error ? err.message : '';
      if (rawMsg.startsWith('ALREADY_CHECKED_IN|')) {
        const [, checkedAt, byStaff] = rawMsg.split('|');
        const detailParts = [
          checkedAt ? (isAr ? `الساعة ${checkedAt}` : `at ${checkedAt}`) : '',
          byStaff ? (isAr ? `بواسطة ${byStaff}` : `by ${byStaff}`) : '',
        ].filter(Boolean);
        const maxScans = Math.max(1, found.quantity);
        setScanResult({
          status: 'invalid_already_used',
          isValid: false,
          tone: 'error',
          verdictBadge: isAr
            ? `مرفوض — جميع المسحات مستخدمة (${maxScans}/${maxScans})`
            : `INVALID — ALL SCANS USED (${maxScans}/${maxScans})`,
          headline: `${found.customerName} (${found.bookingCode})`,
          reason: isAr
            ? `تم تسجيل دخول هذه التذكرة للتو على بوابة أخرى${detailParts.length ? ` (${detailParts.join(' · ')})` : ''}. لا تسمح بالدخول.`
            : `This pass was just admitted on another scanner${detailParts.length ? ` (${detailParts.join(' · ')})` : ''}. Do not admit.`,
          scannedCode: found.bookingCode,
          booking: { ...found, checkedIn: true, checkedInAt: checkedAt || found.checkedInAt },
        });
      } else {
        setScanResult({
          status: 'invalid_not_found',
          isValid: false,
          tone: 'error',
          verdictBadge: isAr ? 'خطأ في التحقق' : 'VERIFICATION ERROR',
          headline: isAr ? 'تعذر إتمام تسجيل الدخول' : 'Check-In Failed',
          reason:
            rawMsg === 'PAYMENT_NOT_PAID'
              ? isAr
                ? 'هذه التذكرة لم يتم تأكيد دفعها بعد.'
                : 'This ticket has not been confirmed as paid yet.'
              : localizeKnownMessage(formatFriendlyFirebaseError(err), lang),
          scannedCode: found.bookingCode,
        });
      }
    } finally {
      verifyingRef.current = false;
    }
  };

  verifyCodeRef.current = verifyCode;

  const startCamera = async () => {
    if (!isVerifiedStaff) return;
    setCameraError(null);

    const isEmbedded = (() => {
      try {
        return window.self !== window.top;
      } catch {
        return true;
      }
    })();
    const isSecure = typeof window !== 'undefined' ? Boolean(window.isSecureContext) : true;

    if (!navigator.mediaDevices?.getUserMedia) {
      const info = classifyCameraError(
        { name: isSecure ? 'NotFoundError' : 'SecurityError' },
        { lang, isEmbedded, isSecureContext: isSecure },
      );
      setCameraError(info);
      onNotify(info.detail);
      return;
    }

    stopCamera();
    const fallbacks = getCameraConstraintFallbacks();
    let stream: MediaStream | null = null;
    let lastError: unknown = null;

    for (const constraints of fallbacks) {
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        break;
      } catch (err) {
        lastError = err;
        const errName =
          err && typeof err === 'object' && 'name' in err
            ? String((err as { name?: unknown }).name || '')
            : '';
        // Permission or security errors will not succeed with looser constraints
        if (
          errName === 'NotAllowedError' ||
          errName === 'PermissionDeniedError' ||
          errName === 'SecurityError'
        ) {
          break;
        }
      }
    }

    if (!stream) {
      const info = classifyCameraError(lastError, {
        lang,
        isEmbedded,
        isSecureContext: isSecure,
      });
      setCameraError(info);
      onNotify(info.detail);
      return;
    }

    streamRef.current = stream;
    setCameraActive(true);

    const attachAndScan = async () => {
      const video = videoRef.current;
      if (!video || !streamRef.current) return;
      video.srcObject = stream;
      video.setAttribute('playsinline', 'true');
      video.setAttribute('webkit-playsinline', 'true');
      try {
        await video.play();
      } catch {
        // Autoplay fallback: user already tapped Open Camera; continue scan loop once frames arrive
      }

      const scanLoop = () => {
        const activeVideo = videoRef.current;
        const canvas = canvasRef.current;
        if (!activeVideo || !canvas || !streamRef.current) return;
        if (
          activeVideo.readyState >= activeVideo.HAVE_CURRENT_DATA &&
          activeVideo.videoWidth > 0 &&
          activeVideo.videoHeight > 0
        ) {
          const scaled = computeDecodedImageDimensions(
            activeVideo.videoWidth,
            activeVideo.videoHeight,
            960,
          );
          canvas.width = scaled.width;
          canvas.height = scaled.height;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (ctx) {
            ctx.drawImage(activeVideo, 0, 0, canvas.width, canvas.height);
            const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const decoded = jsQR(imgData.data, imgData.width, imgData.height, {
              inversionAttempts: 'attemptBoth',
            });
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
    };

    void attachAndScan();
  };

  const handleScanImageFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reportNotFound = (customMsg?: string) => {
      playGateTone('error', soundEnabled);
      setScanResult(buildUnreadableQrVerdict(lang, customMsg));
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

        // 1. Try scaled full image first (handles 12MP-50MP Samsung phone photos cleanly & fast)
        const scaled = computeDecodedImageDimensions(img.width, img.height, 1400);
        canvas.width = scaled.width;
        canvas.height = scaled.height;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const fullData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        let decoded = jsQR(fullData.data, fullData.width, fullData.height, {
          inversionAttempts: 'attemptBoth',
        });

        // 2. Fallback: isolate center square (typical mobile photo framing)
        if (!decoded?.data && img.width > 200 && img.height > 200) {
          const cropSize = Math.floor(Math.min(img.width, img.height) * 0.72);
          const sx = Math.floor((img.width - cropSize) / 2);
          const sy = Math.floor((img.height - cropSize) / 2);
          const centerDims = computeDecodedImageDimensions(cropSize, cropSize, 1000);
          canvas.width = centerDims.width;
          canvas.height = centerDims.height;
          ctx.drawImage(img, sx, sy, cropSize, cropSize, 0, 0, canvas.width, canvas.height);
          const centerData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          decoded = jsQR(centerData.data, centerData.width, centerData.height, {
            inversionAttempts: 'attemptBoth',
          });
        }

        // 3. Fallback: isolate right-hand ticket stub where our 3:1 pass QR sits (at 2x scale for small screenshots)
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
          decoded = jsQR(stubData.data, stubData.width, stubData.height, {
            inversionAttempts: 'attemptBoth',
          });
        }

        if (decoded?.data) {
          setManualCode(decoded.data);
          void verifyCode(decoded.data, 'Camera / Photo QR');
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
              status: 'valid_ready',
              isValid: true,
              tone: 'success',
              verdictBadge: isAr ? 'تم تأكيد الدفع — جاهز للدخول' : 'PAYMENT CONFIRMED — READY',
              headline: `${b.customerName} (${b.bookingCode})`,
              reason: isAr
                ? 'تم تأكيد دفع التذكرة بنجاح وأصبحت صالحة للدخول على البوابة الآن.'
                : 'Payment has been confirmed and this ticket is now valid for gate entry.',
              scannedCode: b.bookingCode,
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
      const tierLabel = getTierCopy(b.tier, lang).name;
      const nextScans = (typeof b.scansUsed === 'number' ? b.scansUsed : 0) + 1;
      const fullyAdmitted = nextScans >= b.quantity;
      setScanResult({
        status: fullyAdmitted ? 'valid_ready' : 'valid_partial',
        isValid: true,
        tone: 'success',
        verdictBadge: isAr
          ? `تذكرة صالحة — تم الدفع والدخول (${nextScans}/${b.quantity})`
          : `VALID — PAID & ADMITTED (${nextScans}/${b.quantity})`,
        headline: `${b.customerName} — ${b.quantity}x ${tierLabel}`,
        reason: isAr
          ? `تم تأكيد الدفع وتسجيل الدخول بنجاح للكود ${b.bookingCode} (${b.concertTitle}). مسح ${nextScans} من ${b.quantity}.`
          : `Payment confirmed and entry approved for ${b.bookingCode} (${b.concertTitle}). Scan ${nextScans} of ${b.quantity}.`,
        scannedCode: b.bookingCode,
        booking: { ...b, paymentStatus: 'Paid', checkedIn: fullyAdmitted, scansUsed: nextScans },
      });
      onNotify(
        isAr
          ? `تم تأكيد الدفع وتسجيل دخول ${b.bookingCode} (${nextScans}/${b.quantity}).`
          : `Confirmed payment and admitted ${b.bookingCode} (${nextScans}/${b.quantity}).`,
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
    const currentScans = typeof b.scansUsed === 'number' ? b.scansUsed : (b.checkedIn ? b.quantity : 0);
    const maxScans = Math.max(1, b.quantity);
    const nextCheckedIn = currentScans < maxScans;
    const nextScans = nextCheckedIn ? currentScans + 1 : 0;
    try {
      await adminToggleCheckIn(b, nextCheckedIn, adminName, 'Roster Toggle');
      setScanResult((prev) =>
        prev?.booking?.bookingCode === b.bookingCode
          ? {
              status: nextCheckedIn ? (nextScans >= maxScans ? 'valid_ready' : 'valid_partial') : 'invalid_unpaid',
              isValid: nextCheckedIn,
              tone: nextCheckedIn ? 'success' : 'warn',
              verdictBadge: nextCheckedIn
                ? isAr
                  ? `تذكرة صالحة — دخول مسموح (${nextScans}/${maxScans})`
                  : `VALID TICKET — ENTRY APPROVED (${nextScans}/${maxScans})`
                : isAr
                  ? 'تم التراجع عن الدخول'
                  : 'CHECK-IN REVERTED',
              headline: `${b.customerName} (${b.bookingCode})`,
              reason: nextCheckedIn
                ? isAr
                  ? `تم تسجيل دخول التذكرة بنجاح (${b.concertTitle}). مسح ${nextScans} من ${maxScans}.`
                  : `Ticket marked as checked in (${b.concertTitle}). Scan ${nextScans} of ${maxScans}.`
                : isAr
                  ? 'تم التراجع عن تسجيل دخول هذه التذكرة ويمكن مسحها مجدداً.'
                  : 'Check-in status was reverted; this ticket can be scanned again.',
              scannedCode: b.bookingCode,
              booking: { ...b, checkedIn: nextScans >= maxScans, scansUsed: nextScans },
            }
          : prev,
      );
      onNotify(
        nextCheckedIn
          ? isAr
            ? `تم تسجيل دخول ${b.bookingCode} (${nextScans}/${maxScans}).`
            : `Checked in ${b.bookingCode} (${nextScans}/${maxScans}).`
          : isAr
            ? `تم التراجع عن تسجيل دخول ${b.bookingCode} (0/${maxScans}).`
            : `Reverted check-in for ${b.bookingCode} (0/${maxScans}).`,
      );
    } catch (err) {
      const rawMsg = err instanceof Error ? err.message : '';
      if (rawMsg.startsWith('ALREADY_CHECKED_IN|')) {
        playGateTone('error', soundEnabled);
        onNotify(
          isAr
            ? `التذكرة ${b.bookingCode} تم تسجيل دخولها بالفعل على جهاز آخر.`
            : `Ticket ${b.bookingCode} was already checked in on another device.`,
        );
      } else {
        onNotify(localizeKnownMessage(formatFriendlyFirebaseError(err), lang));
      }
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
      {/* Top Gate Scanner Stage & Manual Verification */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        {/* Enlarged Live Camera Scanner Stage */}
        <div
          className={`lg:col-span-7 bg-[#101218] rounded-xl p-4 sm:p-5 flex flex-col justify-between gap-4 border-2 transition-colors ${
            scanResult
              ? scanResult.tone === 'success'
                ? 'border-emerald-500/80 shadow-[0_0_24px_rgba(16,185,129,0.18)]'
                : scanResult.tone === 'warn'
                  ? 'border-amber-400/80 shadow-[0_0_24px_rgba(251,191,36,0.16)]'
                  : 'border-rose-500/85 shadow-[0_0_24px_rgba(244,63,94,0.22)]'
              : 'border-white/10'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display font-bold text-lg text-white">{t.gateQrTitle}</h2>
              <p className="text-xs text-slate-400">{t.gateQrSubtitle}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSoundEnabled((v) => !v)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/12 text-xs text-slate-300 hover:text-white"
              >
                {soundEnabled ? (
                  <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <VolumeX className="w-3.5 h-3.5 text-slate-500" />
                )}
                {soundEnabled ? t.soundOn : t.soundMuted}
              </button>
              <button
                type="button"
                onClick={cameraActive ? stopCamera : () => void startCamera()}
                className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
                  cameraActive
                    ? 'border-rose-500/40 bg-rose-500/15 hover:bg-rose-500/25 text-rose-200'
                    : 'border-emerald-500/40 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-200'
                }`}
              >
                {cameraActive ? (
                  <CameraOff className="w-3.5 h-3.5" />
                ) : (
                  <Camera className="w-3.5 h-3.5" />
                )}
                {cameraActive ? t.stopCamera : t.openCamera}
              </button>
            </div>
          </div>

          {/* Enlarged Viewfinder Container */}
          <div className="relative w-full h-[340px] sm:h-[420px] lg:h-[450px] rounded-xl overflow-hidden bg-[#06070A] border border-white/12 flex flex-col items-center justify-center">
            {/* Keep video mounted so Samsung Browser & iOS Safari preserve user-gesture playback */}
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className={cameraActive ? 'w-full h-full object-cover' : 'hidden'}
            />
            {cameraActive ? (
              <>
                {/* Live Scanner Indicator */}
                <div className="absolute top-3 start-3 inline-flex items-center gap-2 px-3 py-1 rounded-md bg-black/75 backdrop-blur-md border border-white/15 text-[11px] font-mono-num font-semibold text-emerald-300">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  {t.cameraLiveBadge}
                </div>

                {/* Targeting Reticle Frame */}
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-8">
                  <div
                    className={`relative w-56 h-56 sm:w-64 sm:h-64 rounded-2xl border-2 transition-colors ${
                      scanResult
                        ? scanResult.tone === 'success'
                          ? 'border-emerald-400 shadow-[0_0_0_9999px_rgba(0,0,0,0.4)]'
                          : scanResult.tone === 'warn'
                            ? 'border-amber-400 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]'
                            : 'border-rose-500 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]'
                        : 'border-white/60 shadow-[0_0_0_9999px_rgba(0,0,0,0.38)]'
                    }`}
                  >
                    <span className="absolute -top-0.5 -start-0.5 w-6 h-6 border-t-4 border-s-4 border-white rounded-tl-xl" />
                    <span className="absolute -top-0.5 -end-0.5 w-6 h-6 border-t-4 border-e-4 border-white rounded-tr-xl" />
                    <span className="absolute -bottom-0.5 -start-0.5 w-6 h-6 border-b-4 border-s-4 border-white rounded-bl-xl" />
                    <span className="absolute -bottom-0.5 -end-0.5 w-6 h-6 border-b-4 border-e-4 border-white rounded-br-xl" />
                  </div>
                </div>

                {/* Bottom Hint or Instant Color-Coded Verdict Strip */}
                <div className="absolute bottom-3 inset-x-3 flex justify-center">
                  {scanResult ? (
                    <p
                      className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-extrabold uppercase tracking-wider rtl:tracking-normal shadow-xl border ${
                        scanResult.tone === 'success'
                          ? 'bg-emerald-500 text-[#04140D] border-emerald-200'
                          : scanResult.tone === 'warn'
                            ? 'bg-amber-400 text-[#1A1202] border-amber-200'
                            : 'bg-rose-600 text-white border-rose-300'
                      }`}
                    >
                      {scanResult.verdictBadge}
                    </p>
                  ) : (
                    <p className="px-3.5 py-1.5 rounded-lg bg-black/80 backdrop-blur-md border border-white/15 text-xs font-medium text-emerald-300">
                      {t.pointCameraHint}
                    </p>
                  )}
                </div>
              </>
            ) : cameraError ? (
              <div className="text-center space-y-4 px-6 max-w-md">
                <div className="w-14 h-14 rounded-2xl bg-amber-500/15 border border-amber-400/35 flex items-center justify-center mx-auto">
                  <AlertTriangle className="w-7 h-7 text-amber-300" />
                </div>
                <div className="space-y-1.5">
                  <p className="font-display font-bold text-base text-white">
                    {cameraError.title}
                  </p>
                  <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                    {cameraError.detail}
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
                  {cameraError.canRetry && (
                    <button
                      type="button"
                      onClick={() => void startCamera()}
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-white hover:bg-neutral-200 text-xs font-semibold text-[#08090C] transition-colors"
                    >
                      <RotateCcw className="w-4 h-4" />
                      {t.retryCamera}
                    </button>
                  )}
                  <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-xs font-bold text-[#04140D] cursor-pointer transition-colors">
                    <Camera className="w-4 h-4" />
                    {t.snapQrCamera}
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handleScanImageFile}
                      className="sr-only"
                    />
                  </label>
                </div>
              </div>
            ) : (
              <div className="text-center space-y-4 px-6 max-w-md">
                <div className="w-16 h-16 rounded-2xl bg-white/[0.04] border border-white/10 flex items-center justify-center mx-auto">
                  <Camera className="w-8 h-8 text-emerald-400" />
                </div>
                <p className="text-sm text-slate-300 leading-relaxed">{t.cameraIdleHint}</p>
                <div className="flex flex-wrap items-center justify-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => void startCamera()}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-white hover:bg-neutral-200 text-xs font-semibold text-[#08090C] transition-colors"
                  >
                    <Camera className="w-4 h-4" />
                    {t.openCamera}
                  </button>
                  <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-emerald-500/40 bg-emerald-500/15 hover:bg-emerald-500/25 text-xs font-semibold text-emerald-200 cursor-pointer transition-colors">
                    <Camera className="w-4 h-4" />
                    {t.snapQrCamera}
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handleScanImageFile}
                      className="sr-only"
                    />
                  </label>
                </div>
              </div>
            )}
            <canvas ref={canvasRef} className="hidden" />
          </div>
        </div>

        {/* Right Panel: Prominent VALID / INVALID Verdict + Manual & PNG Verification */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          {/* Unmistakable High-Contrast Scan Verdict Banner */}
          {scanResult && (
            <div
              role="status"
              aria-live="assertive"
              className={`rounded-xl border-2 p-5 space-y-3.5 ${
                scanResult.tone === 'success'
                  ? 'border-emerald-400 bg-emerald-950/70 text-emerald-50'
                  : scanResult.tone === 'warn'
                    ? 'border-amber-400 bg-amber-950/65 text-amber-50'
                    : 'border-rose-500 bg-rose-950/75 text-rose-50'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                      scanResult.tone === 'success'
                        ? 'bg-emerald-500/25 text-emerald-300'
                        : scanResult.tone === 'warn'
                          ? 'bg-amber-400/25 text-amber-300'
                          : 'bg-rose-500/25 text-rose-300'
                    }`}
                  >
                    {scanResult.tone === 'success' ? (
                      <CheckCircle2 className="w-7 h-7" />
                    ) : scanResult.tone === 'warn' ? (
                      <AlertTriangle className="w-7 h-7" />
                    ) : scanResult.status === 'invalid_wrong_qr' ? (
                      <ShieldAlert className="w-7 h-7" />
                    ) : (
                      <XCircle className="w-7 h-7" />
                    )}
                  </div>
                  <div className="space-y-1">
                    <span
                      className={`inline-block text-[11px] font-mono-num font-extrabold uppercase tracking-wider rtl:tracking-normal px-2.5 py-0.5 rounded ${
                        scanResult.tone === 'success'
                          ? 'bg-emerald-500 text-[#04140D]'
                          : scanResult.tone === 'warn'
                            ? 'bg-amber-400 text-[#1A1202]'
                            : 'bg-rose-500 text-white'
                      }`}
                    >
                      {scanResult.verdictBadge}
                    </span>
                    <h3 className="font-display font-bold text-base sm:text-lg leading-snug text-white">
                      {scanResult.headline}
                    </h3>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={resetScanForNext}
                  aria-label={t.scanNextBtn}
                  className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Detailed Reason Explanation */}
              <p className="text-xs sm:text-sm leading-relaxed text-white/90">
                {scanResult.reason}
              </p>

              {/* Ticket / Scanned Code Metadata Box */}
              {scanResult.booking ? (
                <div className="grid grid-cols-2 gap-2.5 pt-2.5 border-t border-white/15 text-xs">
                  <div>
                    <span className="text-white/60 block text-[11px]">{t.colCode}</span>
                    <span className="font-mono-num font-bold text-white" dir="ltr">
                      {scanResult.booking.bookingCode}
                    </span>
                  </div>
                  <div>
                    <span className="text-white/60 block text-[11px]">{t.colConcertTier}</span>
                    <span className="font-semibold text-white">
                      {scanResult.booking.quantity}x {getTierCopy(scanResult.booking.tier, lang).name}
                    </span>
                  </div>
                  <div>
                    <span className="text-white/60 block text-[11px]">{isAr ? 'المسحات' : 'Scans'}</span>
                    <span className="font-mono-num font-bold text-white">
                      {typeof scanResult.booking.scansUsed === 'number' ? scanResult.booking.scansUsed : (scanResult.booking.checkedIn ? scanResult.booking.quantity : 0)}/{scanResult.booking.quantity}
                    </span>
                  </div>
                  <div>
                    <span className="text-white/60 block text-[11px]">{t.colConcert}</span>
                    <span className="font-medium text-white">{scanResult.booking.concertTitle}</span>
                  </div>
                </div>
              ) : (
                scanResult.scannedCode && (
                  <div className="pt-2.5 border-t border-white/15 text-xs">
                    <span className="text-white/60 block text-[11px]">{t.scannedCodeLabel}</span>
                    <span className="font-mono-num text-white break-all" dir="ltr">
                      {scanResult.scannedCode}
                    </span>
                  </div>
                )
              )}

              {/* Action Row */}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {canConfirmPayments &&
                  scanResult.booking &&
                  scanResult.booking.paymentStatus === 'Pending' && (
                    <button
                      type="button"
                      disabled={busyCode === scanResult.booking.bookingCode}
                      onClick={() => void handleQuickApprove(scanResult.booking!)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-xs font-bold text-[#04140D] transition-colors"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      {t.confirmPayAndApprove}
                    </button>
                  )}
                <button
                  type="button"
                  onClick={resetScanForNext}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white/15 hover:bg-white/25 text-xs font-semibold text-white transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  {t.scanNextBtn}
                </button>
              </div>
            </div>
          )}

          {/* Manual Code & PNG Upload Card */}
          <div className="bg-[#101218] border border-white/10 rounded-xl p-5 space-y-4 flex-1 flex flex-col justify-center">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void verifyCode(manualCode, 'Manual Desk');
              }}
              className="space-y-2"
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
                  placeholder="GZ-XXXXXX"
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

            <div className="pt-2 border-t border-white/8 flex flex-wrap items-center gap-2.5">
              <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-white/12 bg-white/[0.04] hover:bg-white/[0.08] text-xs font-semibold text-white cursor-pointer w-full sm:w-auto justify-center">
                <ImageUp className="w-4 h-4 text-amber-300" />
                {t.scanTicketPng}
                <input type="file" accept="image/*" onChange={handleScanImageFile} className="sr-only" />
              </label>
            </div>
          </div>
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
                        <span className="font-modern-price font-semibold text-slate-200">{formatCurrencyEgp(b.totalEgp, lang)}</span>
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
                        ) : (() => {
                          const scans = typeof b.scansUsed === 'number' ? b.scansUsed : (b.checkedIn ? b.quantity : 0);
                          const maxScans = Math.max(1, b.quantity);
                          const allUsed = scans >= maxScans;
                          return (
                            <button
                              type="button"
                              disabled={busyCode === b.bookingCode}
                              onClick={() => void handleToggleCheckIn(b)}
                              className={`px-2.5 py-1.5 rounded-md font-semibold border ${
                                allUsed
                                  ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                                  : scans > 0
                                    ? 'bg-sky-500/20 border-sky-500/40 text-sky-300'
                                    : 'bg-white/[0.06] border-white/15 text-white hover:bg-white/[0.12]'
                              }`}
                            >
                              {allUsed
                                ? `${t.statusCheckedIn} (${scans}/${maxScans})`
                                : scans > 0
                                  ? `${isAr ? 'مسح' : 'Scan'} (${scans}/${maxScans})`
                                  : t.checkInBtn}
                            </button>
                          );
                        })()}

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
