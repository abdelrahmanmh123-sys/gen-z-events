export function formatFriendlyFirebaseError(error: unknown): string {
  const rawOriginal = error instanceof Error ? error.message : String(error ?? '');
  let raw = rawOriginal.trim();

  // Safely unwrap JSON-serialized FirestoreErrorInfo emitted by handleFirestoreError
  if (raw.startsWith('{') && raw.endsWith('}')) {
    try {
      const parsed = JSON.parse(raw) as { error?: unknown };
      if (typeof parsed?.error === 'string' && parsed.error.trim().length > 0) {
        raw = parsed.error.trim();
      }
    } catch {
      // Not valid JSON; keep original string
    }
  }

  if (raw.includes('auth/operation-not-allowed')) {
    return 'Email/Password sign-in is not enabled yet in Firebase Console. Enable Email/Password under Authentication -> Sign-in method, or use Continue with Google.';
  }
  if (raw.includes('auth/unauthorized-domain')) {
    return 'This app domain must be added under Firebase Console -> Authentication -> Settings -> Authorized domains.';
  }
  if (raw.includes('auth/email-already-in-use')) {
    return 'An account with this email already exists. Try signing in instead.';
  }
  if (
    raw.includes('auth/invalid-credential') ||
    raw.includes('auth/wrong-password') ||
    raw.includes('auth/user-not-found')
  ) {
    return 'Invalid email or password. Double-check your credentials and try again.';
  }
  if (raw.includes('auth/weak-password')) {
    return 'Password must be at least 8 characters long and include both letters and numbers.';
  }
  if (raw.includes('auth/invalid-email')) {
    return 'Please enter a valid email address.';
  }
  if (raw.includes('auth/popup-closed-by-user') || raw.includes('auth/cancelled-popup-request')) {
    return 'Sign-in popup was closed before completing.';
  }
  if (raw.includes('auth/popup-blocked')) {
    return 'Your browser blocked the sign-in popup. Please allow popups for this site or sign in with Email & Password.';
  }
  if (raw.includes('auth/network-request-failed')) {
    return 'Network error while connecting to authentication service. Check your internet connection and try again.';
  }
  if (raw.includes('auth/user-disabled')) {
    return 'This account has been disabled. Please contact Gen Z Events support.';
  }
  if (raw.includes('auth/too-many-requests')) {
    return 'Too many attempts. Please wait a moment and try again.';
  }
  if (raw.includes('Booking no longer exists.')) {
    return 'This booking no longer exists or was already deleted.';
  }
  if (raw.includes('Booking code already exists.')) {
    return 'Booking code already exists. Please try again.';
  }
  if (raw.includes('PAYMENT_NOT_PAID')) {
    return 'This ticket has not been confirmed as paid yet.';
  }
  if (raw.startsWith('ALREADY_CHECKED_IN|')) {
    return 'This ticket is already fully checked in.';
  }
  if (raw.includes('Quota exceeded') || raw.includes('resource-exhausted')) {
    return 'Daily Firestore free-tier quota exceeded. Quota resets tomorrow.';
  }
  if (raw.includes('Missing or insufficient permissions') || raw.includes('permission-denied')) {
    return 'Permission denied. Make sure your account is signed in and verified.';
  }
  if (
    raw.includes('unavailable') ||
    raw.includes('client is offline') ||
    raw.includes('Failed to fetch')
  ) {
    return 'Unable to reach the server. Check your internet connection and try again.';
  }
  if (raw.includes('deadline-exceeded')) {
    return 'Request timed out. Please check your connection and try again.';
  }
  if (raw.includes('aborted') || raw.includes('failed-precondition')) {
    return 'This record was just updated on another device. Please try again.';
  }
  return raw.length > 180 ? `${raw.slice(0, 177)}...` : raw;
}

/**
 * Computes scaled poster dimensions that preserve aspect ratio without upscaling.
 */
