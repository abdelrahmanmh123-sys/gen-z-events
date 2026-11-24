import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup } from 'firebase/auth';
import { auth } from '../firebase';
import {
  parseGoogleFormSchemaPayload,
  type GoogleFormRawResponse,
  type GoogleFormSchema,
} from '../utils/googleFormsMapper';

export const GOOGLE_FORMS_SCOPES = [
  'https://www.googleapis.com/auth/forms.body.readonly',
  'https://www.googleapis.com/auth/forms.responses.readonly',
] as const;

export type GoogleFormsApiErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'network'
  | 'popup_closed'
  | 'unknown';

export class GoogleFormsApiError extends Error {
  code: GoogleFormsApiErrorCode;
  status?: number;

  constructor(code: GoogleFormsApiErrorCode, message: string, status?: number) {
    super(message);
    this.name = 'GoogleFormsApiError';
    this.code = code;
    this.status = status;
  }
}

// Strictly in-memory OAuth access token cache (never stored in localStorage or sessionStorage).
let cachedFormsAccessToken: string | null = null;
let cachedFormsAccountEmail: string | null = null;
let lastBoundUid: string | null = null;
let isConnectingForms = false;

const listeners = new Set<() => void>();

function notifyListeners(): void {
  listeners.forEach((cb) => {
    try {
      cb();
    } catch {
      // ignore subscriber errors
    }
  });
}

// Clear cached access token whenever Firebase Auth signs out or switches user.
onAuthStateChanged(auth, (user) => {
  if (!user) {
    if (cachedFormsAccessToken !== null || cachedFormsAccountEmail !== null) {
      cachedFormsAccessToken = null;
      cachedFormsAccountEmail = null;
      lastBoundUid = null;
      notifyListeners();
    }
    return;
  }
  if (!isConnectingForms && lastBoundUid && lastBoundUid !== user.uid) {
    cachedFormsAccessToken = null;
    cachedFormsAccountEmail = null;
    lastBoundUid = user.uid;
    notifyListeners();
  }
});

export function getCachedFormsAccessToken(): string | null {
  return cachedFormsAccessToken;
}

export function getCachedFormsAccountEmail(): string | null {
  return cachedFormsAccountEmail;
}

export function clearCachedFormsAccessToken(): void {
  cachedFormsAccessToken = null;
  cachedFormsAccountEmail = null;
  notifyListeners();
}

export function subscribeFormsAuthChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Initiates client-side Google Sign-In popup requesting read-only Google Forms scopes.
 * Reuses the existing Firebase Auth instance and stores the returned OAuth access token strictly in memory.
 */
export async function connectGoogleFormsAccount(
  loginHintEmail?: string | null,
): Promise<{ accessToken: string; email: string }> {
  const provider = new GoogleAuthProvider();
  for (const scope of GOOGLE_FORMS_SCOPES) {
    provider.addScope(scope);
  }
  const params: Record<string, string> = {
    prompt: 'consent select_account',
  };
  if (loginHintEmail && loginHintEmail.includes('@')) {
    params.login_hint = loginHintEmail.trim();
  }
  provider.setCustomParameters(params);

  isConnectingForms = true;
  try {
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    const accessToken = credential?.accessToken;
    if (!accessToken) {
      throw new GoogleFormsApiError(
        'unauthorized',
        'Google Sign-In completed, but no Google Forms access token was returned. Please try again and accept Google Forms permission.',
      );
    }
    cachedFormsAccessToken = accessToken;
    cachedFormsAccountEmail = result.user.email || loginHintEmail || null;
    lastBoundUid = result.user.uid;
    notifyListeners();
    return {
      accessToken,
      email: cachedFormsAccountEmail || '',
    };
  } catch (err: unknown) {
    if (err instanceof GoogleFormsApiError) {
      throw err;
    }
    const rawMsg = err instanceof Error ? err.message : String(err);
    if (rawMsg.includes('auth/popup-closed-by-user') || rawMsg.includes('auth/cancelled-popup-request')) {
      throw new GoogleFormsApiError(
        'popup_closed',
        'Google sign-in popup was closed before completing.',
      );
    }
    throw new GoogleFormsApiError('unknown', rawMsg);
  } finally {
    isConnectingForms = false;
  }
}

async function formsApiGetJson<T>(url: string, accessToken: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    });
  } catch {
    throw new GoogleFormsApiError(
      'network',
      'Unable to reach Google Forms API. Please check your internet connection and try again.',
    );
  }

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (!res.ok) {
    const apiMessage =
      body &&
      typeof body === 'object' &&
      'error' in body &&
      (body as { error?: { message?: string } }).error?.message
        ? String((body as { error?: { message?: string } }).error?.message)
        : `HTTP ${res.status}`;

    if (res.status === 401) {
      clearCachedFormsAccessToken();
      throw new GoogleFormsApiError(
        'unauthorized',
        'Your Google Forms session expired. Please reconnect with Google to continue.',
        401,
      );
    }
    if (res.status === 403) {
      throw new GoogleFormsApiError(
        'forbidden',
        `Access denied by Google Forms (${apiMessage}). Make sure you signed in with the Google account that owns or has edit access to this form and approved Google Forms permissions.`,
        403,
      );
    }
    if (res.status === 404) {
      throw new GoogleFormsApiError(
        'not_found',
        'Google Form not found. Double-check that you pasted the edit Form ID (from /forms/d/<ID>/edit).',
        404,
      );
    }
    throw new GoogleFormsApiError('unknown', `Google Forms API error: ${apiMessage}`, res.status);
  }

  return body as T;
}

/**
 * Reads the exact live form schema (title, description, question IDs, titles, choices) from Google Forms API v1.
 */
export async function fetchGoogleFormSchema(
  formId: string,
  accessToken: string,
): Promise<GoogleFormSchema> {
  const safeFormId = encodeURIComponent(formId.trim());
  const payload = await formsApiGetJson<unknown>(
    `https://forms.googleapis.com/v1/forms/${safeFormId}`,
    accessToken,
  );
  return parseGoogleFormSchemaPayload(payload);
}

/**
 * Fetches all submitted form responses with automatic pagination (up to 5,000 responses).
 */
export async function fetchAllGoogleFormResponses(
  formId: string,
  accessToken: string,
): Promise<GoogleFormRawResponse[]> {
  const safeFormId = encodeURIComponent(formId.trim());
  const allResponses: GoogleFormRawResponse[] = [];
  let pageToken: string | undefined;
  let pagesFetched = 0;
  const MAX_PAGES = 20;

  while (pagesFetched < MAX_PAGES) {
    const query = new URLSearchParams({ pageSize: '500' });
    if (pageToken) {
      query.set('pageToken', pageToken);
    }
    const data = await formsApiGetJson<{
      responses?: GoogleFormRawResponse[];
      nextPageToken?: string;
    }>(
      `https://forms.googleapis.com/v1/forms/${safeFormId}/responses?${query.toString()}`,
      accessToken,
    );

    if (Array.isArray(data.responses)) {
      allResponses.push(...data.responses);
    }
    pagesFetched += 1;
    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }

  return allResponses;
}
