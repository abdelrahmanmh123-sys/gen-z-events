import React, { useEffect, useRef, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  deleteUser,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  LogOut,
  MailCheck,
  RefreshCw,
  Ticket,
  Trash2,
  X,
} from 'lucide-react';
import { auth, ensureFreshVerifiedToken, formatFriendlyFirebaseError, googleProvider } from '../firebase';
import { BrandLogo } from './BrandLogo';
import { upsertUserProfile } from '../services/firestoreService';
import type { UserProfile } from '../types';
import {
  evaluatePasswordStrength,
  isPendingEmailVerification,
  isVerifiedFanAccount,
  validateEmailAddress,
  validateProfileUpdateInput,
  validateSignupInput,
} from '../utils/bookingLogic';
import { useLanguage } from '../i18n/LanguageContext';
import { getGenreLabel, localizeKnownMessage } from '../i18n/translations';

export const PENDING_PROFILE_STORAGE_KEY = 'genz_pending_verified_profile';

export interface PendingSignupProfile {
  uid: string;
  displayName: string;
  mobile: string;
  favorites: string[];
}

export function savePendingSignupProfile(data: PendingSignupProfile): void {
  try {
    sessionStorage.setItem(PENDING_PROFILE_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // ignore storage quota / privacy mode errors
  }
}

export function readPendingSignupProfile(uid: string): PendingSignupProfile | null {
  try {
    const raw = sessionStorage.getItem(PENDING_PROFILE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingSignupProfile>;
    if (parsed.uid !== uid) return null;
    return {
      uid,
      displayName: typeof parsed.displayName === 'string' ? parsed.displayName : '',
      mobile: typeof parsed.mobile === 'string' ? parsed.mobile : '',
      favorites: Array.isArray(parsed.favorites) ? parsed.favorites : [],
    };
  } catch {
    return null;
  }
}

export function clearPendingSignupProfile(): void {
  try {
    sessionStorage.removeItem(PENDING_PROFILE_STORAGE_KEY);
  } catch {
    // ignore
  }
}

interface AuthProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  profile: UserProfile | null;
  guestFavorites: string[];
  favoritesCount: number;
  ticketsCount: number;
  onOpenTickets: () => void;
  onRefreshUser: () => Promise<boolean>;
  onUserMutated: () => void;
  onNotify: (msg: string) => void;
}

const GENRE_OPTIONS = [
  'Indie Pop / Rap',
  'Electronic / Indie',
  'Acoustic / Fusion',
  'Alternative Rock',
  'Hip-Hop / Pop',
  'Shaabi / Urban',
];

export const AuthProfileModal: React.FC<AuthProfileModalProps> = ({
  isOpen,
  onClose,
  user,
  profile,
  guestFavorites,
  favoritesCount,
  ticketsCount,
  onOpenTickets,
  onRefreshUser,
  onUserMutated,
  onNotify,
}) => {
  const { lang, t } = useLanguage();
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [signupName, setSignupName] = useState('');
  const [signupMobile, setSignupMobile] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [authError, setAuthError] = useState('');
  const [authInfo, setAuthInfo] = useState('');
  const [authBusy, setAuthBusy] = useState(false);

  // Email Verification Gate state
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [verifyFeedback, setVerifyFeedback] = useState<{ type: 'error' | 'info'; text: string } | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);

  // Profile fields (verified accounts only)
  const [displayName, setDisplayName] = useState('');
  const [mobile, setMobile] = useState('');
  const [city, setCity] = useState('Qena');
  const [favoriteGenre, setFavoriteGenre] = useState('Indie Pop / Rap');
  const [bio, setBio] = useState('');
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileStatus, setProfileStatus] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const profileHydratedKeyRef = useRef<string | null>(null);
  const profileDirtyRef = useRef(false);

  const isVerifiedAccount = isVerifiedFanAccount(user);
  const isUnverifiedAccount = isPendingEmailVerification(user);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = window.setTimeout(() => setResendCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [resendCooldown]);

  useEffect(() => {
    if (!isOpen) {
      setPassword('');
      setConfirmPassword('');
      setShowPassword(false);
      setAuthError('');
      setAuthInfo('');
      setVerifyFeedback(null);
      setProfileStatus(null);
      profileHydratedKeyRef.current = null;
      profileDirtyRef.current = false;
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isVerifiedAccount || !user || !isOpen) return;
    const hydrationKey = `${user.uid}:${profile ? 'loaded' : 'initial'}`;
    if (profileHydratedKeyRef.current === hydrationKey) return;
    // Never overwrite in-progress user edits or wipe the save-success banner on live snapshots
    if (profileDirtyRef.current && profileHydratedKeyRef.current?.startsWith(`${user.uid}:`)) {
      return;
    }
    profileHydratedKeyRef.current = hydrationKey;
    setDisplayName(profile?.displayName || user.displayName || '');
    setMobile(profile?.mobile || '');
    setCity(profile?.city || 'Qena');
    setFavoriteGenre(profile?.favoriteGenre || 'Indie Pop / Rap');
    setBio(profile?.bio || '');
    setAuthError('');
    setAuthInfo('');
  }, [isVerifiedAccount, user, profile, isOpen]);

  if (!isOpen) return null;

  const pwStrength = evaluatePasswordStrength(password);

  const switchAuthMode = (nextMode: 'signin' | 'signup') => {
    setAuthMode(nextMode);
    setAuthError('');
    setAuthInfo('');
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthInfo('');
    setVerifyFeedback(null);

    if (authMode === 'signup') {
      const check = validateSignupInput({
        fullName: signupName,
        email,
        password,
        confirmPassword,
        mobile: signupMobile,
      });
      if (!check.valid || !check.normalized) {
        setAuthError(
          localizeKnownMessage(
            check.error || 'Enter your real first and last name (4–60 characters).',
            lang,
          ),
        );
        return;
      }

      const { fullName, email: cleanEmail, mobile: cleanMobile } = check.normalized;
      setAuthBusy(true);
      try {
        const cred = await createUserWithEmailAndPassword(auth, cleanEmail, password);
        await updateProfile(cred.user, { displayName: fullName });

        // Hold validated details locally until email verification completes
        savePendingSignupProfile({
          uid: cred.user.uid,
          displayName: fullName,
          mobile: cleanMobile,
          favorites: guestFavorites,
        });

        let verificationSent = false;
        try {
          await sendEmailVerification(cred.user);
          verificationSent = true;
          setResendCooldown(30);
        } catch {
          verificationSent = false;
        }

        onUserMutated();
        setSignupName('');
        setSignupMobile('');
        setPassword('');
        setConfirmPassword('');
        setVerifyFeedback(
          verificationSent
            ? {
                type: 'info',
                text: `${t.verifyLinkSentPrefix} ${cleanEmail}${t.verifyLinkSentSuffix}`,
              }
            : {
                type: 'error',
                text: t.verifyLinkFail,
              },
        );
      } catch (err) {
        setAuthError(localizeKnownMessage(formatFriendlyFirebaseError(err), lang));
      } finally {
        setAuthBusy(false);
      }
      return;
    }

    const emailCheck = validateEmailAddress(email, { allowDisposable: true });
    if (!emailCheck.valid) {
      setAuthError(localizeKnownMessage('Please enter a valid email address.', lang));
      return;
    }
    if (!password) {
      setAuthError(t.enterPasswordError);
      return;
    }

    setAuthBusy(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, emailCheck.normalized, password);
      await cred.user.reload();
      await cred.user.getIdToken(true);
      onUserMutated();
      setPassword('');
      setConfirmPassword('');

      if (!cred.user.emailVerified) {
        setVerifyFeedback({
          type: 'error',
          text: t.unverifiedSignInError,
        });
        return;
      }

      onNotify(t.welcomeBackToast);
      onClose();
    } catch (err) {
      setAuthError(localizeKnownMessage(formatFriendlyFirebaseError(err), lang));
    } finally {
      setAuthBusy(false);
    }
  };

  const handlePasswordReset = async () => {
    setAuthError('');
    setAuthInfo('');
    const emailCheck = validateEmailAddress(email, { allowDisposable: true });
    if (!emailCheck.valid) {
      setAuthError(t.enterEmailFirstReset);
      return;
    }
    setAuthBusy(true);
    try {
      await sendPasswordResetEmail(auth, emailCheck.normalized);
      const resetMsg = `${t.resetLinkSentPrefix} ${emailCheck.normalized}${t.resetLinkSentSuffix}`;
      setAuthInfo(resetMsg);
      onNotify(resetMsg);
    } catch (err) {
      setAuthError(localizeKnownMessage(formatFriendlyFirebaseError(err), lang));
    } finally {
      setAuthBusy(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setAuthError('');
    setAuthInfo('');
    setAuthBusy(true);
    try {
      await signInWithPopup(auth, googleProvider);
      onNotify(t.signedInGoogleToast);
      onClose();
    } catch (err) {
      setAuthError(localizeKnownMessage(formatFriendlyFirebaseError(err), lang));
    } finally {
      setAuthBusy(false);
    }
  };

  const handleResendVerification = async () => {
    const activeUser = auth.currentUser;
    if (!activeUser || resendCooldown > 0) return;
    setVerifyBusy(true);
    setVerifyFeedback(null);
    try {
      await sendEmailVerification(activeUser);
      setResendCooldown(30);
      setVerifyFeedback({
        type: 'info',
        text: `${t.freshVerifySentPrefix} ${activeUser.email}${t.freshVerifySentSuffix}`,
      });
    } catch (err) {
      setVerifyFeedback({
        type: 'error',
        text: localizeKnownMessage(formatFriendlyFirebaseError(err), lang),
      });
    } finally {
      setVerifyBusy(false);
    }
  };

  const handleCheckVerified = async () => {
    setVerifyBusy(true);
    setVerifyFeedback(null);
    try {
      const verified = await onRefreshUser();
      if (!verified) {
        setVerifyFeedback({
          type: 'error',
          text: t.stillNotVerified,
        });
      } else {
        setVerifyFeedback(null);
      }
    } finally {
      setVerifyBusy(false);
    }
  };

  const handleCancelUnverifiedAccount = async () => {
    const activeUser = auth.currentUser;
    if (!activeUser) return;
    setVerifyBusy(true);
    setVerifyFeedback(null);
    try {
      clearPendingSignupProfile();
      await deleteUser(activeUser);
      setEmail('');
      setPassword('');
      setConfirmPassword('');
      setAuthMode('signup');
      onUserMutated();
      onNotify(t.unverifiedRemoved);
    } catch {
      try {
        await signOut(auth);
        setEmail('');
        setPassword('');
        setConfirmPassword('');
        onUserMutated();
        onNotify(t.signedOutUnverified);
      } catch (err) {
        setVerifyFeedback({
          type: 'error',
          text: localizeKnownMessage(formatFriendlyFirebaseError(err), lang),
        });
      }
    } finally {
      setVerifyBusy(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const activeUser = auth.currentUser;
    if (!activeUser || !isVerifiedFanAccount(activeUser)) return;
    setProfileStatus(null);

    const check = validateProfileUpdateInput({
      displayName,
      mobile,
      city,
      bio,
    });
    if (!check.valid || !check.normalized) {
      setProfileStatus({
        type: 'error',
        text: localizeKnownMessage(
          check.error || 'Enter your real first and last name (4–60 characters).',
          lang,
        ),
      });
      return;
    }

    const finalEmail = (activeUser.email || profile?.email || '').trim().toLowerCase();

    setProfileBusy(true);
    try {
      await ensureFreshVerifiedToken(activeUser);
      await updateProfile(activeUser, { displayName: check.normalized.displayName });
      await upsertUserProfile(
        activeUser.uid,
        {
          displayName: check.normalized.displayName,
          email: finalEmail,
          mobile: check.normalized.mobile,
          city: check.normalized.city,
          favoriteGenre,
          bio: check.normalized.bio,
          favorites: profile?.favorites || guestFavorites,
        },
      );
      onUserMutated();
      profileDirtyRef.current = false;
      onNotify(t.profileSavedToast);
      setProfileStatus({ type: 'success', text: t.profileUpdatedStatus });
    } catch (err) {
      setProfileStatus({
        type: 'error',
        text: localizeKnownMessage(formatFriendlyFirebaseError(err), lang),
      });
    } finally {
      setProfileBusy(false);
    }
  };

  const handleLogout = async () => {
    try {
      clearPendingSignupProfile();
      await signOut(auth);
      setEmail('');
      setPassword('');
      setConfirmPassword('');
      onNotify(t.signedOutToast);
      onClose();
    } catch (err) {
      const msg = localizeKnownMessage(formatFriendlyFirebaseError(err), lang);
      if (isUnverifiedAccount) {
        setVerifyFeedback({ type: 'error', text: msg });
      } else {
        setProfileStatus({ type: 'error', text: msg });
      }
    }
  };

  const modalTitle = isVerifiedAccount
    ? t.fanProfileAccount
    : isUnverifiedAccount
      ? t.verifyYourEmail
      : authMode === 'signin'
        ? t.signIn
        : t.createAccount;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label={modalTitle}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-md bg-[#101218] border border-white/15 rounded-xl shadow-2xl overflow-hidden my-auto">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BrandLogo size="sm" />
            <h2 className="font-display font-bold text-lg text-white">{modalTitle}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.closeAccountAria}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 max-h-[82vh] overflow-y-auto">
          {!user ? (
            <div className="space-y-4">
              {/* Sign In / Sign Up Tab Switcher */}
              <div className="grid grid-cols-2 p-1 rounded-lg bg-[#08090C] border border-white/10">
                <button
                  type="button"
                  onClick={() => switchAuthMode('signin')}
                  className={`py-2 text-xs font-semibold rounded-md transition-colors ${
                    authMode === 'signin'
                      ? 'bg-white text-[#08090C]'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {t.logIn}
                </button>
                <button
                  type="button"
                  onClick={() => switchAuthMode('signup')}
                  className={`py-2 text-xs font-semibold rounded-md transition-colors ${
                    authMode === 'signup'
                      ? 'bg-white text-[#08090C]'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {t.signUp}
                </button>
              </div>

              {authError && (
                <div className="p-3 rounded-lg border border-rose-500/35 bg-rose-500/10 text-xs text-rose-200 flex items-start gap-2 leading-relaxed">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <span>{authError}</span>
                </div>
              )}

              {authInfo && (
                <div className="p-3 rounded-lg border border-emerald-500/35 bg-emerald-500/10 text-xs text-emerald-200 flex items-start gap-2 leading-relaxed">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>{authInfo}</span>
                </div>
              )}

              <form onSubmit={handleEmailAuth} noValidate className="space-y-3.5">
                {authMode === 'signup' && (
                  <>
                    <div>
                      <label htmlFor="auth-name" className="block text-xs font-medium text-slate-300 mb-1.5">
                        {t.fullName} <span className="text-rose-400">*</span>
                      </label>
                      <input
                        id="auth-name"
                        type="text"
                        autoComplete="name"
                        required
                        minLength={4}
                        maxLength={60}
                        value={signupName}
                        onChange={(e) => setSignupName(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-lg bg-[#08090C] border border-white/12 text-sm text-white focus:outline-none focus:border-white/50"
                      />
                    </div>
                    <div>
                      <label htmlFor="auth-mobile" className="block text-xs font-medium text-slate-300 mb-1.5">
                        {t.egyptianMobileLabel} <span className="text-rose-400">*</span>
                      </label>
                      <input
                        id="auth-mobile"
                        type="tel"
                        dir="ltr"
                        autoComplete="tel"
                        required
                        maxLength={20}
                        value={signupMobile}
                        onChange={(e) => setSignupMobile(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-lg bg-[#08090C] border border-white/12 text-sm text-white font-mono-num focus:outline-none focus:border-white/50"
                      />
                      <p className="text-[11px] text-slate-500 mt-1">{t.egyptianMobileHint}</p>
                    </div>
                  </>
                )}

                <div>
                  <label htmlFor="auth-email" className="block text-xs font-medium text-slate-300 mb-1.5">
                    {t.emailAddress} <span className="text-rose-400">*</span>
                  </label>
                  <input
                    id="auth-email"
                    type="email"
                    dir="ltr"
                    autoComplete="email"
                    required
                    maxLength={120}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-lg bg-[#08090C] border border-white/12 text-sm text-white focus:outline-none focus:border-white/50"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label htmlFor="auth-password" className="block text-xs font-medium text-slate-300">
                      {t.passwordLabel} <span className="text-rose-400">*</span>
                    </label>
                    {authMode === 'signin' && (
                      <button
                        type="button"
                        disabled={authBusy}
                        onClick={() => void handlePasswordReset()}
                        className="text-[11px] font-medium text-neutral-300 hover:text-white underline underline-offset-2 decoration-white/30 disabled:opacity-50"
                      >
                        {t.forgotPassword}
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      id="auth-password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'}
                      required
                      minLength={authMode === 'signup' ? 8 : 1}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full ps-3.5 pe-10 py-2.5 rounded-lg bg-[#08090C] border border-white/12 text-sm text-white focus:outline-none focus:border-white/50"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? t.hidePasswordAria : t.showPasswordAria}
                      className="absolute end-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>

                  {authMode === 'signup' && (
                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
                      <span className={`inline-flex items-center gap-1 ${pwStrength.minLength ? 'text-emerald-400' : 'text-slate-500'}`}>
                        <Check className="w-3 h-3" /> {t.pwRuleChars}
                      </span>
                      <span className={`inline-flex items-center gap-1 ${pwStrength.hasLetter ? 'text-emerald-400' : 'text-slate-500'}`}>
                        <Check className="w-3 h-3" /> {t.pwRuleLetter}
                      </span>
                      <span className={`inline-flex items-center gap-1 ${pwStrength.hasNumber ? 'text-emerald-400' : 'text-slate-500'}`}>
                        <Check className="w-3 h-3" /> {t.pwRuleNumber}
                      </span>
                    </div>
                  )}
                </div>

                {authMode === 'signup' && (
                  <div>
                    <label htmlFor="auth-confirm" className="block text-xs font-medium text-slate-300 mb-1.5">
                      {t.confirmPasswordLabel} <span className="text-rose-400">*</span>
                    </label>
                    <input
                      id="auth-confirm"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      required
                      minLength={8}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-lg bg-[#08090C] border border-white/12 text-sm text-white focus:outline-none focus:border-white/50"
                    />
                  </div>
                )}

                {authMode === 'signup' && (
                  <p className="text-[11px] text-slate-400 leading-relaxed">{t.signupVerifyNote}</p>
                )}

                <button
                  type="submit"
                  disabled={authBusy}
                  className="w-full py-2.5 rounded-lg bg-white hover:bg-neutral-200 disabled:opacity-60 text-sm font-semibold text-[#08090C] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                >
                  {authBusy
                    ? t.pleaseWait
                    : authMode === 'signin'
                      ? t.logInWithEmail
                      : t.createAccountSendVerify}
                </button>
              </form>

              <div className="relative flex items-center py-1">
                <div className="flex-1 border-t border-white/10" />
                <span className="px-3 text-[11px] uppercase tracking-wider text-slate-500">
                  {t.orInstantVerified}
                </span>
                <div className="flex-1 border-t border-white/10" />
              </div>

              <button
                type="button"
                disabled={authBusy}
                onClick={handleGoogleSignIn}
                className="w-full py-2.5 px-4 rounded-lg border border-white/20 bg-white/[0.05] text-white hover:bg-white/[0.11] hover:border-white/35 disabled:opacity-60 text-sm font-semibold transition-colors flex items-center justify-center gap-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="#4285F4"
                    d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96z"
                  />
                </svg>
                {t.continueWithGoogle}
              </button>
            </div>
          ) : isUnverifiedAccount ? (
            <div className="space-y-5">
              <div className="p-4 rounded-xl bg-[#08090C] border border-white/10 space-y-2.5">
                <div className="w-10 h-10 rounded-lg bg-white/10 border border-white/20 flex items-center justify-center">
                  <MailCheck className="w-5 h-5 text-white" />
                </div>
                <h3 className="font-display font-bold text-base text-white">
                  {t.confirmEmailHeading}
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {t.confirmEmailBodyPrefix}{' '}
                  <strong className="text-white" dir="ltr">
                    {user.email}
                  </strong>
                  {t.confirmEmailBodySuffix}
                </p>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  {t.confirmEmailProfileNote}
                </p>
              </div>

              {verifyFeedback && (
                <div
                  className={`p-3 rounded-lg border text-xs flex items-start gap-2 leading-relaxed ${
                    verifyFeedback.type === 'error'
                      ? 'border-rose-500/35 bg-rose-500/10 text-rose-200'
                      : 'border-emerald-500/35 bg-emerald-500/10 text-emerald-200'
                  }`}
                >
                  {verifyFeedback.type === 'error' ? (
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  )}
                  <span>{verifyFeedback.text}</span>
                </div>
              )}

              <div className="space-y-2.5">
                <button
                  type="button"
                  disabled={verifyBusy}
                  onClick={() => void handleCheckVerified()}
                  className="w-full py-2.5 rounded-lg bg-white hover:bg-neutral-200 disabled:opacity-60 text-sm font-semibold text-[#08090C] transition-colors inline-flex items-center justify-center gap-2"
                >
                  <RefreshCw className={`w-4 h-4 ${verifyBusy ? 'animate-spin' : ''}`} />
                  {verifyBusy ? t.checking : t.iveVerifiedEmail}
                </button>

                <button
                  type="button"
                  disabled={verifyBusy || resendCooldown > 0}
                  onClick={() => void handleResendVerification()}
                  className="w-full py-2.5 rounded-lg border border-white/12 bg-white/[0.04] hover:bg-white/[0.08] disabled:opacity-50 text-xs font-semibold text-white transition-colors"
                >
                  {resendCooldown > 0
                    ? `${t.resendVerification} (${resendCooldown}s)`
                    : t.resendVerification}
                </button>
              </div>

              <div className="pt-3 border-t border-white/10 flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  disabled={verifyBusy}
                  onClick={() => void handleCancelUnverifiedAccount()}
                  className="inline-flex items-center gap-1.5 text-xs text-rose-400 hover:text-rose-300 disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {t.wrongEmailCancel}
                </button>
                <button
                  type="button"
                  disabled={verifyBusy}
                  onClick={() => void handleLogout()}
                  className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white disabled:opacity-50"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  {t.signOut}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Verified Account Summary Header */}
              <div className="flex items-center justify-between gap-3 pb-4 border-b border-white/10">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-11 h-11 rounded-full bg-white/10 border border-white/25 flex items-center justify-center font-display font-bold text-white text-base shrink-0">
                    {(displayName || user.email || 'G').charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-sm text-white truncate">
                      {displayName || 'Gen Z Fan'}
                    </p>
                    <p className="text-xs text-slate-400 truncate font-mono-num" dir="ltr">
                      {user.email}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void handleLogout()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/12 text-xs font-medium text-slate-300 hover:text-white hover:bg-white/[0.06] shrink-0"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  {t.logOut}
                </button>
              </div>

              {/* Verified Account Metrics */}
              <div className="flex items-center justify-between text-xs text-slate-300 bg-[#08090C] border border-white/8 rounded-lg px-3.5 py-2.5">
                <span className="inline-flex items-center gap-1.5 font-medium text-emerald-400">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {t.verifiedAccount}
                </span>
                <div className="flex items-center gap-4 font-mono-num">
                  <span>
                    {ticketsCount} {t.ticketsWord}
                  </span>
                  <span>
                    {favoritesCount} {t.savedLabel}
                  </span>
                </div>
              </div>

              {/* Profile Management Form */}
              <form onSubmit={handleSaveProfile} noValidate className="space-y-3.5">
                <div>
                  <label htmlFor="prof-name" className="block text-xs font-medium text-slate-300 mb-1.5">
                    {t.fullName}
                  </label>
                  <input
                    id="prof-name"
                    type="text"
                    required
                    minLength={4}
                    maxLength={60}
                    value={displayName}
                    onChange={(e) => {
                      profileDirtyRef.current = true;
                      setDisplayName(e.target.value);
                    }}
                    className="w-full px-3.5 py-2 rounded-lg bg-[#08090C] border border-white/12 text-sm text-white focus:outline-none focus:border-white/50"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="prof-mobile" className="block text-xs font-medium text-slate-300 mb-1.5">
                      {t.mobileNumber}
                    </label>
                    <input
                      id="prof-mobile"
                      type="tel"
                      dir="ltr"
                      maxLength={20}
                      value={mobile}
                      onChange={(e) => {
                        profileDirtyRef.current = true;
                        setMobile(e.target.value);
                      }}
                      className="w-full px-3.5 py-2 rounded-lg bg-[#08090C] border border-white/12 text-sm text-white font-mono-num focus:outline-none focus:border-white/50"
                    />
                  </div>
                  <div>
                    <label htmlFor="prof-city" className="block text-xs font-medium text-slate-300 mb-1.5">
                      {t.cityLabel}
                    </label>
                    <input
                      id="prof-city"
                      type="text"
                      maxLength={60}
                      value={city}
                      onChange={(e) => {
                        profileDirtyRef.current = true;
                        setCity(e.target.value);
                      }}
                      className="w-full px-3.5 py-2 rounded-lg bg-[#08090C] border border-white/12 text-sm text-white focus:outline-none focus:border-white/50"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="prof-genre" className="block text-xs font-medium text-slate-300 mb-1.5">
                    {t.favoriteMusicVibe}
                  </label>
                  <select
                    id="prof-genre"
                    value={favoriteGenre}
                    onChange={(e) => {
                      profileDirtyRef.current = true;
                      setFavoriteGenre(e.target.value);
                    }}
                    className="w-full px-3.5 py-2 rounded-lg bg-[#08090C] border border-white/12 text-sm text-white focus:outline-none focus:border-white/50"
                  >
                    {GENRE_OPTIONS.map((g) => (
                      <option key={g} value={g}>
                        {getGenreLabel(g, lang)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="prof-bio" className="block text-xs font-medium text-slate-300 mb-1.5">
                    {t.bioCrewNote}
                  </label>
                  <textarea
                    id="prof-bio"
                    rows={2}
                    maxLength={300}
                    value={bio}
                    onChange={(e) => {
                      profileDirtyRef.current = true;
                      setBio(e.target.value);
                    }}
                    className="w-full px-3.5 py-2 rounded-lg bg-[#08090C] border border-white/12 text-sm text-white focus:outline-none focus:border-white/50 resize-none"
                  />
                </div>

                {profileStatus && (
                  <p
                    className={`text-xs rounded-lg px-3 py-2 border ${
                      profileStatus.type === 'error'
                        ? 'text-rose-200 bg-rose-500/10 border-rose-500/35'
                        : 'text-emerald-200 bg-emerald-500/10 border-emerald-500/35'
                    }`}
                  >
                    {profileStatus.text}
                  </p>
                )}

                <div className="flex items-center gap-2.5 pt-1">
                  <button
                    type="submit"
                    disabled={profileBusy}
                    className="flex-1 py-2.5 rounded-lg bg-white hover:bg-neutral-200 disabled:opacity-60 text-sm font-semibold text-[#08090C] transition-colors"
                  >
                    {profileBusy ? t.saving : t.saveProfile}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenTickets();
                    }}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg border border-white/15 bg-white/[0.04] hover:bg-white/[0.1] text-sm font-medium text-white"
                  >
                    <Ticket className="w-4 h-4 text-neutral-300" />
                    {t.ticketsWord}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
