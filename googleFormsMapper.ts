import type { Booking, Concert, PaymentStatus, TierId } from '../types';
import {
  getTierUnitPrice,
  MAX_OFFLINE_QTY_PER_ROW,
  normalizeOfflineMobile,
  normalizeTierValue,
  OFFLINE_USER_ID,
  toAsciiDigits,
} from './bookingLogic';

export const DEFAULT_OFFLINE_FORM_ID = '1OtJ6LBGrLoY2MlVJk6cM38wlN9xS30JPV93qcY5vtJg';
export const DEFAULT_OFFLINE_FORM_EDIT_URL = `https://docs.google.com/forms/d/${DEFAULT_OFFLINE_FORM_ID}/edit`;
export const DEFAULT_OFFLINE_FORM_PUBLIC_URL =
  'https://docs.google.com/forms/d/e/1FAIpQLSddUvFNZYXo8PKsQ4GqmO_gChZJwhTvZSuHy4hk5fn23GWYUw/viewform';

export interface GoogleFormQuestion {
  questionId: string;
  title: string;
  description: string;
  kind: 'text' | 'choice' | 'other';
  options: string[];
}

export interface GoogleFormSchema {
  formId: string;
  title: string;
  description: string;
  responderUri: string;
  questions: GoogleFormQuestion[];
}

export interface GoogleFormAnswerValue {
  questionId?: string;
  textAnswers?: {
    answers?: Array<{ value?: string }>;
  };
}

export interface GoogleFormRawResponse {
  responseId: string;
  createTime?: string;
  lastSubmittedTime?: string;
  respondentEmail?: string;
  answers?: Record<string, GoogleFormAnswerValue>;
}

export interface GoogleFormFieldMapping {
  customerNameQuestionId: string;
  mobileQuestionId: string;
  tierQuestionId: string;
  outletQuestionId: string;
  otherOutletQuestionId: string;
  emailQuestionId: string;
  quantityQuestionId: string;
  totalAmountQuestionId: string;
  bookingCodeQuestionId: string;
}

export interface GoogleFormMappedRow {
  rowIndex: number;
  responseId: string;
  submittedAt: string;
  bookingCode: string;
  status: 'new' | 'already_synced' | 'skipped';
  booking?: Omit<Booking, 'createdAt' | 'updatedAt'>;
  skipReason?: string;
  rawName: string;
  rawMobile: string;
  rawTier: string;
  resolvedTier?: TierId;
  rawOutlet: string;
  resolvedOutlet: string;
}

export interface GoogleFormSyncResult {
  newBookings: Omit<Booking, 'createdAt' | 'updatedAt'>[];
  rows: GoogleFormMappedRow[];
  alreadySyncedCount: number;
  skippedRows: GoogleFormMappedRow[];
  totalResponses: number;
  newTicketsCount: number;
  newPaidTicketsCount: number;
  newRevenueEgp: number;
}

const RESPONDER_URL_REGEX = /docs\.google\.com\/forms\/d\/e\/([a-zA-Z0-9_-]+)/i;
const EDIT_FORM_URL_REGEX = /docs\.google\.com\/forms\/d\/([a-zA-Z0-9_-]{10,})/i;
const RAW_FORM_ID_REGEX = /^[a-zA-Z0-9_-]{15,120}$/;

/**
 * Extracts a Google Form ID from an edit/viewform URL or raw ID string.
 * Published responder URLs (/forms/d/e/1FAIpQL...) cannot be passed to the Forms API v1 directly,
 * so we flag them explicitly with `isResponderUrl: true`.
 */
export function extractGoogleFormId(rawInput: string): {
  formId: string | null;
  isResponderUrl: boolean;
} {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return { formId: null, isResponderUrl: false };
  }
  if (RESPONDER_URL_REGEX.test(trimmed)) {
    return { formId: null, isResponderUrl: true };
  }
  const urlMatch = trimmed.match(EDIT_FORM_URL_REGEX);
  if (urlMatch?.[1] && urlMatch[1].toLowerCase() !== 'e') {
    return { formId: urlMatch[1], isResponderUrl: false };
  }
  if (RAW_FORM_ID_REGEX.test(trimmed) && !trimmed.startsWith('1FAIpQL')) {
    return { formId: trimmed, isResponderUrl: false };
  }
  if (trimmed.startsWith('1FAIpQL')) {
    return { formId: null, isResponderUrl: true };
  }
  return { formId: null, isResponderUrl: false };
}

