import test from 'node:test';
import assert from 'node:assert/strict';
import type { Concert } from '../types';
import { isGenZTicketCodeFormat } from './gateScanLogic';
import {
  autoMapFormQuestions,
  buildDeterministicFormBookingCode,
  DEFAULT_OFFLINE_FORM_EDIT_URL,
  DEFAULT_OFFLINE_FORM_ID,
  DEFAULT_OFFLINE_FORM_PUBLIC_URL,
  extractGoogleFormId,
  mapGoogleFormResponsesToBookings,
  parseGoogleFormSchemaPayload,
  resolveFormOutletRef,
  type GoogleFormRawResponse,
} from './googleFormsMapper';

const SAMPLE_CONCERT: Concert = {
  id: 'houda-bondoq-qena-2026',
  title: 'Houda Bondoq Live in Qena',
  artist: 'Houda Bondoq',
  venue: 'Qena Sports Stadium',
  isoDate: '2026-12-10',
  isoTime: '20:00',
  date: 'Dec 10, 2026',
  time: '8:00 PM',
  doors: '6:30 PM',
  genre: 'Shaabi / Festival',
  priceEgp: 400,
  tierPrices: {
    Silver: 400,
    Gold: 600,
    VIP: 800,
    Lounge: 2500,
  },
  totalSeats: 2000,
  seatsLeft: 1800,
  description: 'Live concert in Qena',
  posterUrl: '',
};

// Mirrors the exact live schema of form 1OtJ6LBGrLoY2MlVJk6cM38wlN9xS30JPV93qcY5vtJg
const REAL_GENZ_FORM_API_PAYLOAD = {
  formId: DEFAULT_OFFLINE_FORM_ID,
  info: {
    title: 'GEN Z EVENTS',
    description: 'استعدوا لأقوى حفلة وأجمد يوم مع نجم الجيل حوده 🔥 بندق',
  },
  responderUri: DEFAULT_OFFLINE_FORM_PUBLIC_URL,
  items: [
    {
      itemId: 'item-1',
      title: 'الاسم',
      questionItem: {
        question: { questionId: 'q_name', textQuestion: {} },
      },
    },
    {
      itemId: 'item-2',
      title: 'رقم الواتساب للتواصل',
      questionItem: {
        question: { questionId: 'q_whatsapp', textQuestion: {} },
      },
    },
    {
      itemId: 'item-3',
      title: 'فئة التذكرة',
      questionItem: {
        question: {
          questionId: 'q_tier',
          choiceQuestion: {
            type: 'DROP_DOWN',
            options: [
              { value: 'Lounge' },
              { value: 'Fan Pit' },
              { value: 'Gold' },
              { value: 'Silver' },
            ],
          },
        },
      },
    },
    {
      itemId: 'item-4',
      title: 'مركز البيع',
      questionItem: {
        question: {
          questionId: 'q_outlet',
          choiceQuestion: {
            type: 'DROP_DOWN',
            options: [
              { value: 'الكورنيش' },
              { value: 'قفط' },
              { value: 'أخرى ويرجى ذكرها' },
            ],
          },
        },
      },
    },
    {
      itemId: 'item-5',
      title: 'في حالة اختيار "أخرى" — يرجى ذكر مركز البيع',
      questionItem: {
        question: { questionId: 'q_other_outlet', textQuestion: {} },
      },
    },
  ],
};

test('extractGoogleFormId parses edit URLs and raw IDs while flagging public /d/e/ responder URLs', () => {
  assert.deepEqual(extractGoogleFormId(DEFAULT_OFFLINE_FORM_EDIT_URL), {
    formId: DEFAULT_OFFLINE_FORM_ID,
    isResponderUrl: false,
  });
  assert.deepEqual(extractGoogleFormId(DEFAULT_OFFLINE_FORM_ID), {
    formId: DEFAULT_OFFLINE_FORM_ID,
    isResponderUrl: false,
  });
  assert.deepEqual(extractGoogleFormId(DEFAULT_OFFLINE_FORM_PUBLIC_URL), {
    formId: null,
    isResponderUrl: true,
  });
  assert.deepEqual(extractGoogleFormId('not-a-form'), {
    formId: null,
    isResponderUrl: false,
  });
});

