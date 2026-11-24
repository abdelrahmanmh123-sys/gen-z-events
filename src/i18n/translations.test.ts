import test from 'node:test';
import assert from 'node:assert/strict';
import { PAYMENT_METHODS, PAYMENT_PHONE_NUMBER, TICKET_TIERS } from '../data/defaults';
import {
  buildFooterSubtitle,
  buildPaymentMethodCopy,
  formatCurrencyEgp,
  getAdminRoleLabel,
  getDirection,
  getGenreLabel,
  getPaymentMethodLabel,
  getSwatchName,
  getTierCopy,
  localizeKnownMessage,
  PAYMENT_COPY,
  resolveInitialLanguage,
  TICKET_ENTRY_TERMS,
  translations,
} from './translations';
import {
  normalizeEgyptianMobile,
  parseBoundedIntInput,
  toAsciiDigits,
  validateEgyptianMobile,
} from '../utils/bookingLogic';

test('translations.en and translations.ar have identical non-empty keys', () => {
  const enKeys = Object.keys(translations.en).sort();
  const arKeys = Object.keys(translations.ar).sort();
  assert.deepEqual(arKeys, enKeys);

  for (const key of enKeys) {
    const k = key as keyof typeof translations.en;
    assert.equal(typeof translations.en[k], 'string');
    assert.equal(typeof translations.ar[k], 'string');
    assert.ok(translations.en[k].trim().length > 0, `Empty EN translation for ${key}`);
    assert.ok(translations.ar[k].trim().length > 0, `Empty AR translation for ${key}`);
  }
});

test('all InstaPay and Mobile Wallets numbers use +201040206700 and never legacy numbers', () => {
  assert.equal(PAYMENT_PHONE_NUMBER, '+201040206700');

  for (const method of PAYMENT_METHODS) {
    assert.equal(method.destination, '+201040206700');
    assert.ok(method.instructions.includes('+201040206700'));
    assert.ok(!method.instructions.includes('01041062000'));
    assert.ok(!method.instructions.includes('01554118042'));
    assert.ok(!method.instructions.includes('01007979070'));
  }

  for (const lang of ['en', 'ar'] as const) {
    for (const id of ['InstaPay', 'Mobile Wallets'] as const) {
      assert.equal(PAYMENT_COPY[lang][id].destination, '+201040206700');
      assert.ok(PAYMENT_COPY[lang][id].instructions.includes('+201040206700'));
      assert.ok(!PAYMENT_COPY[lang][id].instructions.includes('01041062000'));
      assert.ok(!PAYMENT_COPY[lang][id].instructions.includes('01554118042'));
      assert.ok(!PAYMENT_COPY[lang][id].instructions.includes('01007979070'));
    }
    assert.ok(translations[lang].footerSubtitle.includes('+201040206700'));
    assert.ok(!translations[lang].footerSubtitle.includes('01041062000'));
    assert.ok(!translations[lang].footerSubtitle.includes('01554118042'));
    assert.ok(!translations[lang].footerSubtitle.includes('01007979070'));
    assert.ok(translations[lang].whatsappReceiptAria.includes('+201040206700'));
    assert.ok(!translations[lang].whatsappReceiptAria.includes('01041062000'));
  }
});

test('TICKET_ENTRY_TERMS provides all 6 entry rules cleanly in both EN and AR', () => {
  assert.equal(TICKET_ENTRY_TERMS.en.items.length, 6);
  assert.equal(TICKET_ENTRY_TERMS.ar.items.length, 6);
  assert.equal(TICKET_ENTRY_TERMS.ar.title, 'شروط وتعليمات الدخول');
  assert.equal(TICKET_ENTRY_TERMS.en.title, 'Terms & Conditions');
  for (const lang of ['en', 'ar'] as const) {
    for (const item of TICKET_ENTRY_TERMS[lang].items) {
      assert.ok(item.number.trim().length > 0);
      assert.ok(item.text.trim().length > 15);
    }
  }
  assert.ok(TICKET_ENTRY_TERMS.ar.items[0].text.includes('يُمنع الخروج والعودة'));
  assert.ok(TICKET_ENTRY_TERMS.ar.items[3].text.includes('المأكولات والمشروبات'));
  assert.ok(TICKET_ENTRY_TERMS.en.items[0].text.toLowerCase().includes('re-entry'));
  assert.ok(TICKET_ENTRY_TERMS.en.items[3].text.toLowerCase().includes('fireworks'));
});