/**
 * Parses the Google Forms REST API v1 Form resource payload into a flat list of questions.
 */
export function parseGoogleFormSchemaPayload(payload: unknown): GoogleFormSchema {
  const raw = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>;
  const info = (raw.info && typeof raw.info === 'object' ? raw.info : {}) as Record<string, unknown>;
  const items = Array.isArray(raw.items) ? raw.items : [];
  const questions: GoogleFormQuestion[] = [];

  for (const rawItem of items) {
    if (!rawItem || typeof rawItem !== 'object') continue;
    const item = rawItem as Record<string, unknown>;
    const itemTitle = typeof item.title === 'string' ? item.title.trim() : '';
    const itemDescription = typeof item.description === 'string' ? item.description.trim() : '';

    if (item.questionItem && typeof item.questionItem === 'object') {
      const qItem = item.questionItem as Record<string, unknown>;
      const q = (qItem.question && typeof qItem.question === 'object'
        ? qItem.question
        : null) as Record<string, unknown> | null;
      const questionId = typeof q?.questionId === 'string' ? q.questionId.trim() : '';
      if (!questionId) continue;

      let kind: GoogleFormQuestion['kind'] = 'other';
      const options: string[] = [];
      if (q?.textQuestion) {
        kind = 'text';
      } else if (q?.choiceQuestion && typeof q.choiceQuestion === 'object') {
        kind = 'choice';
        const cq = q.choiceQuestion as Record<string, unknown>;
        if (Array.isArray(cq.options)) {
          for (const opt of cq.options) {
            if (opt && typeof opt === 'object' && typeof (opt as Record<string, unknown>).value === 'string') {
              options.push(((opt as Record<string, unknown>).value as string).trim());
            }
          }
        }
      }

      questions.push({
        questionId,
        title: itemTitle || questionId,
        description: itemDescription,
        kind,
        options,
      });
    } else if (item.questionGroupItem && typeof item.questionGroupItem === 'object') {
      const grp = item.questionGroupItem as Record<string, unknown>;
      const subQuestions = Array.isArray(grp.questions) ? grp.questions : [];
      for (const rawSub of subQuestions) {
        if (!rawSub || typeof rawSub !== 'object') continue;
        const sub = rawSub as Record<string, unknown>;
        const questionId = typeof sub.questionId === 'string' ? sub.questionId.trim() : '';
        if (!questionId) continue;
        const rowQ = (sub.rowQuestion && typeof sub.rowQuestion === 'object'
          ? sub.rowQuestion
          : {}) as Record<string, unknown>;
        const rowTitle = typeof rowQ.title === 'string' ? rowQ.title.trim() : '';
        questions.push({
          questionId,
          title: rowTitle ? `${itemTitle} — ${rowTitle}` : itemTitle || questionId,
          description: itemDescription,
          kind: 'other',
          options: [],
        });
      }
    }
  }

  return {
    formId: typeof raw.formId === 'string' ? raw.formId : '',
    title: typeof info.title === 'string' && info.title.trim() ? info.title.trim() : 'Google Form',
    description: typeof info.description === 'string' ? info.description.trim() : '',
    responderUri: typeof raw.responderUri === 'string' ? raw.responderUri.trim() : '',
    questions,
  };
}

