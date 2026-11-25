import { initializeApp } from 'firebase/app';
import {
  browserLocalPersistence,
  browserPopupRedirectResolver,
  browserSessionPersistence,
  getAuth,
  indexedDBLocalPersistence,
  initializeAuth,
  inMemoryPersistence,
  GoogleAuthProvider,
  type Auth,
  type User,
} from 'firebase/auth';
import {
  type Firestore,
  getFirestore,
  initializeFirestore,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
const FIRESTORE_DATABASE_ID =
  (firebaseConfig as { firestoreDatabaseId?: string }).firestoreDatabaseId ||
  'ai-studio-ebd015a5-12b5-456c-b8c3-447ca302527f';

function initDb(): Firestore {
  try {
    return initializeFirestore(
      app,
      {
        experimentalForceLongPolling: true,
        // Prevent ReadableStream stalls in Safari 12-14, older Android WebViews, and mobile carrier proxies
        useFetchStreams: false,
      } as Parameters<typeof initializeFirestore>[1],
      FIRESTORE_DATABASE_ID,
    );
  } catch {
    return getFirestore(app, FIRESTORE_DATABASE_ID);
  }
}

function initSafeAuth(): Auth {
  try {
    return initializeAuth(app, {
      persistence: [
        indexedDBLocalPersistence,
        browserLocalPersistence,
        browserSessionPersistence,
        inMemoryPersistence,
      ],
      popupRedirectResolver: browserPopupRedirectResolver,
    });
  } catch {
    return getAuth(app);
  }
}

export const db = initDb();
export const auth = initSafeAuth();
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

function buildFirestoreErrorInfo(
  error: unknown,
  operationType: OperationType,
  path: string | null,
): FirestoreErrorInfo {
  return {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
}

export function logFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null,
): void {
  const errInfo = buildFirestoreErrorInfo(error, operationType, path);
  console.error('Firestore Error: ', JSON.stringify(errInfo));
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null,
): never {
  const errInfo = buildFirestoreErrorInfo(error, operationType, path);
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

/**
 * Ensures a verified user's Firebase Auth ID token carries email_verified=true
 * before issuing security-rule-protected Firestore writes.
 */
export async function ensureFreshVerifiedToken(user: User | null | undefined): Promise<void> {
  if (!user) return;
  const tokenResult = await user.getIdTokenResult();
  if (!tokenResult.claims.email_verified) {
    await user.reload();
    await user.getIdToken(true);
  }
}

export function formatFriendlyFirebaseError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  if (raw.includes('auth/operation-not-allowed')) {
    return 'Email/Password sign-in is not enabled yet in Firebase Console. Enable Email/Password under Authentication -> Sign-in method, or use Continue with Google.';
  }
  if (raw.includes('auth/unauthorized-domain')) {
    return 'This app domain must be added under Firebase Console -> Authentication -> Settings -> Authorized domains.';
  }
  if (raw.includes('auth/email-already-in-use')) {
    return 'An account with this email already exists. Try signing in instead.';
  }
  if (raw.includes('auth/invalid-credential') || raw.includes('auth/wrong-password') || raw.includes('auth/user-not-found')) {
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
  if (raw.includes('Quota exceeded')) {
    return 'Daily Firestore free-tier quota exceeded. Quota resets tomorrow.';
  }
  if (raw.includes('Missing or insufficient permissions') || raw.includes('permission-denied')) {
    return 'Permission denied. Make sure your account is signed in and verified.';
  }
  return raw.length > 180 ? `${raw.slice(0, 177)}...` : raw;
}
