import { getPaymentMethodLabel, getTierCopy, type Language } from '../i18n/translations';
import type { Booking } from '../types';

export type GateScanStatus =
  | 'valid_ready'
  | 'valid_partial'
  | 'invalid_already_used'
  | 'invalid_unpaid'
  | 'invalid_wrong_qr'
  | 'invalid_not_found'
  | 'invalid_unreadable';

export interface GateScanVerdict {
  status: GateScanStatus;
  isValid: boolean;
  tone: 'success' | 'warn' | 'error';
  verdictBadge: string;
  headline: string;
  reason: string;
  scannedCode?: string;
  booking?: Booking;
}

const GENZ_TICKET_CODE_REGEX = /^(GZ|OFF)-[A-Z0-9_-]{3,28}$/i;

/**
 * Checks whether a scanned QR payload matches Gen Z Events ticket code format (e.g. GZ-XXXXXX or OFF-XXXX).
 * Foreign QR codes (URLs, Wi-Fi payloads, vCards, other organizers' codes, arbitrary text) return false.
 */
export function isGenZTicketCodeFormat(rawCode: string): boolean {
  const trimmed = rawCode.trim();
  if (!trimmed || /\s/.test(trimmed)) return false;
  return GENZ_TICKET_CODE_REGEX.test(trimmed);
}

/**
 * Truncates long foreign QR strings (e.g. URLs) safely for display in the gate verdict card.
 */
export function formatScannedCodePreview(rawCode: string, maxLen = 48): string {
  const cleaned = rawCode.trim().replace(/\s+/g, ' ');
  if (cleaned.length <= maxLen) return cleaned;
  return `${cleaned.slice(0, maxLen - 1)}…`;
}

/**
 * Evaluates a scanned QR or manually entered ticket code against the live bookings roster
 * and produces an unmistakable VALID / INVALID verdict with a clear human-readable reason.
 */
