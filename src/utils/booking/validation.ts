import { PAYMENT_PHONE_NUMBER } from '../../data/defaults';
import type { PaymentConfig } from '../../types';
import { MAX_QTY_PER_ORDER } from './pricing';

export const MAX_POSTER_DATA_URL_LENGTH = 390000;

export function isSafeHttpsUrl(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const trimmed = raw.trim();
  if (!trimmed.startsWith('https://')) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' && parsed.hostname.length > 0;
  } catch {
    return false;
  }
}

export function isSafeImageUrl(raw: string | null | undefined): boolean {
  if (!raw) return true;
  const trimmed = raw.trim();
  if (trimmed === '') return true;
  if (trimmed.length > MAX_POSTER_DATA_URL_LENGTH) return false;
  if (isSafeHttpsUrl(trimmed)) return true;
  if (/^\/assets\/[a-zA-Z0-9_./-]+$/.test(trimmed) && !trimmed.includes('..')) return true;
  if (/^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(trimmed)) return true;
  return false;
}

export interface BookingInputValidation {
  valid: boolean;
  error?: string;
}

export function validateBookingInput(input: {
  customerName: string;
  customerMobile: string;
  customerEmail: string;
  transferRef: string;
  quantity: number;
  seatsLeft: number;
}): BookingInputValidation {
  const name = input.customerName.trim();
  const mobileCheck = validateEgyptianMobile(input.customerMobile, true);
  const email = input.customerEmail.trim();
  const ref = input.transferRef.trim();

  if (name.length < 2 || name.length > 100) {
    return { valid: false, error: 'Please enter your full name (2–100 characters).' };
  }
  if (!mobileCheck.valid) {
    return { valid: false, error: mobileCheck.error || 'Please enter a valid Egyptian mobile number.' };
  }
  const emailCheck = validateEmailAddress(email, { allowDisposable: true });
  if (!emailCheck.valid) {
    return { valid: false, error: 'Please enter a valid email address.' };
  }
  if (ref.length < 3 || ref.length > 80) {
    return { valid: false, error: 'Please enter your InstaPay / Wallet transfer reference or sender number.' };
  }
  if (input.quantity < 1 || input.quantity > MAX_QTY_PER_ORDER) {
    return { valid: false, error: `Quantity must be between 1 and ${MAX_QTY_PER_ORDER}.` };
  }
  if (input.quantity > input.seatsLeft) {
    return {
      valid: false,
      error: 'That ticket quantity is not currently available for this show. Try selecting fewer passes.',
    };
  }
  return { valid: true };
}

export function validateWaitlistInput(input: {
  name: string;
  mobile: string;
  email: string;
}): { valid: boolean; error?: string; normalized?: { name: string; mobile: string; email: string } } {
  const cleanName = input.name.trim().replace(/\s+/g, ' ');
  if (cleanName.length < 2 || cleanName.length > 100) {
    return { valid: false, error: 'Please enter your full name (2–100 characters).' };
  }
  const mobileCheck = validateEgyptianMobile(input.mobile, true);
  if (!mobileCheck.valid) {
    return { valid: false, error: mobileCheck.error || 'Please enter a valid Egyptian mobile number.' };
  }
  const cleanEmail = input.email.trim().toLowerCase();
  if (cleanEmail.length > 0) {
    const emailCheck = validateEmailAddress(cleanEmail, { allowDisposable: true });
    if (!emailCheck.valid) {
      return { valid: false, error: 'Please enter a valid email address or leave it blank.' };
    }
  }
  return {
    valid: true,
    normalized: {
      name: cleanName,
      mobile: mobileCheck.normalized,
      email: cleanEmail,
    },
  };
}

export interface SignupValidationResult {
  valid: boolean;
  error?: string;
  normalized?: {
    fullName: string;
    email: string;
    mobile: string;
  };
}

export interface PasswordStrengthResult {
  minLength: boolean;
  hasLetter: boolean;
  hasNumber: boolean;
  notCommon: boolean;
  valid: boolean;
}

const BLOCKED_EMAIL_DOMAINS = new Set([
  'example.com',
  'example.org',
  'example.net',
  'test.com',
  'test.org',
  'test.net',
  'fake.com',
  'fake.org',
  'asdf.com',
  'qwerty.com',
  'invalid.com',
  'none.com',
  'null.com',
  'localhost',
  'mailinator.com',
  'tempmail.com',
  'temp-mail.org',
  'guerrillamail.com',
  'yopmail.com',
  '10minutemail.com',
  'trashmail.com',
  'sharklasers.com',
  'throwaway.email',
]);