test('parseGoogleFormSchemaPayload and autoMapFormQuestions map all 5 real GEN Z EVENTS form questions precisely', () => {
  const schema = parseGoogleFormSchemaPayload(REAL_GENZ_FORM_API_PAYLOAD);
  assert.equal(schema.formId, DEFAULT_OFFLINE_FORM_ID);
  assert.equal(schema.title, 'GEN Z EVENTS');
  assert.equal(schema.questions.length, 5);
  assert.deepEqual(schema.questions[2].options, ['Lounge', 'Fan Pit', 'Gold', 'Silver']);

  const mapping = autoMapFormQuestions(schema.questions);
  assert.equal(mapping.customerNameQuestionId, 'q_name');
  assert.equal(mapping.mobileQuestionId, 'q_whatsapp');
  assert.equal(mapping.tierQuestionId, 'q_tier');
  assert.equal(mapping.outletQuestionId, 'q_outlet');
  assert.equal(mapping.otherOutletQuestionId, 'q_other_outlet');
});

test('resolveFormOutletRef resolves primary outlets and conditional "أخرى" custom outlets safely (>= 3 chars)', () => {
  assert.equal(resolveFormOutletRef('الكورنيش', ''), 'الكورنيش');
  assert.equal(resolveFormOutletRef('قفط', ''), 'قفط');
  assert.equal(resolveFormOutletRef('أخرى ويرجى ذكرها', 'شارع ٢٦ يوليو'), 'شارع ٢٦ يوليو');
  assert.equal(resolveFormOutletRef('أخرى ويرجى ذكرها', 'قوص'), 'قوص');
  // Short 2-char input padded safely for Firestore minLength=3 rule
  const padded = resolveFormOutletRef('أخرى ويرجى ذكرها', 'قن');
  assert.ok(padded.length >= 3 && padded.includes('قن'));
  assert.equal(resolveFormOutletRef('أخرى ويرجى ذكرها', ''), 'أخرى — Google Form');
});

test('buildDeterministicFormBookingCode is idempotent, collision-resistant, and passes Firestore & gate QR rules', () => {
  const c1 = buildDeterministicFormBookingCode('ACYDBNg1234567890_responseA');
  const c2 = buildDeterministicFormBookingCode('ACYDBNg1234567890_responseA');
  const c3 = buildDeterministicFormBookingCode('ACYDBNg1234567890_responseB');

  assert.equal(c1, c2);
  assert.notEqual(c1, c3);
  assert.ok(c1.startsWith('OFF-GF'));
  assert.ok(c1.length >= 5 && c1.length <= 32);
  assert.match(c1, /^[a-zA-Z0-9_-]+$/);
  assert.equal(isGenZTicketCodeFormat(c1), true);
});