export function evaluateGateQrScan(
  rawCode: string,
  bookings: Booking[],
  options: { lang: Language; canConfirmPayments: boolean },
): GateScanVerdict {
  const isAr = options.lang === 'ar';
  const trimmed = rawCode.trim();
  const normalized = trimmed.toUpperCase();
  const preview = formatScannedCodePreview(trimmed);

  const found = bookings.find((b) => b.bookingCode.trim().toUpperCase() === normalized);

  if (!found) {
    if (!isGenZTicketCodeFormat(trimmed)) {
      return {
        status: 'invalid_wrong_qr',
        isValid: false,
        tone: 'error',
        verdictBadge: isAr ? 'غير صالح — QR خاطئ' : 'INVALID — WRONG QR',
        headline: isAr
          ? 'هذا الرمز ليس من تذاكر Gen Z Events'
          : 'Not a Gen Z Events Ticket QR',
        reason: isAr
          ? `الرمز الممسوح («${preview}») لا ينتمي لنظام تذاكرنا ولا يطابق صيغة تذاكر الحفل. يرجى التأكد من مسح تذكرة Gen Z Events الرسمية.`
          : `The scanned QR ("${preview}") does not belong to our ticket system. Please scan an official Gen Z Events pass.`,
        scannedCode: preview,
      };
    }

    return {
      status: 'invalid_not_found',
      isValid: false,
      tone: 'error',
      verdictBadge: isAr ? 'غير صالح — غير مسجل' : 'INVALID — NOT FOUND',
      headline: isAr
        ? 'كود التذكرة غير موجود في قاعدة بياناتنا'
        : 'Ticket Code Not Found in Our System',
      reason: isAr
        ? `الكود «${normalized}» غير مسجل ضمن تذاكرنا النشطة — قد تكون التذكرة مزورة أو ملغاة أو ليست من تذاكرنا أو تم إدخال الكود بشكل خاطئ.`
        : `Code "${normalized}" is not registered in our active ticket database — this pass may be counterfeit, cancelled, not from our tickets, or mistyped.`,
      scannedCode: normalized,
    };
  }

  // Multi-scan: a booking with quantity N can be scanned N times
  const scansUsed = typeof found.scansUsed === 'number' ? found.scansUsed : (found.checkedIn ? found.quantity : 0);
  const maxScans = Math.max(1, found.quantity);

  if (scansUsed >= maxScans) {
    const usedAt = found.checkedInAt || (isAr ? 'وقت سابق' : 'earlier');
    const byPart = found.approvedBy
      ? isAr
        ? ` بواسطة ${found.approvedBy}`
        : ` by ${found.approvedBy}`
      : '';
    return {
      status: 'invalid_already_used',
      isValid: false,
      tone: 'error',
      verdictBadge: isAr
        ? `غير صالح — تم استخدام جميع المسحات (${scansUsed}/${maxScans})`
        : `INVALID — ALL SCANS USED (${scansUsed}/${maxScans})`,
      headline: isAr
        ? 'تم استخدام جميع مسحات هذه التذكرة'
        : 'All Ticket Scans Already Used',
      reason: isAr
        ? `تذكرة ${found.customerName} (${found.bookingCode}) تم مسح جميع الـ ${maxScans} مسحات المتاحة. آخر مسح في ${usedAt}${byPart}. لا يمكن استخدام نفس الـ QR مرة أخرى.`
        : `${found.customerName}'s pass (${found.bookingCode}) has used all ${maxScans} available scans. Last scan at ${usedAt}${byPart}. This QR cannot be reused.`,
      scannedCode: found.bookingCode,
      booking: found,
    };
  }

  if (found.paymentStatus !== 'Paid') {
    const methodLabel = getPaymentMethodLabel(found.paymentMethod, options.lang);
    return {
      status: 'invalid_unpaid',
      isValid: false,
      tone: 'warn',
      verdictBadge: isAr ? 'غير صالح للدخول — غير مدفوعة' : 'INVALID — UNPAID',
      headline: isAr
        ? 'لم يتم تأكيد دفع هذه التذكرة بعد'
        : 'Payment Not Confirmed Yet',
      reason: options.canConfirmPayments
        ? isAr
          ? `تذكرة ${found.customerName} (${found.bookingCode}) حالتها «بانتظار التأكيد» (${methodLabel} · مرجع: ${found.transferRef}). يجب تأكيد الدفع بالأسفل قبل السماح بالدخول.`
          : `${found.customerName}'s reservation (${found.bookingCode}) is still UNPAID (${methodLabel} · Ref: ${found.transferRef}). Confirm payment below before admitting.`
        : isAr
          ? `تذكرة ${found.customerName} (${found.bookingCode}) حالتها «بانتظار التأكيد» (${methodLabel} · مرجع: ${found.transferRef}). لا يمكن الدخول إلا بعد تأكيد الدفع من المشرف العام.`
          : `${found.customerName}'s reservation (${found.bookingCode}) is still UNPAID (${methodLabel} · Ref: ${found.transferRef}). Entry requires Super Admin payment confirmation.`,
      scannedCode: found.bookingCode,
      booking: found,
    };
  }

  const tierLabel = getTierCopy(found.tier, options.lang).name;
  const nextScan = scansUsed + 1;
  const isLastScan = nextScan >= maxScans;
  return {
    status: isLastScan ? 'valid_ready' : 'valid_partial',
    isValid: true,
    tone: 'success',
    verdictBadge: isAr
      ? `تذكرة صالحة — دخول مسموح (${nextScan}/${maxScans})`
      : `VALID TICKET — ENTRY APPROVED (${nextScan}/${maxScans})`,
    headline: isAr
      ? `أهلاً ${found.customerName} — ${found.quantity}x ${tierLabel}`
      : `Welcome ${found.customerName} — ${found.quantity}x ${tierLabel}`,
    reason: isAr
      ? `تم التحقق من التذكرة وتسجيل الدخول بنجاح لحفل «${found.concertTitle}» (كود: ${found.bookingCode}). مسح ${nextScan} من ${maxScans}.`
      : `Pass verified and checked in for "${found.concertTitle}" (Code: ${found.bookingCode}). Scan ${nextScan} of ${maxScans}.`,
    scannedCode: found.bookingCode,
    booking: { ...found, checkedIn: isLastScan, scansUsed: nextScan },
  };
}

/**
 * Builds an explicit INVALID verdict when an uploaded image has no readable QR code.
 */
export function buildUnreadableQrVerdict(lang: Language, customReason?: string): GateScanVerdict {
  const isAr = lang === 'ar';
  return {
    status: 'invalid_unreadable',
    isValid: false,
    tone: 'error',
    verdictBadge: isAr ? 'غير صالح — تعذر قراءة الـ QR' : 'INVALID — NO QR DETECTED',
    headline: isAr ? 'لم يتم اكتشاف رمز QR صالح في الصورة' : 'No Valid QR Code Detected',
    reason:
      customReason ||
      (isAr
        ? 'لم يتم العثور على رمز QR واضح في الصورة المرفوعة. تأكد من وضوح التذكرة أو أدخل الكود يدوياً.'
        : 'Could not read a QR code from the uploaded image. Ensure the ticket QR is clear or enter the booking code manually.'),
  };
}