test('language resolution, directionality, currency, and label helpers work cleanly', () => {
  assert.equal(resolveInitialLanguage('ar'), 'ar');
  assert.equal(resolveInitialLanguage('en'), 'en');
  assert.equal(resolveInitialLanguage(null), 'en');
  assert.equal(resolveInitialLanguage('fr'), 'en');

  assert.equal(getDirection('en'), 'ltr');
  assert.equal(getDirection('ar'), 'rtl');

  assert.equal(formatCurrencyEgp(1250, 'en'), '1,250 EGP');
  assert.equal(formatCurrencyEgp(1250, 'ar'), '1,250 ج.م');

  for (const tier of TICKET_TIERS) {
    assert.ok(getTierCopy(tier.id, 'en').name.length > 0);
    assert.ok(getTierCopy(tier.id, 'ar').name.length > 0);
    assert.ok(getTierCopy(tier.id, 'ar').details.length > 0);
  }

  assert.equal(getPaymentMethodLabel('InstaPay', 'ar'), 'إنستاباي (InstaPay)');
  assert.equal(getPaymentMethodLabel('Mobile Wallets', 'ar'), 'المحافظ الإلكترونية');
  assert.equal(getPaymentMethodLabel('Offline', 'ar'), 'مبيعات أوفلاين');

  assert.equal(getGenreLabel('All', 'ar'), 'الكل');
  assert.equal(getGenreLabel('Indie Pop / Rap', 'ar'), 'إندي بوب / راب');
  assert.equal(getGenreLabel('Custom Genre', 'ar'), 'Custom Genre');

  assert.equal(getAdminRoleLabel('Super Admin', 'ar'), 'مدير عام');
  assert.equal(getAdminRoleLabel('Gate Staff', 'ar'), 'فريق البوابة');

  assert.equal(getSwatchName('Amber Gold', 'ar'), 'ذهبي كهرماني');
  assert.equal(getSwatchName('Amber Gold', 'en'), 'Amber Gold');

  assert.equal(
    localizeKnownMessage('Promo code is invalid or currently inactive.', 'ar'),
    'كود الخصم غير صالح أو غير مفعل حالياً.',
  );
  assert.equal(
    localizeKnownMessage('GENZ15 applied (-150 EGP)', 'ar'),
    'تم تطبيق الخصم: GENZ15 (-150 ج.م)',
  );
  assert.equal(
    localizeKnownMessage('Quantity must be between 1 and 8.', 'ar'),
    'يجب أن يكون عدد التذاكر بين ١ و 8.',
  );
});

test('Arabic-Indic and Persian digits normalize cleanly in mobile & numeric parsers', () => {
  assert.equal(toAsciiDigits('٠١٠٤٠٢٠٦٧٠٠'), '01040206700');
  assert.equal(toAsciiDigits('۰۱۲۳۴۵۶۷۸۹'), '0123456789');
  assert.equal(normalizeEgyptianMobile('٠١٠٤٠٢٠٦٧٠٠'), '01040206700');
  assert.equal(normalizeEgyptianMobile('+٢٠١٠٤٠٢٠٦٧٠٠'), '01040206700');

  const validAr = validateEgyptianMobile('٠١٠٤٠٢٠٦٧٠٠');
  assert.equal(validAr.valid, true);
  assert.equal(validAr.normalized, '01040206700');

  const invalid = validateEgyptianMobile('12345');
  assert.equal(invalid.valid, false);
  assert.ok(!invalid.error?.includes('010XXXXXXXX'));

  assert.deepEqual(parseBoundedIntInput('٢٥٠', 1, 1000), { valid: true, value: 250 });
  assert.deepEqual(parseBoundedIntInput('٠', 1, 1000), { valid: false, value: 1 });
});

test('buildPaymentMethodCopy and buildFooterSubtitle interpolate live InstaPay & Vodafone Cash numbers in EN and AR', () => {
  const customConfig = {
    instapayNumber: 'genzevents@instapay',
    walletNumber: '+201099887766',
  };

  const enInsta = buildPaymentMethodCopy('InstaPay', 'en', customConfig);
  assert.equal(enInsta.destination, 'genzevents@instapay');
  assert.ok(enInsta.instructions.includes('genzevents@instapay'));

  const arWallet = buildPaymentMethodCopy('Mobile Wallets', 'ar', customConfig);
  assert.equal(arWallet.destination, '+201099887766');
  assert.ok(arWallet.instructions.includes('+201099887766'));

  const enFooter = buildFooterSubtitle('en', customConfig);
  assert.ok(enFooter.includes('genzevents@instapay'));
  assert.ok(enFooter.includes('+201099887766'));

  const arFooter = buildFooterSubtitle('ar', customConfig);
  assert.ok(arFooter.includes('genzevents@instapay'));
  assert.ok(arFooter.includes('+201099887766'));

  // Falls back gracefully to default PAYMENT_PHONE_NUMBER when blank
  const fallback = buildPaymentMethodCopy('InstaPay', 'en', { instapayNumber: '', walletNumber: '' });
  assert.equal(fallback.destination, PAYMENT_PHONE_NUMBER);
});
