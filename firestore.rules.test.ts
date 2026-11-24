import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

/**
 * Static & structural verification suite for Firestore security rules
 * enforcing the "Dirty Dozen" adversarial payload invariants and strict
 * billing-free email-verified authentication (Email/Password + Google).
 */
const rulesPath = fs.existsSync('firestore.rules') ? 'firestore.rules' : 'DRAFT_firestore.rules';
const rulesText = fs.readFileSync(rulesPath, 'utf8');

function extractFunctionBody(name: string): string {
  const start = rulesText.indexOf(`function ${name}(`);
  assert.ok(start !== -1, `Expected helper function ${name} to exist`);
  const braceOpen = rulesText.indexOf('{', start);
  let depth = 0;
  for (let i = braceOpen; i < rulesText.length; i++) {
    if (rulesText[i] === '{') depth++;
    if (rulesText[i] === '}') {
      depth--;
      if (depth === 0) {
        return rulesText.slice(braceOpen, i + 1);
      }
    }
  }
  throw new Error(`Unclosed function body for ${name}`);
}

describe('Firestore Rules — Dirty Dozen & Strict Email-Verified Security Invariants', () => {
  it('enforces rules_version 2 and default-deny catch-all first', () => {
    assert.match(rulesText, /rules_version\s*=\s*'2';/);
    assert.match(rulesText, /match\s*\/\{document=\*\*\}\s*\{\s*allow\s+read,\s*write:\s*if\s+false;\s*\}/);
  });

  it('strictly requires verified email (non-anonymous) and contains no phone-auth bypasses', () => {
    const verifiedFn = extractFunctionBody('isVerified');
    assert.match(verifiedFn, /request\.auth\.token\.firebase\.sign_in_provider\s*!=\s*'anonymous'/);
    assert.match(verifiedFn, /request\.auth\.token\.email_verified\s*==\s*true/);
    assert.match(verifiedFn, /request\.auth\.token\.email\s+is\s+string/);
    assert.match(verifiedFn, /request\.auth\.token\.email\.size\(\)\s*>=\s*5/);
    assert.doesNotMatch(rulesText, /isVerifiedPhone|matchesVerifiedPhone|phone_number/);
  });

  it('enforces two-tier verified staff RBAC (isSuperAdmin vs isGateStaff vs isStaff)', () => {
    const primaryFn = extractFunctionBody('isPrimaryAdmin');
    assert.match(primaryFn, /isVerified\(\)/);
    assert.match(primaryFn, /weentamalak@gmail\.com/);

    const superFn = extractFunctionBody('isSuperAdmin');
    assert.match(superFn, /isPrimaryAdmin\(\)/);
    assert.match(superFn, /isVerified\(\)/);
    assert.match(superFn, /\.data\.role\s*==\s*'Super Admin'/);

    const gateFn = extractFunctionBody('isGateStaff');
    assert.match(gateFn, /isVerified\(\)/);
    assert.match(gateFn, /\.data\.role\s*==\s*'Gate Staff'/);

    const staffFn = extractFunctionBody('isStaff');
    assert.match(staffFn, /isSuperAdmin\(\)\s*\|\|\s*isGateStaff\(\)/);

    assert.doesNotMatch(rulesText, /function\s+isAdmin\(/);
  });

  it('restricts Gate Staff strictly to paid-only check-in, offline ticket create, seat deduction, and own session', () => {
    // Gate Staff cannot confirm payment on booking update
    assert.match(
      rulesText,
      /isGateStaff\(\)\s*&&\s*existing\(\)\.paymentStatus\s*==\s*'Paid'\s*&&\s*incoming\(\)\.paymentStatus\s*==\s*'Paid'/,
    );
    assert.match(
      rulesText,
      /incoming\(\)\.diff\(existing\(\)\)\.affectedKeys\(\)\.hasOnly\(\[\s*'checkedIn',\s*'checkedInCount',\s*'checkedInAt',\s*'approvedBy',\s*'approvalMethod',\s*'updatedAt'\s*\]\)/,
    );
    // Gate Staff offline create strictly scoped to offline-sale / offline_box_office + Offline
    assert.match(
      rulesText,
      /isGateStaff\(\)\s*&&\s*incoming\(\)\.userId\s+in\s+\['offline-sale',\s*'offline_box_office'\]\s*&&\s*incoming\(\)\.paymentMethod\s*==\s*'Offline'/,
    );
    // Gate Staff concert update strictly scoped to seatsLeft decrement
    assert.match(
      rulesText,
      /isGateStaff\(\)\s*&&\s*incoming\(\)\.diff\(existing\(\)\)\.affectedKeys\(\)\.hasOnly\(\['seatsLeft',\s*'updatedAt'\]\)\s*&&\s*incoming\(\)\.seatsLeft\s*<=\s*existing\(\)\.seatsLeft/,
    );
    // Gate Staff cannot list users, admins, or adminSessions
    assert.match(rulesText, /match\s+\/users\/\{userId\}[\s\S]*?allow\s+list:\s*if\s+isSuperAdmin\(\);/);
    assert.match(rulesText, /match\s+\/admins\/\{adminId\}[\s\S]*?allow\s+list:\s*if\s+isSuperAdmin\(\);/);
    assert.match(rulesText, /match\s+\/adminSessions\/\{sessionId\}[\s\S]*?allow\s+list:\s*if\s+isSuperAdmin\(\);/);
  });

  it('binds user profile create and update strictly to verified email token', () => {
    const bindingMatches =
      rulesText.match(/incoming\(\)\.email\.lower\(\)\s*==\s*request\.auth\.token\.email\.lower\(\)/g) || [];
    assert.equal(bindingMatches.length, 2, 'Both create and update on /users must bind verified email token');

    const userValidator = extractFunctionBody('isValidUserProfile');
    assert.match(userValidator, /isValidString\(data\.email,\s*5,\s*120\)/);
    assert.match(userValidator, /isValidString\(data\.displayName,\s*2,\s*100\)/);

    const bookingValidator = extractFunctionBody('isValidBooking');
    assert.match(bookingValidator, /isValidString\(data\.customerEmail,\s*0,\s*120\)/);
    assert.match(bookingValidator, /isValidString\(data\.customerMobile,\s*6,\s*30\)/);
  });

  it('blocks self-approved Paid, checkedIn, Offline, or high-qty bookings on fan creation', () => {
    assert.match(rulesText, /incoming\(\)\.paymentMethod\s+in\s+\['InstaPay',\s*'Mobile Wallets'\]/);
    assert.match(rulesText, /incoming\(\)\.quantity\s*<=\s*20/);
    assert.match(rulesText, /incoming\(\)\.customerEmail\.size\(\)\s*>=\s*3/);
    assert.match(rulesText, /incoming\(\)\.paymentStatus\s*==\s*'Pending'/);
    assert.match(rulesText, /incoming\(\)\.checkedIn\s*==\s*false/);
    assert.match(rulesText, /incoming\(\)\.approvedBy\s*==\s*''/);
    assert.match(rulesText, /incoming\(\)\.approvalMethod\s*==\s*''/);
    assert.match(rulesText, /isValidFanPricing\(incoming\(\)\)/);
  });

  it('enforces server-side fan pricing, seat capacity, promo validation, and safe concert poster URLs', () => {
    const pricingFn = extractFunctionBody('isValidFanPricing');
    assert.match(pricingFn, /data\.quantity\s*<=\s*concert\.seatsLeft/);
    assert.match(pricingFn, /data\.unitPrice\s*==\s*concert\.tierPrices\[data\.tier\]/);
    assert.match(pricingFn, /data\.totalEgp\s*==\s*subtotal\s*-\s*data\.discountEgp/);
    assert.match(pricingFn, /data\.promoCode\s*==\s*''\s*&&\s*data\.discountEgp\s*==\s*0/);
    assert.match(pricingFn, /isValidPromoDiscount\(/);

    const promoDiscountFn = extractFunctionBody('isValidPromoDiscount');
    assert.match(promoDiscountFn, /promo\.active\s*==\s*true/);
    assert.match(promoDiscountFn, /promo\.tiers\.size\(\)\s*==\s*0\s*\|\|\s*tier\s+in\s+promo\.tiers/);

    const posterFn = extractFunctionBody('isValidPosterUrl');
    assert.match(posterFn, /\^https:\/\/\.\+/);
    assert.match(posterFn, /\^data:image\/\(jpeg\|jpg\|png\|webp\);base64,/);
    assert.doesNotMatch(posterFn, /svg/);
    const concertFn = extractFunctionBody('isValidConcert');
    assert.match(concertFn, /isValidPosterUrl\(data\.posterUrl\)/);
  });

  it('blocks orphaned bookings and waitlist entries by verifying parent concert exists', () => {
    const concertExistsChecks =
      rulesText.match(/exists\(\/databases\/\$\(database\)\/documents\/concerts\/\$\(incoming\(\)\.concertId\)\)/g) || [];
    assert.ok(concertExistsChecks.length >= 2, 'Both bookings and waitlist must verify parent concert existence');
  });

  it('blocks shadow field injection via hasOnly key allowlists on all 8 active entities', () => {
    const validators = [
      'isValidConcert',
      'isValidBooking',
      'isValidPromo',
      'isValidUserProfile',
      'isValidWaitlistEntry',
      'isValidAdminMember',
      'isValidAdminSession',
      'isValidPaymentConfig',
    ];
    for (const fn of validators) {
      assert.ok(rulesText.includes(`function ${fn}(`), `Missing validator ${fn}`);
      const body = extractFunctionBody(fn);
      assert.match(body, /\.keys\(\)\.hasOnly\(/, `Validator ${fn} must enforce keys().hasOnly()`);
    }
  });

  it('enforces PII isolation on users, bookings, and waitlist list/get rules', () => {
    assert.match(rulesText, /resource\.data\.userId\s*==\s*request\.auth\.uid/);
    assert.doesNotMatch(rulesText, /allow\s+(read|get|list):\s*if\s+isSignedIn\(\);/);
    assert.doesNotMatch(rulesText, /allow\s+(read|get|list):\s*if\s+isVerified\(\);/);
  });

  it('blocks fan deletion of paid or checked-in bookings and enforces checkedInCount bounds', () => {
    assert.match(
      rulesText,
      /existing\(\)\.paymentStatus\s*==\s*'Pending'\s*&&\s*existing\(\)\.checkedIn\s*==\s*false\s*&&\s*\(!\('checkedInCount' in existing\(\)\)\s*\|\|\s*existing\(\)\.checkedInCount\s*==\s*0\)/,
    );
    const bookingValidator = extractFunctionBody('isValidBooking');
    assert.match(bookingValidator, /'checkedInCount'/);
    assert.match(bookingValidator, /data\.checkedInCount\s+is\s+int/);
    assert.match(bookingValidator, /data\.checkedInCount\s*>=\s*0/);
    assert.match(bookingValidator, /data\.checkedInCount\s*<=\s*data\.quantity/);
    assert.match(bookingValidator, /data\.checkedIn\s*==\s*\(data\.checkedInCount\s*>=\s*data\.quantity\)/);
    assert.match(rulesText, /!\('checkedInCount' in incoming\(\)\)\s*\|\|\s*incoming\(\)\.checkedInCount\s*==\s*0/);
  });

  it('enforces server timestamp integrity (request.time) and immutable fields', () => {
    assert.match(rulesText, /incoming\(\)\.createdAt\s*==\s*request\.time/);
    assert.match(rulesText, /incoming\(\)\.updatedAt\s*==\s*request\.time/);
    assert.match(rulesText, /incoming\(\)\.createdAt\s*==\s*existing\(\)\.createdAt/);
  });

  it('enforces path variable ID hardening, promo caps, and quantity bounds', () => {
    assert.match(rulesText, /function\s+isValidId\(id\)/);
    assert.match(rulesText, /data\.quantity\s*>=\s*1\s*&&\s*data\.quantity\s*<=\s*500/);
    assert.match(rulesText, /incoming\(\)\.quantity\s*<=\s*20/);
    assert.match(rulesText, /data\.value\s*>\s*0\s*&&\s*data\.value\s*<=\s*10000/);
    assert.match(rulesText, /data\.type\s*!=\s*'percent'\s*\|\|\s*data\.value\s*<=\s*90/);
  });

  it('strictly validates optional custom tierColors hex maps on concerts', () => {
    const hexFn = extractFunctionBody('isValidHexColor');
    assert.match(hexFn, /val\.size\(\)\s*==\s*7/);
    assert.match(hexFn, /\^#\[0-9A-Fa-f\]\{6\}\$/);

    const colorsFn = extractFunctionBody('isValidTierColors');
    assert.match(colorsFn, /colors\.keys\(\)\.hasAll\(\['Silver',\s*'Gold',\s*'VIP',\s*'Lounge'\]\)/);
    assert.match(colorsFn, /colors\.keys\(\)\.hasOnly\(\['Silver',\s*'Gold',\s*'VIP',\s*'Lounge'\]\)/);

    const concertFn = extractFunctionBody('isValidConcert');
    assert.match(concertFn, /'tierColors'/);
    assert.match(concertFn, /!\('tierColors' in data\)\s*\|\|\s*isValidTierColors\(data\.tierColors\)/);
  });

  it('keeps legacy /updates and /settings (seed) collections permanently removed under default-deny', () => {
    assert.doesNotMatch(rulesText, /match\s+\/updates\//);
    assert.doesNotMatch(rulesText, /isValidBackstagePost/);
    assert.doesNotMatch(rulesText, /match\s+\/settings\//);
    assert.doesNotMatch(rulesText, /isValidSiteSettings/);
  });

  it('enforces public single-doc get and Super Admin-only writes on /paymentConfig/{configId}', () => {
    const paymentFn = extractFunctionBody('isValidPaymentConfig');
    assert.match(paymentFn, /docId\s*==\s*'default'/);
    assert.match(paymentFn, /isValidString\(data\.instapayNumber,\s*5,\s*80\)/);
    assert.match(paymentFn, /isValidString\(data\.walletNumber,\s*6,\s*30\)/);

    assert.match(
      rulesText,
      /match\s+\/paymentConfig\/\{configId\}[\s\S]*?allow\s+get:\s*if\s+isValidId\(configId\);/,
    );
    assert.match(
      rulesText,
      /match\s+\/paymentConfig\/\{configId\}[\s\S]*?allow\s+list:\s*if\s+isSuperAdmin\(\);/,
    );
    assert.match(
      rulesText,
      /match\s+\/paymentConfig\/\{configId\}[\s\S]*?allow\s+create:[\s\S]*?isSuperAdmin\(\);/,
    );
    assert.match(
      rulesText,
      /match\s+\/paymentConfig\/\{configId\}[\s\S]*?allow\s+update:[\s\S]*?isSuperAdmin\(\);/,
    );
  });

  it('aligns emailToDocId regex with client implementation and blocks anonymous accounts', () => {
    assert.match(rulesText, /replace\('\[\^a-z0-9_\\\\-\]',\s*'_'\)/);
    assert.doesNotMatch(rulesText, /isAuthenticatedFan/);
    assert.match(rulesText, /!\('checkedInCount' in existing\(\)\)\s*\|\|\s*'checkedInCount' in incoming\(\)/);
  });
});