/**
 * Progressive camera stream constraint fallbacks for Samsung Internet, Android Chrome, iOS Safari, and desktop webcams.
 */
export function getCameraConstraintFallbacks(): MediaStreamConstraints[] {
  return [
    {
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    },
    {
      video: { facingMode: 'environment' },
      audio: false,
    },
    {
      video: true,
      audio: false,
    },
  ];
}

export interface CameraErrorInfo {
  title: string;
  detail: string;
  canRetry: boolean;
}

/**
 * Classifies camera access errors accurately across Samsung Browser, Safari, Chrome, and preview iframes.
 */
export function classifyCameraError(
  err: unknown,
  options: { lang: Language; isEmbedded: boolean; isSecureContext: boolean },
): CameraErrorInfo {
  const isAr = options.lang === 'ar';
  const name =
    err && typeof err === 'object' && 'name' in err
      ? String((err as { name?: unknown }).name || '')
      : '';

  if (!options.isSecureContext || name === 'SecurityError') {
    return {
      title: isAr ? 'الكاميرا المباشرة تتطلب اتصال HTTPS آمن' : 'Live Camera Requires HTTPS',
      detail: isAr
        ? 'افتح الموقع عبر رابط HTTPS الآمن، أو استخدم «التقاط QR بالكاميرا» بالأسفل.'
        : 'Open the site over HTTPS to use the live viewfinder, or tap "Snap QR with Camera" below.',
      canRetry: false,
    };
  }

  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return {
      title: isAr ? 'لم يتم العثور على كاميرا' : 'No Camera Detected',
      detail: isAr
        ? 'لا توجد كاميرا متاحة على هذا الجهاز. يمكنك استخدام رفع صورة التذكرة PNG أو إدخال الكود يدوياً.'
        : 'No camera was found on this device. Use Scan Ticket PNG or enter the booking code manually.',
      canRetry: true,
    };
  }

  if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') {
    return {
      title: isAr ? 'الكاميرا مستخدمة في تطبيق آخر' : 'Camera Is Busy',
      detail: isAr
        ? 'أغلق أي تطبيق أو تبويب آخر يستخدم الكاميرا ثم اضغط «إعادة محاولة الكاميرا»، أو استخدم «التقاط QR بالكاميرا».'
        : 'Close other apps or browser tabs using the camera and tap Retry, or use "Snap QR with Camera" below.',
      canRetry: true,
    };
  }

  if (options.isEmbedded) {
    return {
      title: isAr ? 'إطار المعاينة يمنع الكاميرا المباشرة' : 'Embedded Frame Blocked Live Camera',
      detail: isAr
        ? 'افتح الموقع في نافذة متصفح مباشرة لتشغيل المسح الفوري، أو استخدم «التقاط QR بالكاميرا» بالأسفل مباشرةً.'
        : 'Open the site directly in your browser tab for live video scanning, or use "Snap QR with Camera" right below.',
      canRetry: true,
    };
  }

  return {
    title: isAr ? 'صلاحية الكاميرا مرفوضة في المتصفح' : 'Camera Permission Is Blocked in Browser',
    detail: isAr
      ? 'اضغط على أيقونة القفل بجانب رابط الموقع ← الأذونات ← اسمح بالكاميرا، ثم اضغط «إعادة محاولة الكاميرا» — أو استخدم «التقاط QR بالكاميرا» فوراً.'
      : 'Tap the lock icon in your browser address bar → Permissions → Allow Camera, then tap Retry — or use "Snap QR with Camera" right now.',
    canRetry: true,
  };
}

/**
 * Downscales high-resolution mobile camera photos (e.g. 12MP-50MP Samsung photos) to an optimal size for fast, reliable jsQR decoding.
 */
export function computeDecodedImageDimensions(
  width: number,
  height: number,
  maxDim = 1400,
): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: 1, height: 1 };
  const largest = Math.max(width, height);
  if (largest <= maxDim) {
    return { width: Math.round(width), height: Math.round(height) };
  }
  const scale = maxDim / largest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}