test('mapGoogleFormResponsesToBookings maps Fan Pit, Arabic digits, conditional Other outlet, deduplicates, and reports skipped rows', () => {
  const schema = parseGoogleFormSchemaPayload(REAL_GENZ_FORM_API_PAYLOAD);
  const mapping = autoMapFormQuestions(schema.questions);

  const alreadySyncedResponseId = 'RESP_ALREADY_IN_DB';
  const alreadySyncedCode = buildDeterministicFormBookingCode(alreadySyncedResponseId);

  const responses: GoogleFormRawResponse[] = [
    {
      responseId: 'RESP_FAN_PIT_CORNICHE',
      lastSubmittedTime: '2026-11-22T18:10:00Z',
      answers: {
        q_name: { textAnswers: { answers: [{ value: 'أحمد محمود علي' }] } },
        q_whatsapp: { textAnswers: { answers: [{ value: '٠١٠١٢٣٤٥٦٧٨' }] } },
        q_tier: { textAnswers: { answers: [{ value: 'Fan Pit' }] } },
        q_outlet: { textAnswers: { answers: [{ value: 'الكورنيش' }] } },
      },
    },
    {
      responseId: 'RESP_LOUNGE_OTHER_OUTLET',
      lastSubmittedTime: '2026-11-22T18:15:00Z',
      answers: {
        q_name: { textAnswers: { answers: [{ value: 'Sara Youssef' }] } },
        q_whatsapp: { textAnswers: { answers: [{ value: '+20 112 345 6789' }] } },
        q_tier: { textAnswers: { answers: [{ value: 'Lounge' }] } },
        q_outlet: { textAnswers: { answers: [{ value: 'أخرى ويرجى ذكرها' }] } },
        q_other_outlet: { textAnswers: { answers: [{ value: 'مكتبة الشؤون - قنا' }] } },
      },
    },
    {
      responseId: alreadySyncedResponseId,
      lastSubmittedTime: '2026-11-22T17:00:00Z',
      answers: {
        q_name: { textAnswers: { answers: [{ value: 'Kareem Adel' }] } },
        q_whatsapp: { textAnswers: { answers: [{ value: '01200001111' }] } },
        q_tier: { textAnswers: { answers: [{ value: 'Gold' }] } },
        q_outlet: { textAnswers: { answers: [{ value: 'قفط' }] } },
      },
    },
    {
      responseId: 'RESP_BAD_MOBILE',
      lastSubmittedTime: '2026-11-22T16:00:00Z',
      answers: {
        q_name: { textAnswers: { answers: [{ value: 'Incomplete User' }] } },
        q_whatsapp: { textAnswers: { answers: [{ value: '123' }] } },
        q_tier: { textAnswers: { answers: [{ value: 'Silver' }] } },
        q_outlet: { textAnswers: { answers: [{ value: 'قفط' }] } },
      },
    },
  ];

  const result = mapGoogleFormResponsesToBookings({
    responses,
    mapping,
    concert: SAMPLE_CONCERT,
    adminName: 'Lead Organizer',
    existingCodes: [alreadySyncedCode],
    defaultPaymentStatus: 'Paid',
    lang: 'en',
  });

  assert.equal(result.totalResponses, 4);
  assert.equal(result.newBookings.length, 2);
  assert.equal(result.alreadySyncedCount, 1);
  assert.equal(result.skippedRows.length, 1);
  assert.equal(result.newTicketsCount, 2);
  assert.equal(result.newPaidTicketsCount, 2);
  assert.equal(result.newRevenueEgp, 800 + 2500);

  // Sorted newest-first: Lounge (18:15) then Fan Pit (18:10)
  const loungeBooking = result.newBookings[0];
  assert.equal(loungeBooking.customerName, 'Sara Youssef');
  assert.equal(loungeBooking.customerMobile, '01123456789');
  assert.equal(loungeBooking.tier, 'Lounge');
  assert.equal(loungeBooking.totalEgp, 2500);
  assert.equal(loungeBooking.transferRef, 'مكتبة الشؤون - قنا');
  assert.equal(loungeBooking.approvalMethod, 'Google Form');
  assert.equal(loungeBooking.paymentMethod, 'Offline');
  assert.equal(loungeBooking.scansUsed, 0);

  const fanPitBooking = result.newBookings[1];
  assert.equal(fanPitBooking.customerName, 'أحمد محمود علي');
  assert.equal(fanPitBooking.customerMobile, '01012345678');
  assert.equal(fanPitBooking.tier, 'VIP'); // Fan Pit -> VIP tier
  assert.equal(fanPitBooking.totalEgp, 800);
  assert.equal(fanPitBooking.transferRef, 'الكورنيش');
  assert.equal(isGenZTicketCodeFormat(fanPitBooking.bookingCode), true);
});