const BLOCKED_NAME_WORDS = new Set([
  'test',
  'testing',
  'asdf',
  'asdfgh',
  'qwerty',
  'zxcvbn',
  'fake',
  'admin',
  'user',
  'guest',
  'none',
  'null',
  'undefined',
  'unknown',
  'anonymous',
  'abcd',
  'abcde',
  'xyz',
  'foo',
  'bar',
  'spam',
  'dummy',
]);

const COMMON_WEAK_PASSWORDS = new Set([
  'password',
  'password1',
  'password123',
  '12345678',
  '123456789',
  '1234567890',
  'qwerty123',
  'qwertyui',
  'abcd1234',
  'abc12345',
  '00000000',
  '11111111',
  'letmein1',
  'welcome1',
  'admin123',
  'iloveyou1',
]);

export function toAsciiDigits(raw: string): string {
  return raw
    .replace(/[٠-٩]/g, (ch) => String(ch.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (ch) => String(ch.charCodeAt(0) - 0x06f0));
}

export function normalizeEgyptianMobile(raw: string): string {
  const cleaned = toAsciiDigits(raw).trim().replace(/[\s\-()]/g, '');
  if (cleaned.startsWith('+200') && cleaned.length === 14) {
    return cleaned.slice(3);
  }
  if (cleaned.startsWith('+20')) {
    return `0${cleaned.slice(3)}`;
  }
  if (cleaned.startsWith('00200') && cleaned.length === 15) {
    return cleaned.slice(4);
  }
  if (cleaned.startsWith('0020')) {
    return `0${cleaned.slice(4)}`;
  }
  if (/^2001[0125]\d{8}$/.test(cleaned)) {
    return cleaned.slice(2);
  }
  if (/^201[0125]\d{8}$/.test(cleaned)) {
    return `0${cleaned.slice(2)}`;
  }
  if (/^1[0125]\d{8}$/.test(cleaned)) {
    return `0${cleaned}`;
  }
  return cleaned;
}

export interface AuthUserLike {
  isAnonymous?: boolean;
  emailVerified?: boolean;
  email?: string | null;
}

export function isVerifiedFanAccount(user: AuthUserLike | null | undefined): boolean {
  if (!user || user.isAnonymous) return false;
  return Boolean(user.emailVerified && typeof user.email === 'string' && user.email.trim().length >= 5);
}

export function isPendingEmailVerification(user: AuthUserLike | null | undefined): boolean {
  if (!user || user.isAnonymous) return false;
  return !isVerifiedFanAccount(user);
}

export function isEmailVerifiedAdminCandidate(user: AuthUserLike | null | undefined): boolean {
  return isVerifiedFanAccount(user);
}

export function validateFullName(raw: string): { valid: boolean; normalized: string; error?: string } {
  const normalized = raw.trim().replace(/\s+/g, ' ');
  if (normalized.length < 4 || normalized.length > 60) {
    return { valid: false, normalized, error: 'Enter your real first and last name (4–60 characters).' };
  }
  // Allow Unicode letters (Latin + Arabic), spaces, hyphens, and apostrophes only
  if (!/^[\p{L}][\p{L}\s'-]*[\p{L}]$/u.test(normalized)) {
    return {
      valid: false,
      normalized,
      error: 'Full name can only contain letters, spaces, hyphens, or apostrophes (no numbers or symbols).',
    };
  }
  const parts = normalized.split(' ').filter(Boolean);
  if (parts.length < 2) {
    return { valid: false, normalized, error: 'Please enter both your first and last name.' };
  }
  for (const part of parts) {
    const lettersOnly = part.replace(/['-]/g, '');
    if (lettersOnly.length < 2) {
      return { valid: false, normalized, error: 'Each part of your name must be at least 2 letters.' };
    }
    if (/(.)\1{2,}/iu.test(lettersOnly)) {
      return { valid: false, normalized, error: 'Please enter a real name without repeated filler letters.' };
    }
    if (BLOCKED_NAME_WORDS.has(lettersOnly.toLowerCase())) {
      return { valid: false, normalized, error: 'Please enter your real full name rather than placeholder text.' };
    }
  }
  return { valid: true, normalized };
}

export function validateEgyptianMobile(
  raw: string,
  required = true,
): { valid: boolean; normalized: string; error?: string } {
  const normalized = normalizeEgyptianMobile(raw);
  if (!normalized) {
    if (!required) return { valid: true, normalized: '' };
    return { valid: false, normalized: '', error: 'Enter your Egyptian mobile number.' };
  }
  if (!/^01[0125]\d{8}$/.test(normalized)) {
    return {
      valid: false,
      normalized,
      error: 'Enter a valid 11-digit Egyptian mobile number starting with 010, 011, 012, or 015.',
    };
  }
  if (/^01[0125](\d)\1{7}$/.test(normalized)) {
    return {
      valid: false,
      normalized,
      error: 'Please enter your real mobile number rather than repeated digits.',
    };
  }
  return { valid: true, normalized };
}

export function validateEmailAddress(
  raw: string,
  opts: { allowDisposable?: boolean } = {},
): { valid: boolean; normalized: string; error?: string } {
  const normalized = raw.trim().toLowerCase();
  if (!normalized || normalized.length > 120) {
    return { valid: false, normalized, error: 'Please enter a valid email address.' };
  }
  if (!/^[a-z0-9](?:[a-z0-9._%+-]{0,62}[a-z0-9])?@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/.test(normalized)) {
    return { valid: false, normalized, error: 'Please enter a properly formatted email address.' };
  }
  if (normalized.includes('..')) {
    return { valid: false, normalized, error: 'Email address cannot contain consecutive dots.' };
  }
  const domain = normalized.split('@')[1] || '';
  if (!opts.allowDisposable && BLOCKED_EMAIL_DOMAINS.has(domain)) {
    return {
      valid: false,
      normalized,
      error: 'Please use a real personal email address (test or temporary email domains are not accepted).',
    };
  }
  return { valid: true, normalized };
}

export function evaluatePasswordStrength(password: string): PasswordStrengthResult {
  const minLength = password.length >= 8;
  const hasLetter = /[A-Za-z]/.test(password);
  const hasNumber = /\d/.test(password);
  const lower = password.trim().toLowerCase();
  const notCommon =
    lower.length > 0 &&
    !COMMON_WEAK_PASSWORDS.has(lower) &&
    !/^(.)\1+$/.test(password);
  return {
    minLength,
    hasLetter,
    hasNumber,
    notCommon,
    valid: minLength && hasLetter && hasNumber && notCommon,
  };
}

export function validateSignupInput(input: {
  fullName: string;
  email: string;
  password: string;
  confirmPassword: string;
  mobile: string;
}): SignupValidationResult {
  const nameCheck = validateFullName(input.fullName);
  if (!nameCheck.valid) {
    return { valid: false, error: nameCheck.error };
  }

  const mobileCheck = validateEgyptianMobile(input.mobile, true);
  if (!mobileCheck.valid) {
    return { valid: false, error: mobileCheck.error };
  }

  const emailCheck = validateEmailAddress(input.email);
  if (!emailCheck.valid) {
    return { valid: false, error: emailCheck.error };
  }

  const pwCheck = evaluatePasswordStrength(input.password);
  if (!pwCheck.minLength) {
    return { valid: false, error: 'Password must be at least 8 characters long.' };
  }
  if (!pwCheck.hasLetter || !pwCheck.hasNumber) {
    return { valid: false, error: 'Password must include both letters and at least one number.' };
  }
  if (!pwCheck.notCommon) {
    return { valid: false, error: 'Choose a stronger password — avoid common or repeated patterns.' };
  }
  if (input.password !== input.confirmPassword) {
    return { valid: false, error: 'Passwords do not match.' };
  }

  return {
    valid: true,
    normalized: {
      fullName: nameCheck.normalized,
      email: emailCheck.normalized,
      mobile: mobileCheck.normalized,
    },
  };
}

export function validateProfileUpdateInput(input: {
  displayName: string;
  mobile: string;
  city: string;
  bio: string;
}): {
  valid: boolean;
  error?: string;
  normalized?: { displayName: string; mobile: string; city: string; bio: string };
} {
  const nameCheck = validateFullName(input.displayName);
  if (!nameCheck.valid) {
    return { valid: false, error: nameCheck.error };
  }
  const mobileCheck = validateEgyptianMobile(input.mobile, false);
  if (!mobileCheck.valid) {
    return { valid: false, error: mobileCheck.error };
  }
  const cleanCity = input.city.trim().replace(/\s+/g, ' ');
  if (cleanCity.length < 2 || cleanCity.length > 60 || !/^[\p{L}\s'-]+$/u.test(cleanCity)) {
    return { valid: false, error: 'Enter a valid city name (letters only, 2–60 characters).' };
  }
  const cleanBio = input.bio.trim().slice(0, 300);
  return {
    valid: true,
    normalized: {
      displayName: nameCheck.normalized,
      mobile: mobileCheck.normalized,
      city: cleanCity,
      bio: cleanBio,
    },
  };
}

/**
 * Picks the earliest concert whose start time is still in the future.
 * Falls back to the most recent scheduled concert only if all shows are in the past.
 */

export function parseBoundedIntInput(
  raw: string,
  min: number,
  max: number,
): { valid: boolean; value: number } {
  const trimmed = toAsciiDigits(raw).trim();
  if (!trimmed || !/^\d+$/.test(trimmed)) {
    return { valid: false, value: min };
  }
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    return { valid: false, value: min };
  }
  return { valid: true, value: parsed };
}

export const PAYMENT_CONFIG_DOC_ID = 'default';

export const DEFAULT_PAYMENT_CONFIG: PaymentConfig = {
  id: PAYMENT_CONFIG_DOC_ID,
  instapayNumber: PAYMENT_PHONE_NUMBER,
  walletNumber: PAYMENT_PHONE_NUMBER,
  updatedBy: '',
};

export function resolvePaymentConfig(raw?: Partial<PaymentConfig> | null): PaymentConfig {
  const instapay =
    typeof raw?.instapayNumber === 'string' && raw.instapayNumber.trim().length > 0
      ? raw.instapayNumber.trim()
      : PAYMENT_PHONE_NUMBER;
  const wallet =
    typeof raw?.walletNumber === 'string' && raw.walletNumber.trim().length > 0
      ? raw.walletNumber.trim()
      : PAYMENT_PHONE_NUMBER;
  const resolved: PaymentConfig = {
    id: PAYMENT_CONFIG_DOC_ID,
    instapayNumber: instapay,
    walletNumber: wallet,
    updatedBy: typeof raw?.updatedBy === 'string' ? raw.updatedBy : '',
  };
  if (raw?.createdAt !== undefined) {
    resolved.createdAt = raw.createdAt;
  }
  if (raw?.updatedAt !== undefined) {
    resolved.updatedAt = raw.updatedAt;
  }
  return resolved;
}

function normalizePaymentPhonePreservePrefix(raw: string): { valid: boolean; formatted: string } {
  const compact = toAsciiDigits(raw).trim().replace(/[\s\-()]/g, '');
  const mobileCheck = validateEgyptianMobile(compact, true);
  if (!mobileCheck.valid) {
    return { valid: false, formatted: compact };
  }
  if (compact.startsWith('+20')) {
    return { valid: true, formatted: `+20${mobileCheck.normalized.slice(1)}` };
  }
  return { valid: true, formatted: mobileCheck.normalized };
}

export type PaymentConfigValidationResult =
  | {
      valid: true;
      normalized: {
        instapayNumber: string;
        walletNumber: string;
      };
    }
  | {
      valid: false;
      errorEn: string;
      errorAr: string;
    };

export function validatePaymentConfigInput(input: {
  instapayNumber: string;
  walletNumber: string;
}): PaymentConfigValidationResult {
  const rawInsta = toAsciiDigits(input.instapayNumber).trim().replace(/\s+/g, '');
  const rawWallet = toAsciiDigits(input.walletNumber).trim();

  if (rawInsta.length < 5 || rawInsta.length > 80) {
    return {
      valid: false,
      errorEn:
        'Enter a valid InstaPay mobile number (e.g. +201040206700 or 01040206700) or IPA address (e.g. name@instapay).',
      errorAr:
        'يرجى إدخال رقم موبايل صحيح لإنستاباي (مثل 01040206700 أو +201040206700) أو عنوان IPA (مثل name@instapay).',
    };
  }

  let normalizedInsta = '';
  if (rawInsta.includes('@')) {
    if (!/^[a-zA-Z0-9._-]{2,50}@[a-zA-Z0-9.-]{2,28}$/.test(rawInsta)) {
      return {
        valid: false,
        errorEn: 'Enter a valid InstaPay IPA address (e.g. genzevents@instapay).',
        errorAr: 'يرجى إدخال عنوان إنستاباي (IPA) صحيح (مثل genzevents@instapay).',
      };
    }
    normalizedInsta = rawInsta;
  } else {
    const instaPhone = normalizePaymentPhonePreservePrefix(rawInsta);
    if (!instaPhone.valid) {
      return {
        valid: false,
        errorEn:
          'Enter a valid Egyptian mobile number for InstaPay (010, 011, 012, or 015) or an IPA address like name@instapay.',
        errorAr:
          'يرجى إدخال رقم موبايل مصري صحيح لإنستاباي (يبدأ بـ 010 أو 011 أو 012 أو 015) أو عنوان IPA مثل name@instapay.',
      };
    }
    normalizedInsta = instaPhone.formatted;
  }

  const walletPhone = normalizePaymentPhonePreservePrefix(rawWallet);
  if (!walletPhone.valid || walletPhone.formatted.length < 6 || walletPhone.formatted.length > 30) {
    return {
      valid: false,
      errorEn:
        'Enter a valid 11-digit Egyptian mobile number for Vodafone Cash / Mobile Wallets (010, 011, 012, or 015).',
      errorAr:
        'يرجى إدخال رقم موبايل مصري صحيح لفودافون كاش / المحافظ الإلكترونية (١١ رقماً يبدأ بـ 010 أو 011 أو 012 أو 015).',
    };
  }

  return {
    valid: true,
    normalized: {
      instapayNumber: normalizedInsta,
      walletNumber: walletPhone.formatted,
    },
  };
}
