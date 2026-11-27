import React, { useEffect, useMemo, useRef, useState } from 'react';
import jsQR from 'jsqr';
import {
  AlertTriangle,
  Camera,
  CameraOff,
  ImageUp,
  RotateCcw,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {
  adminConfirmAndCheckIn,
  adminConfirmPayment,
  adminDecrementCheckIn,
  adminDeleteBooking,
  adminScanCheckIn,
  adminUndoPayment,
} from '../../services/firestoreService';
import { formatFriendlyFirebaseError } from '../../firebase';
import type { AdminRole, Booking } from '../../types';
import {
  formatCheckInProgress,
  getBookingCheckedInCount,
  isBookingFullyCheckedIn,
  toAsciiDigits,
} from '../../utils/bookingLogic';
import {
  buildAlreadyUsedVerdict,
  buildGateScanSuccessVerdict,
  buildPaymentRevertedVerdict,
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
import { localizeKnownMessage } from '../../i18n/translations';
import { AdminCheckinVerdictCard } from './AdminCheckinVerdictCard';
import { AdminCheckinRoster, type RosterFilter } from './AdminCheckinRoster';

interface AdminCheckinProps {
  bookings: Booking[];
  adminName: string;
  adminRole: AdminRole;
  isVerifiedStaff: boolean;
  canConfirmPayments: boolean;
  canUndoPayments: boolean;
  canDeleteBookings: boolean;
  canViewRevenueAnalytics: boolean;
  onNotify: (msg: string) => void;
}

export const AdminCheckin: React.FC<AdminCheckinProps> = ({
  bookings,
  adminName,
  adminRole,
  isVerifiedStaff,
  canConfirmPayments,
  canUndoPayments,
  canDeleteBookings,
  canViewRevenueAnalytics,
  onNotify,
}) => {
  const actor = useMemo(() => ({ name: adminName, role: adminRole }), [adminName, adminRole]);
  const { lang, isAr, t } = useLanguage();
  const [manualCode, setManualCode] = useState('');
  const [scanResult, setScanResult] = useState<GateScanVerdict | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<CameraErrorInfo | null>(null);
  const [rosterSearch, setRosterSearch] = useState('');
  const [rosterFilter, setRosterFilter] = useState<RosterFilter>('all');
  const [confirmDeleteCode, setConfirmDeleteCode] = useState<string | null>(null);
  const [confirmUndoPayCode, setConfirmUndoPayCode] = useState<string | null>(null);
  const [busyCode, setBusyCode] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const cooldownTimerRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const cameraRequestIdRef = useRef(0);
  const verifyingRef = useRef(false);
  const lastScannedRef = useRef<string>('');
  const verifyCodeRef = useRef<(code: string, method: string) => Promise<void>>(async () => {});

  const stopCamera = () => {
    cameraRequestIdRef.current += 1;
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
    if (mountedRef.current) {
      setCameraActive(false);
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopCamera();
    };
  }, []);

  const resetScanForNext = () => {
    setScanResult(null);
    setManualCode('');
    setConfirmUndoPayCode(null);
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
      const scanRes = await adminScanCheckIn(found, adminName, method, actor);
      playGateTone('success', soundEnabled);
      const authoritativeVerdict = buildGateScanSuccessVerdict(found, scanRes.checkedInCount, {
        lang,
        checkedInAt: scanRes.checkedInAt,
      });
      setScanResult(authoritativeVerdict);
      const counterSuffix =
        scanRes.quantity > 1 ? ` ${formatCheckInProgress(scanRes.checkedInCount, scanRes.quantity)}` : '';
      onNotify(
        isAr
          ? `تم تسجيل دخول ${found.bookingCode}${counterSuffix}.`
          : `Checked in ${found.bookingCode}${counterSuffix}.`,
      );
    } catch (err) {
      playGateTone('error', soundEnabled);
      const rawMsg = err instanceof Error ? err.message : '';
      if (rawMsg.startsWith('ALREADY_CHECKED_IN|')) {
        const parts = rawMsg.split('|');
        const checkedAt = parts.length >= 5 ? parts[3] : parts[1];
        const byStaff = parts.length >= 5 ? parts[4] : parts[2];
        setScanResult(
          buildAlreadyUsedVerdict(found, {
            lang,
            checkedAt,
            approvedBy: byStaff,
            scannedOnOtherGate: true,
          }),
        );
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

  useEffect(() => {
    verifyCodeRef.current = verifyCode;
  });

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
    const requestId = ++cameraRequestIdRef.current;
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

    // If staff left the tab or stopped the camera while permission prompt was open, release tracks immediately
    if (!mountedRef.current || cameraRequestIdRef.current !== requestId) {
      stream?.getTracks().forEach((track) => track.stop());
      return;
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
              }, 2200);
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

        // 3. Fallback: isolate the official 3:1 ticket Digital QR Seal zone (x=0.684..0.810, y=0.214..0.654) with padding
        if (!decoded?.data && img.width > 120 && img.height > 80) {
          const sx = Math.floor(img.width * 0.63);
          const sy = Math.floor(img.height * 0.16);
          const sw = Math.min(img.width - sx, Math.ceil(img.width * 0.23));
          const sh = Math.min(img.height - sy, Math.ceil(img.height * 0.56));
          if (sw > 16 && sh > 16) {
            const scale = sw < 600 ? Math.min(3, Math.ceil(600 / sw)) : 1;
            canvas.width = sw * scale;
            canvas.height = sh * scale;
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
            const sealData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            decoded = jsQR(sealData.data, sealData.width, sealData.height, {
              inversionAttempts: 'attemptBoth',
            });
          }
        }

        // 4. Fallback: isolate lower-right ticket stub area for legacy or cropped screenshots
        if (!decoded?.data && img.width > 120 && img.height > 80) {
          const sx = Math.floor(img.width * 0.65);
          const sy = Math.floor(img.height * 0.3);
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
    const q = toAsciiDigits(rosterSearch).trim().toLowerCase();
    return bookings.filter((b) => {
      if (rosterFilter === 'unpaid' && b.paymentStatus !== 'Pending') return false;
      if (rosterFilter === 'pending' && (b.paymentStatus !== 'Paid' || isBookingFullyCheckedIn(b))) {
        return false;
      }
      if (rosterFilter === 'checked' && getBookingCheckedInCount(b) === 0) return false;
      if (rosterFilter === 'offline' && b.paymentMethod !== 'Offline') return false;
      if (q) {
        const hay = toAsciiDigits(
          `${b.bookingCode} ${b.customerName} ${b.customerMobile} ${b.concertTitle} ${b.transferRef}`,
        ).toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [bookings, rosterSearch, rosterFilter]);

  const handleConfirmPay = async (b: Booking) => {
    if (!canConfirmPayments || busyCode === b.bookingCode) return;
    setBusyCode(b.bookingCode);
    try {
      await adminConfirmPayment(b, adminName, 'Desk Confirm', actor);
      playGateTone('success', soundEnabled);
      const total = Math.max(1, Math.floor(b.quantity || 1));
      const scanned = getBookingCheckedInCount(b);
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
              admittedCount: scanned,
              totalQuantity: total,
              remainingEntries: Math.max(0, total - scanned),
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

  const handleUndoPay = async (b: Booking) => {
    if (!canUndoPayments || busyCode === b.bookingCode) return;
    const hadCheckIns = getBookingCheckedInCount(b) > 0;
    setBusyCode(b.bookingCode);
    try {
      const reverted = await adminUndoPayment(b, actor);
      setConfirmUndoPayCode(null);
      if (!reverted) {
        onNotify(
          isAr
            ? `الحجز ${b.bookingCode} بالفعل بانتظار مراجعة التحويل.`
            : `Booking ${b.bookingCode} is already pending verification.`,
        );
        return;
      }
      playGateTone('warn', soundEnabled);
      setScanResult((prev) =>
        prev?.booking?.bookingCode === b.bookingCode
          ? buildPaymentRevertedVerdict(b, lang)
          : prev,
      );
      onNotify(
        hadCheckIns
          ? isAr
            ? `تم التراجع عن الدفع وتسجيل الدخول للكود ${b.bookingCode} وإخفاء رمز الـ QR عن العميل مع الاحتفاظ بالحجز.`
            : `Undid payment & check-in for ${b.bookingCode}. Fan QR is now hidden while keeping their ticket.`
          : isAr
            ? `تم التراجع عن تأكيد الدفع للكود ${b.bookingCode} وإخفاء رمز الـ QR عن العميل مع الاحتفاظ بالحجز.`
            : `Payment confirmation undone for ${b.bookingCode}. Fan QR is now hidden while keeping their ticket.`,
      );
    } catch (err) {
      onNotify(localizeKnownMessage(formatFriendlyFirebaseError(err), lang));
    } finally {
      setBusyCode(null);
    }
  };

  const handleQuickApprove = async (b: Booking) => {
    if (!canConfirmPayments || busyCode === b.bookingCode) return;
    setBusyCode(b.bookingCode);
    try {
      const scanRes = await adminConfirmAndCheckIn(b, adminName, 'Gate Pay + Entry', actor);
      playGateTone('success', soundEnabled);
      setScanResult(
        buildGateScanSuccessVerdict(b, scanRes.checkedInCount, {
          lang,
          checkedInAt: scanRes.checkedInAt,
          paidAndAdmitted: true,
        }),
      );
      const counterSuffix =
        scanRes.quantity > 1 ? ` ${formatCheckInProgress(scanRes.checkedInCount, scanRes.quantity)}` : '';
      onNotify(
        isAr
          ? `تم تأكيد الدفع وتسجيل دخول ${b.bookingCode}${counterSuffix}.`
          : `Confirmed payment and admitted ${b.bookingCode}${counterSuffix}.`,
      );
    } catch (err) {
      onNotify(localizeKnownMessage(formatFriendlyFirebaseError(err), lang));
    } finally {
      setBusyCode(null);
    }
  };

  const handleRosterAdvanceOrUndo = async (b: Booking, direction: 'admit' | 'undo') => {
    if (b.paymentStatus !== 'Paid' || busyCode === b.bookingCode) return;
    setBusyCode(b.bookingCode);
    try {
      if (direction === 'admit') {
        const scanRes = await adminScanCheckIn(b, adminName, 'Roster Check-In', actor);
        playGateTone('success', soundEnabled);
        setScanResult((prev) =>
          prev?.booking?.bookingCode === b.bookingCode
            ? buildGateScanSuccessVerdict(b, scanRes.checkedInCount, {
                lang,
                checkedInAt: scanRes.checkedInAt,
              })
            : prev,
        );
        const counterSuffix =
          scanRes.quantity > 1 ? ` ${formatCheckInProgress(scanRes.checkedInCount, scanRes.quantity)}` : '';
        onNotify(
          isAr
            ? `تم تسجيل دخول ${b.bookingCode}${counterSuffix}.`
            : `Checked in ${b.bookingCode}${counterSuffix}.`,
        );
      } else {
        const undoRes = await adminDecrementCheckIn(b, adminName, 'Roster Undo', actor);
        const counterSuffix =
          undoRes.quantity > 1 ? ` ${formatCheckInProgress(undoRes.checkedInCount, undoRes.quantity)}` : '';
        setScanResult((prev) =>
          prev?.booking?.bookingCode === b.bookingCode
            ? {
                status: 'valid_ready',
                isValid: true,
                tone: 'warn',
                verdictBadge: isAr
                  ? `تم التراجع عن الدخول${counterSuffix}`
                  : `CHECK-IN REVERTED${counterSuffix}`,
                headline: `${b.customerName} (${b.bookingCode})`,
                reason:
                  undoRes.quantity > 1
                    ? isAr
                      ? `تم التراجع عن دخول واحد. العداد الحالي ${formatCheckInProgress(undoRes.checkedInCount, undoRes.quantity)} ويمكن مسح التذكرة مجدداً.`
                      : `Reverted 1 entry. Current scan count is ${formatCheckInProgress(undoRes.checkedInCount, undoRes.quantity)} and this pass can be scanned again.`
                    : isAr
                      ? 'تم التراجع عن تسجيل دخول هذه التذكرة ويمكن مسحها مجدداً.'
                      : 'Check-in status was reverted; this ticket can be scanned again.',
                scannedCode: b.bookingCode,
                booking: {
                  ...b,
                  checkedIn: false,
                  checkedInCount: undoRes.checkedInCount,
                  checkedInAt: undoRes.checkedInAt,
                },
                admittedCount: undoRes.checkedInCount,
                totalQuantity: undoRes.quantity,
                remainingEntries: Math.max(0, undoRes.quantity - undoRes.checkedInCount),
              }
            : prev,
        );
        onNotify(
          isAr
            ? `تم التراجع عن تسجيل دخول ${b.bookingCode}${counterSuffix}.`
            : `Reverted check-in for ${b.bookingCode}${counterSuffix}.`,
        );
      }
    } catch (err) {
      const rawMsg = err instanceof Error ? err.message : '';
      if (rawMsg.startsWith('ALREADY_CHECKED_IN|')) {
        playGateTone('error', soundEnabled);
        const total = Math.max(1, Math.floor(b.quantity || 1));
        const counterSuffix = total > 1 ? ` ${formatCheckInProgress(total, total)}` : '';
        onNotify(
          isAr
            ? `التذكرة ${b.bookingCode}${counterSuffix} تم استخدامها بالكامل على جهاز آخر.`
            : `Ticket ${b.bookingCode}${counterSuffix} was already fully checked in on another device.`,
        );
      } else {
        onNotify(localizeKnownMessage(formatFriendlyFirebaseError(err), lang));
      }
    } finally {
      setBusyCode(null);
    }
  };

  const handleDelete = async (b: Booking) => {
    if (!canDeleteBookings || busyCode === b.bookingCode) return;
    setBusyCode(b.bookingCode);
    try {
      await adminDeleteBooking(b, actor);
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
          {scanResult && (
            <AdminCheckinVerdictCard
              scanResult={scanResult}
              canConfirmPayments={canConfirmPayments}
              canUndoPayments={canUndoPayments}
              busyCode={busyCode}
              confirmUndoPayCode={confirmUndoPayCode}
              onQuickApprove={(b) => void handleQuickApprove(b)}
              onAdmitNext={(code) => void verifyCode(code, 'Gate Next Entry')}
              onRequestUndoPay={(code) => {
                setConfirmDeleteCode(null);
                setConfirmUndoPayCode(code);
              }}
              onCancelUndoPay={() => setConfirmUndoPayCode(null)}
              onConfirmUndoPay={(b) => void handleUndoPay(b)}
              onResetScan={resetScanForNext}
            />
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
      <AdminCheckinRoster
        filteredRoster={filteredRoster}
        rosterSearch={rosterSearch}
        rosterFilter={rosterFilter}
        canConfirmPayments={canConfirmPayments}
        canUndoPayments={canUndoPayments}
        canDeleteBookings={canDeleteBookings}
        canViewRevenueAnalytics={canViewRevenueAnalytics}
        busyCode={busyCode}
        confirmDeleteCode={confirmDeleteCode}
        confirmUndoPayCode={confirmUndoPayCode}
        onRosterSearchChange={setRosterSearch}
        onRosterFilterChange={setRosterFilter}
        onConfirmPay={(b) => void handleConfirmPay(b)}
        onAdvanceOrUndo={(b, dir) => void handleRosterAdvanceOrUndo(b, dir)}
        onRequestUndoPay={(code) => {
          setConfirmDeleteCode(null);
          setConfirmUndoPayCode(code);
        }}
        onCancelUndoPay={() => setConfirmUndoPayCode(null)}
        onConfirmUndoPay={(b) => void handleUndoPay(b)}
        onRequestDelete={(code) => {
          setConfirmUndoPayCode(null);
          setConfirmDeleteCode(code);
        }}
        onCancelDelete={() => setConfirmDeleteCode(null)}
        onConfirmDelete={(b) => void handleDelete(b)}
      />
    </div>
  );
};
