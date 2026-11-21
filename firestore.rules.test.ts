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

  it('restricts primary admin and staff directory strictly to verified emails', () => {
    const primaryFn = extractFunctionBody('isPrimaryAdmin');
    assert.match(primaryFn, /isVerified\(\)/);
    assert.match(primaryFn, /weentamalak@gmail\.com/);

    const adminFn = extractFunctionBody('isAdmin');
    assert.match(adminFn, /isPrimaryAdmin\(\)/);
    assert.match(adminFn, /isVerified\(\)/);
  });

  it('binds user profile create and update strictly to verified email token', () => {
    const bindingMatches =
      rulesText.match(/incoming\(\)\.email\.lower\(\)\s*==\s*request\.auth\.token\.email\.lower\(\)/g) || [];
    assert.equal(bindingMatches.length, 2, 'Both create and update on /users must bind verified email token');

    const userValidator = extractFunctionBody('isValidUserProfile');
    assert.match(userValidator, /isValidString\(data\.email,\s*5,\s*120\)/);
    assert.match(userValidator, /isValidString\(data\.displayName,\s*2,\s*100\)/);

    const bookingValidator = extractFunctionBody('isValidBooking');
    assert.match(bookingValidator, /isValidString\(data\.customerEmail,\s*3,\s*120\)/);
    assert.match(bookingValidator, /isValidString\(data\.customerMobile,\s*6,\s*30\)/);
  });

  it('blocks self-approved Paid or checkedIn bookings on fan creation', () => {
    assert.match(rulesText, /incoming\(\)\.paymentStatus\s*==\s*'Pending'/);
    assert.match(rulesText, /incoming\(\)\.checkedIn\s*==\s*false/);
    assert.match(rulesText, /incoming\(\)\.approvedBy\s*==\s*''/);
    assert.match(rulesText, /incoming\(\)\.approvalMethod\s*==\s*''/);
  });

  it('blocks orphaned bookings and waitlist entries by verifying parent concert exists', () => {
    const concertExistsChecks =
      rulesText.match(/exists\(\/databases\/\$\(database\)\/documents\/concerts\/\$\(incoming\(\)\.concertId\)\)/g) || [];
    assert.ok(concertExistsChecks.length >= 2, 'Both bookings and waitlist must verify parent concert existence');
  });

  it('blocks shadow field injection via hasOnly key allowlists on all 8 entities', () => {
    const validators = [
      'isValidConcert',
      'isValidBooking',
      'isValidPromo',
      'isValidUserProfile',
      'isValidWaitlistEntry',
      'isValidAdminMember',
      'isValidAdminSession',
      'isValidSiteSettings',
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

  it('blocks fan deletion of paid or checked-in bookings', () => {
    assert.match(rulesText, /existing\(\)\.paymentStatus\s*==\s*'Pending'\s*&&\s*existing\(\)\.checkedIn\s*==\s*false/);
  });

  it('enforces server timestamp integrity (request.time) and immutable fields', () => {
    assert.match(rulesText, /incoming\(\)\.createdAt\s*==\s*request\.time/);
    assert.match(rulesText, /incoming\(\)\.updatedAt\s*==\s*request\.time/);
    assert.match(rulesText, /incoming\(\)\.createdAt\s*==\s*existing\(\)\.createdAt/);
  });

  it('enforces path variable ID hardening, promo caps, and quantity bounds', () => {
    assert.match(rulesText, /function\s+isValidId\(id\)/);
    assert.match(rulesText, /data\.quantity\s*>=\s*1\s*&&\s*data\.quantity\s*<=\s*6/);
    assert.match(rulesText, /data\.value\s*>\s*0\s*&&\s*data\.value\s*<=\s*10000/);
    assert.match(rulesText, /data\.type\s*!=\s*'percent'\s*\|\|\s*data\.value\s*<=\s*90/);
  });

  it('keeps backstage updates collection permanently removed under default-deny', () => {
    assert.doesNotMatch(rulesText, /match\s+\/updates\//);
    assert.doesNotMatch(rulesText, /isValidBackstagePost/);
  });

  it('locks site settings list queries and restricts writes to verified admins', () => {
    assert.match(rulesText, /match\s+\/settings\/\{settingId\}/);
    assert.match(rulesText, /allow\s+list:\s*if\s+false;/);
    assert.match(rulesText, /isValidSiteSettings\(incoming\(\),\s*settingId\)/);
  });

  it('aligns emailToDocId regex with client implementation and blocks anonymous accounts', () => {
    assert.match(rulesText, /replace\('\[\^a-z0-9_\\\\-\]',\s*'_'\)/);
    assert.doesNotMatch(rulesText, /isAuthenticatedFan/);
  });
});