function normalizeLabel(text: string): string {
  return text
    .toLowerCase()
    .replace(/["'“”«»()\[\]—–\-_.:/\\]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isOtherOutletFollowupTitle(normalizedTitle: string): boolean {
  const hasOther =
    normalizedTitle.includes('أخرى') ||
    normalizedTitle.includes('اخري') ||
    normalizedTitle.includes('أخري') ||
    normalizedTitle.includes('اخرى') ||
    normalizedTitle.includes('other') ||
    normalizedTitle.includes('specify');
  const hasOutletCue =
    normalizedTitle.includes('مركز') ||
    normalizedTitle.includes('منفذ') ||
    normalizedTitle.includes('بيع') ||
    normalizedTitle.includes('outlet') ||
    normalizedTitle.includes('branch') ||
    normalizedTitle.includes('ذكر');
  return hasOther && hasOutletCue;
}

/**
 * Automatically maps Google Form questions to Gen Z Events offline booking fields
 * with high precision across Arabic & English headers and choice options.
 */
export function autoMapFormQuestions(questions: GoogleFormQuestion[]): GoogleFormFieldMapping {
  const mapping: GoogleFormFieldMapping = {
    customerNameQuestionId: '',
    mobileQuestionId: '',
    tierQuestionId: '',
    outletQuestionId: '',
    otherOutletQuestionId: '',
    emailQuestionId: '',
    quantityQuestionId: '',
    totalAmountQuestionId: '',
    bookingCodeQuestionId: '',
  };

  const usedIds = new Set<string>();

  const claim = (predicate: (q: GoogleFormQuestion, norm: string) => boolean): string => {
    for (const q of questions) {
      if (usedIds.has(q.questionId)) continue;
      const norm = normalizeLabel(q.title);
      if (predicate(q, norm)) {
        usedIds.add(q.questionId);
        return q.questionId;
      }
    }
    return '';
  };

  // 1. Conditional "Other" sales outlet follow-up first so it doesn't collide with primary outlet
  mapping.otherOutletQuestionId = claim((_q, norm) => isOtherOutletFollowupTitle(norm));

  // 2. Primary sales outlet / POS
  mapping.outletQuestionId = claim(
    (_q, norm) =>
      norm.includes('مركز البيع') ||
      norm.includes('منفذ') ||
      norm.includes('مكتب البيع') ||
      norm.includes('نقطة البيع') ||
      norm.includes('outlet') ||
      norm.includes('branch') ||
      norm.includes('booth') ||
      norm.includes('pos') ||
      norm.includes('seller'),
  );

  // 3. Ticket tier (by title OR by dropdown options matching Silver / Gold / Fan Pit / VIP / Lounge)
  mapping.tierQuestionId = claim((q, norm) => {
    if (
      norm.includes('فئة التذكرة') ||
      norm.includes('فئه التذكره') ||
      norm.includes('الفئة') ||
      norm.includes('الفئه') ||
      norm.includes('نوع التذكرة') ||
      norm.includes('tier') ||
      norm.includes('category') ||
      norm.includes('pass')
    ) {
      return true;
    }
    if (q.options.length >= 2) {
      const matchedOptions = q.options.filter((opt) => normalizeTierValue(opt) !== null);
      if (matchedOptions.length >= 2) return true;
    }
    return false;
  });

  // 4. WhatsApp / Mobile number
  mapping.mobileQuestionId = claim(
    (_q, norm) =>
      norm.includes('واتساب') ||
      norm.includes('واتس اب') ||
      norm.includes('whatsapp') ||
      norm.includes('موبايل') ||
      norm.includes('هاتف') ||
      norm.includes('تليفون') ||
      norm.includes('رقم التواصل') ||
      norm.includes('mobile') ||
      norm.includes('phone') ||
      norm.includes('tel'),
  );

  // 5. Customer full name
  mapping.customerNameQuestionId = claim(
    (_q, norm) =>
      norm === 'الاسم' ||
      norm.includes('الاسم') ||
      norm.includes('اسم العميل') ||
      norm.includes('اسم المشتري') ||
      norm.includes('full name') ||
      norm.includes('customer name') ||
      norm.includes('buyer name') ||
      norm === 'name' ||
      norm.includes('attendee') ||
      norm.includes('guest'),
  );

  // 6. Optional Email
  mapping.emailQuestionId = claim(
    (_q, norm) =>
      norm.includes('بريد') ||
      norm.includes('ايميل') ||
      norm.includes('إيميل') ||
      norm.includes('email') ||
      norm.includes('e mail'),
  );

  // 7. Optional Quantity
  mapping.quantityQuestionId = claim(
    (_q, norm) =>
      norm.includes('عدد التذاكر') ||
      norm.includes('العدد') ||
      norm.includes('الكمية') ||
      norm.includes('quantity') ||
      norm.includes('qty') ||
      norm.includes('tickets') ||
      norm.includes('count'),
  );

  // 8. Optional Custom Total EGP
  mapping.totalAmountQuestionId = claim(
    (_q, norm) =>
      norm.includes('المبلغ') ||
      norm.includes('الاجمالي') ||
      norm.includes('الإجمالي') ||
      norm.includes('السعر') ||
      norm.includes('total') ||
      norm.includes('amount') ||
      norm.includes('price') ||
      norm.includes('paid'),
  );

  // 9. Optional Booking Code
  mapping.bookingCodeQuestionId = claim(
    (_q, norm) =>
      norm.includes('كود التذكرة') ||
      norm.includes('كود الحجز') ||
      norm.includes('booking code') ||
      norm.includes('ticket code') ||
      norm.includes('ticket id'),
  );

  return mapping;
}

/**
 * Generates a deterministic, collision-resistant Gen Z Events offline booking code
 * from a Google Form responseId so repeated syncs never duplicate records.
 * Format: OFF-GF<10 uppercase base36 chars> (length 16, matches Firestore rules & gate QR regex).
 */
export function buildDeterministicFormBookingCode(responseId: string): string {
  const input = responseId.trim() || 'EMPTY';
  // Dual independent 32-bit FNV-1a hashes for ~64 bits of entropy
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < input.length; i += 1) {
    const c = input.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 ^= (c + i * 31) & 0xffff;
    h2 = Math.imul(h2, 0x85ebca6b) >>> 0;
  }
  // Avalanche mix
  h1 ^= h1 >>> 16;
  h1 = Math.imul(h1, 0x7feb352d) >>> 0;
  h2 ^= h2 >>> 15;
  h2 = Math.imul(h2, 0x846ca68b) >>> 0;

  const part1 = h1.toString(36).toUpperCase().padStart(5, '0').slice(-5);
  const part2 = h2.toString(36).toUpperCase().padStart(5, '0').slice(-5);
  return `OFF-GF${part1}${part2}`;
}

function getAnswerText(response: GoogleFormRawResponse, questionId: string): string {
  if (!questionId || !response.answers) return '';
  const entry = response.answers[questionId];
  const answers = entry?.textAnswers?.answers;
  if (!Array.isArray(answers) || answers.length === 0) return '';
  return answers
    .map((a) => (typeof a?.value === 'string' ? a.value.trim() : ''))
    .filter(Boolean)
    .join(', ')
    .trim();
}

/**
 * Resolves the sales outlet / transferRef combining primary choice ("مركز البيع")
 * with conditional "Other" specification ("في حالة اختيار أخرى — يرجى ذكر مركز البيع").
 * Always guarantees a Firestore-valid length of 3..80 characters.
 */
export function resolveFormOutletRef(primaryOutlet: string, otherOutlet: string): string {
  const cleanPrimary = primaryOutlet.replace(/\s+/g, ' ').trim();
  const cleanOther = otherOutlet.replace(/\s+/g, ' ').trim();
  const normPrimary = normalizeLabel(cleanPrimary);

  const selectedOther =
    normPrimary.includes('أخرى') ||
    normPrimary.includes('اخري') ||
    normPrimary.includes('أخري') ||
    normPrimary.includes('اخرى') ||
    normPrimary.includes('other');

  let candidate = '';
  if (selectedOther) {
    candidate = cleanOther || 'أخرى — Google Form';
  } else if (cleanPrimary) {
    candidate = cleanPrimary;
  } else if (cleanOther) {
    candidate = cleanOther;
  } else {
    candidate = 'Google Form Outlet';
  }

  if (candidate.length < 3) {
    candidate = `منفذ: ${candidate}`;
  }
  return candidate.slice(0, 80);
}

export interface MapFormResponsesOptions {
  responses: GoogleFormRawResponse[];
  mapping: GoogleFormFieldMapping;
  concert: Concert;
  adminName: string;
  existingCodes: Iterable<string>;
  defaultPaymentStatus?: PaymentStatus;
  lang?: 'en' | 'ar';
}

/**
 * Maps raw Google Form API responses into validated, deduplicated offline Booking payloads.
 */
export function mapGoogleFormResponsesToBookings(
  options: MapFormResponsesOptions,
): GoogleFormSyncResult {
  const {
    responses,
    mapping,
    concert,
    adminName,
    existingCodes,
    defaultPaymentStatus = 'Paid',
    lang = 'en',
  } = options;
  const isAr = lang === 'ar';

  const existingSet = new Set<string>(Array.from(existingCodes, (c) => c.trim().toUpperCase()));
  const batchUsedCodes = new Set<string>();

  const rows: GoogleFormMappedRow[] = [];
  const newBookings: Omit<Booking, 'createdAt' | 'updatedAt'>[] = [];
  const skippedRows: GoogleFormMappedRow[] = [];
  let alreadySyncedCount = 0;
  let newTicketsCount = 0;
  let newPaidTicketsCount = 0;
  let newRevenueEgp = 0;

  // Sort responses newest-first by submission time for clear review
  const sortedResponses = [...responses].sort((a, b) => {
    const ta = Date.parse(a.lastSubmittedTime || a.createTime || '') || 0;
    const tb = Date.parse(b.lastSubmittedTime || b.createTime || '') || 0;
    return tb - ta;
  });

  sortedResponses.forEach((response, idx) => {
    const rowIndex = idx + 1;
    const responseId = (response.responseId || `row-${rowIndex}`).trim();
    const submittedAt = response.lastSubmittedTime || response.createTime || '';

    const rawName = getAnswerText(response, mapping.customerNameQuestionId);
    const rawMobile = getAnswerText(response, mapping.mobileQuestionId);
    const rawTier = getAnswerText(response, mapping.tierQuestionId);
    const rawOutlet = getAnswerText(response, mapping.outletQuestionId);
    const rawOtherOutlet = getAnswerText(response, mapping.otherOutletQuestionId);
    const rawEmail =
      getAnswerText(response, mapping.emailQuestionId) || (response.respondentEmail || '').trim();
    const rawQty = getAnswerText(response, mapping.quantityQuestionId);
    const rawAmount = getAnswerText(response, mapping.totalAmountQuestionId);
    const rawCode = getAnswerText(response, mapping.bookingCodeQuestionId);

    const resolvedOutlet = resolveFormOutletRef(rawOutlet, rawOtherOutlet);

    // Determine deterministic booking code (either explicit valid code column or deterministic hash of responseId)
    const explicitCleanedCode = rawCode
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_-]/g, '')
      .slice(0, 32);
    const bookingCode =
      explicitCleanedCode.length >= 5
        ? explicitCleanedCode
        : buildDeterministicFormBookingCode(responseId);

    const resolvedTier = normalizeTierValue(rawTier || '') || undefined;

    if (existingSet.has(bookingCode) || batchUsedCodes.has(bookingCode)) {
      alreadySyncedCount += 1;
      rows.push({
        rowIndex,
        responseId,
        submittedAt,
        bookingCode,
        status: 'already_synced',
        rawName,
        rawMobile,
        rawTier,
        resolvedTier,
        rawOutlet,
        resolvedOutlet,
      });
      return;
    }

    const cleanName = rawName.replace(/\s+/g, ' ').trim().slice(0, 100);
    if (cleanName.length < 2) {
      const skipped: GoogleFormMappedRow = {
        rowIndex,
        responseId,
        submittedAt,
        bookingCode,
        status: 'skipped',
        skipReason: isAr
          ? 'الاسم مفقود أو أقل من حرفين.'
          : 'Missing or invalid customer name (at least 2 characters).',
        rawName,
        rawMobile,
        rawTier,
        resolvedTier,
        rawOutlet,
        resolvedOutlet,
      };
      rows.push(skipped);
      skippedRows.push(skipped);
      return;
    }

    const cleanMobile = normalizeOfflineMobile(rawMobile);
    if (cleanMobile.length < 6) {
      const skipped: GoogleFormMappedRow = {
        rowIndex,
        responseId,
        submittedAt,
        bookingCode,
        status: 'skipped',
        skipReason: isAr
          ? `رقم الواتساب/الموبايل غير صالح للعميل «${cleanName}» (٦ أرقام على الأقل).`
          : `Missing or invalid WhatsApp/mobile number for "${cleanName}" (need at least 6 digits).`,
        rawName,
        rawMobile,
        rawTier,
        resolvedTier,
        rawOutlet,
        resolvedOutlet,
      };
      rows.push(skipped);
      skippedRows.push(skipped);
      return;
    }

    const tier = normalizeTierValue(rawTier || (mapping.tierQuestionId ? '' : 'Silver'));
    if (!tier) {
      const skipped: GoogleFormMappedRow = {
        rowIndex,
        responseId,
        submittedAt,
        bookingCode,
        status: 'skipped',
        skipReason: isAr
          ? `فئة التذكرة غير معروفة («${rawTier || 'فارغ'}») للعميل «${cleanName}».`
          : `Unknown ticket tier ("${rawTier || 'empty'}") for "${cleanName}". Expected Silver, Gold, Fan Pit/VIP, or Lounge.`,
        rawName,
        rawMobile,
        rawTier,
        resolvedTier,
        rawOutlet,
        resolvedOutlet,
      };
      rows.push(skipped);
      skippedRows.push(skipped);
      return;
    }

    let qtyNum = 1;
    if (rawQty) {
      const asciiQty = toAsciiDigits(rawQty).replace(/,/g, '').trim();
      const parsedQty = Number(asciiQty);
      if (!Number.isInteger(parsedQty) || parsedQty < 1 || parsedQty > MAX_OFFLINE_QTY_PER_ROW) {
        const skipped: GoogleFormMappedRow = {
          rowIndex,
          responseId,
          submittedAt,
          bookingCode,
          status: 'skipped',
          skipReason: isAr
            ? `العدد غير صالح («${rawQty}») للعميل «${cleanName}».`
            : `Invalid ticket quantity ("${rawQty}") for "${cleanName}".`,
          rawName,
          rawMobile,
          rawTier,
          resolvedTier: tier,
          rawOutlet,
          resolvedOutlet,
        };
        rows.push(skipped);
        skippedRows.push(skipped);
        return;
      }
      qtyNum = parsedQty;
    }

    const unitPrice = getTierUnitPrice(concert, tier);
    const expectedSubtotal = unitPrice * qtyNum;
    let totalEgp = expectedSubtotal;
    let discountEgp = 0;

    if (rawAmount) {
      const asciiAmt = toAsciiDigits(rawAmount).replace(/[^0-9.\-]/g, '');
      const parsedAmt = Number(asciiAmt);
      if (
        asciiAmt === '' ||
        !/^-?\d+(?:\.\d+)?$/.test(asciiAmt) ||
        !Number.isFinite(parsedAmt) ||
        parsedAmt < 0 ||
        parsedAmt > 50000000
      ) {
        const skipped: GoogleFormMappedRow = {
          rowIndex,
          responseId,
          submittedAt,
          bookingCode,
          status: 'skipped',
          skipReason: isAr
            ? `المبلغ غير صالح («${rawAmount}») للعميل «${cleanName}».`
            : `Invalid total amount ("${rawAmount}") for "${cleanName}".`,
          rawName,
          rawMobile,
          rawTier,
          resolvedTier: tier,
          rawOutlet,
          resolvedOutlet,
        };
        rows.push(skipped);
        skippedRows.push(skipped);
        return;
      }
      totalEgp = Math.round(parsedAmt);
      discountEgp = Math.max(0, expectedSubtotal - totalEgp);
    }

    batchUsedCodes.add(bookingCode);

    const booking: Omit<Booking, 'createdAt' | 'updatedAt'> = {
      bookingCode,
      userId: OFFLINE_USER_ID,
      concertId: concert.id,
      concertTitle: concert.title.slice(0, 120),
      concertDate: concert.date.slice(0, 40),
      concertTime: concert.time.slice(0, 20),
      concertVenue: concert.venue.slice(0, 140),
      tier,
      quantity: qtyNum,
      unitPrice,
      promoCode: '',
      discountEgp,
      totalEgp,
      paymentMethod: 'Offline',
      transferRef: resolvedOutlet,
      paymentStatus: defaultPaymentStatus,
      checkedIn: false,
      checkedInAt: '',
      scansUsed: 0,
      approvedBy: adminName.trim().slice(0, 100) || 'Admin',
      approvalMethod: 'Google Form',
      customerName: cleanName,
      customerMobile: cleanMobile,
      customerEmail: rawEmail.trim().toLowerCase().slice(0, 120),
    };

    newBookings.push(booking);
    newTicketsCount += qtyNum;
    if (defaultPaymentStatus === 'Paid') {
      newPaidTicketsCount += qtyNum;
      newRevenueEgp += totalEgp;
    }

    rows.push({
      rowIndex,
      responseId,
      submittedAt,
      bookingCode,
      status: 'new',
      booking,
      rawName: cleanName,
      rawMobile: cleanMobile,
      rawTier,
      resolvedTier: tier,
      rawOutlet,
      resolvedOutlet,
    });
  });

  return {
    newBookings,
    rows,
    alreadySyncedCount,
    skippedRows,
    totalResponses: responses.length,
    newTicketsCount,
    newPaidTicketsCount,
    newRevenueEgp,
  };
}
