import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Analytics } from '@vercel/analytics/react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { Heart, Search, Shield, SlidersHorizontal } from 'lucide-react';
import {
  AuthProfileModal,
  clearPendingSignupProfile,
  readPendingSignupProfile,
} from './components/AuthProfileModal';
import { BookingModal } from './components/BookingModal';
import { BrandLogo } from './components/BrandLogo';
import { ConcertCard } from './components/ConcertCard';
import { Header } from './components/Header';
import { HeroSection } from './components/HeroSection';
import { PassTiersSection } from './components/PassTiersSection';
import { TicketsModal } from './components/TicketsModal';

const LazyAdminWorkspace = lazy(() =>
  import('./components/admin/AdminWorkspace').then((mod) => ({ default: mod.AdminWorkspace })),
);
import { auth, db, formatFriendlyFirebaseError, handleFirestoreError, OperationType } from './firebase';
import { useLanguage } from './i18n/LanguageContext';
import { buildFooterSubtitle, getGenreLabel, localizeKnownMessage } from './i18n/translations';
import {
  checkIsEmailAdmin,
  createAdminSession,
  removeAdminSession,
  touchAdminSession,
  upsertUserProfile,
} from './services/firestoreService';
import type {
  AdminMember,
  AdminSession,
  Booking,
  Concert,
  PaymentConfig,
  Promo,
  SortOption,
  UserProfile,
  WaitlistEntry,
} from './types';
import {
  DEFAULT_PAYMENT_CONFIG,
  filterAndSortConcerts,
  getNextUpcomingConcert,
  isEmailVerifiedAdminCandidate,
  isVerifiedFanAccount,
  partitionAdminSessions,
  PAYMENT_CONFIG_DOC_ID,
  resolvePaymentConfig,
  sortByCreatedAtDesc,
} from './utils/bookingLogic';
import { copyTextToClipboard } from './utils/passExport';

export default function App() {
  const { lang, t } = useLanguage();
  // Auth & Role State
  const [user, setUser] = useState<User | null>(null);
  const [authRevision, setAuthRevision] = useState(0);
  const [authReady, setAuthReady] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [adminMember, setAdminMember] = useState<AdminMember | null>(null);

  // Live Firestore Data
  const [dbConcerts, setDbConcerts] = useState<Concert[]>([]);
  const [concertsLoaded, setConcertsLoaded] = useState(false);
  const [dbPromos, setDbPromos] = useState<Promo[]>([]);
  const [promosLoaded, setPromosLoaded] = useState(false);
  const [paymentConfig, setPaymentConfig] = useState<PaymentConfig>(DEFAULT_PAYMENT_CONFIG);
  const [userBookings, setUserBookings] = useState<Booking[]>([]);

  // Admin-Only Live Data
  const [adminBookings, setAdminBookings] = useState<Booking[]>([]);
  const [adminWaitlist, setAdminWaitlist] = useState<WaitlistEntry[]>([]);
  const [adminMembers, setAdminMembers] = useState<AdminMember[]>([]);
  const [adminSessions, setAdminSessions] = useState<AdminSession[]>([]);

  // Storefront UI State
  const [guestFavorites, setGuestFavorites] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGenre, setSelectedGenre] = useState('All');
  const [sortBy, setSortBy] = useState<SortOption>('date-asc');
  const [savedOnly, setSavedOnly] = useState(false);

  // Modals & Views
  const [bookingConcert, setBookingConcert] = useState<Concert | null>(null);
  const [ticketsOpen, setTicketsOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [adminPortalOpen, setAdminPortalOpen] = useState(false);

  // Toast Feedback
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const sessionIdRef = useRef(`sess-${Math.random().toString(36).slice(2, 10)}`);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 4000);
  }, []);

  // 1. Firebase Auth Observer
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      setAuthRevision((v) => v + 1);
      setAuthReady(true);
      if (isEmailVerifiedAdminCandidate(nextUser)) {
        const member = await checkIsEmailAdmin(nextUser?.email);
        setAdminMember(member);
      } else {
        setAdminMember(null);
        setAdminPortalOpen(false);
      }
    });
    return () => unsub();
  }, []);

  const handleUserMutated = useCallback(() => {
    setUser(auth.currentUser);
    setAuthRevision((v) => v + 1);
  }, []);

  const handleRefreshUser = useCallback(async (): Promise<boolean> => {
    const current = auth.currentUser;
    if (!current) return false;
    try {
      await current.reload();
      await current.getIdToken(true);
      const refreshed = auth.currentUser;
      setUser(refreshed);
      setAuthRevision((v) => v + 1);
      if (isEmailVerifiedAdminCandidate(refreshed)) {
        const member = await checkIsEmailAdmin(refreshed?.email);
        setAdminMember(member);
        showToast(t.toastEmailVerified);
        return true;
      }
      return isVerifiedFanAccount(refreshed);
    } catch (err) {
      showToast(localizeKnownMessage(formatFriendlyFirebaseError(err), lang));
      return false;
    }
  }, [showToast, t.toastEmailVerified, lang]);

  // 2. Public Storefront Firestore Listeners (strictly live database records)
  useEffect(() => {
    const unsubConcerts = onSnapshot(
      collection(db, 'concerts'),
      (snap) => {
        const list = snap.docs.map((d) => d.data() as Concert);
        setDbConcerts(list);
        setConcertsLoaded(true);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'concerts'),
    );

    const unsubPromos = onSnapshot(
      collection(db, 'promos'),
      (snap) => {
        setDbPromos(snap.docs.map((d) => d.data() as Promo));
        setPromosLoaded(true);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'promos'),
    );

    const unsubPaymentConfig = onSnapshot(
      doc(db, 'paymentConfig', PAYMENT_CONFIG_DOC_ID),
      (snap) => {
        if (snap.exists()) {
          setPaymentConfig(resolvePaymentConfig(snap.data() as Partial<PaymentConfig>));
        } else {
          setPaymentConfig(DEFAULT_PAYMENT_CONFIG);
        }
      },
      () => {
        // Gracefully keep default payment numbers if doc read encounters a transient issue
        setPaymentConfig(DEFAULT_PAYMENT_CONFIG);
      },
    );

    return () => {
      unsubConcerts();
      unsubPromos();
      unsubPaymentConfig();
    };
  }, []);

  // 4. Verified Fan Private Profile & Bookings Listeners (email-verified accounts only)
  const isVerifiedUser = isVerifiedFanAccount(user);
  const guestFavoritesRef = useRef<string[]>([]);
  guestFavoritesRef.current = guestFavorites;
  const profileAutoCreateAttemptedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!authReady || !user || !isVerifiedUser) {
      setProfile(null);
      setUserBookings([]);
      profileAutoCreateAttemptedRef.current = null;
      return;
    }

    const uid = user.uid;
    const userRef = doc(db, 'users', uid);
    const unsubProfile = onSnapshot(
      userRef,
      (snap) => {
        if (snap.exists()) {
          setProfile(snap.data() as UserProfile);
          clearPendingSignupProfile();
          if (guestFavoritesRef.current.length > 0) {
            setGuestFavorites([]);
          }
        } else {
          setProfile(null);
          // Only create the Firestore profile AFTER email verification succeeds
          if (profileAutoCreateAttemptedRef.current !== uid) {
            profileAutoCreateAttemptedRef.current = uid;
            const latest = auth.currentUser;
            if (!latest || latest.uid !== uid || !isVerifiedFanAccount(latest)) return;
            const pending = readPendingSignupProfile(uid);
            const verifiedName = (
              pending?.displayName ||
              latest.displayName ||
              latest.email?.split('@')[0] ||
              'Gen Z Fan'
            )
              .trim()
              .slice(0, 100);
            const verifiedMobile = (pending?.mobile || '').trim().slice(0, 30);
            const verifiedEmail = (latest.email || '').trim().toLowerCase();
            const mergedFavorites = Array.from(
              new Set([...(pending?.favorites || []), ...guestFavoritesRef.current]),
            ).slice(0, 50);

            void upsertUserProfile(uid, {
              displayName: verifiedName.length >= 2 ? verifiedName : 'Gen Z Fan',
              email: verifiedEmail,
              mobile: verifiedMobile,
              city: 'Qena',
              favoriteGenre: 'Indie Pop / Rap',
              bio: '',
              favorites: mergedFavorites,
            })
              .then(() => {
                clearPendingSignupProfile();
              })
              .catch(() => {
                // ignore transient duplicate create
              });
          }
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, `users/${uid}`),
    );

    const unsubBookings = onSnapshot(
      query(collection(db, 'bookings'), where('userId', '==', uid)),
      (snap) => {
        setUserBookings(sortByCreatedAtDesc(snap.docs.map((d) => d.data() as Booking)));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'bookings'),
    );

    return () => {
      unsubProfile();
      unsubBookings();
    };
  }, [authReady, user?.uid, isVerifiedUser, authRevision]);

  // 5. Verified Admin Listeners (only active when Admin Portal is open)
  const adminDisplayNameRef = useRef('');
  adminDisplayNameRef.current = profile?.displayName || user?.displayName || adminMember?.name || 'Admin';

  useEffect(() => {
    if (!adminMember || !user?.emailVerified || !adminPortalOpen) {
      setAdminBookings([]);
      setAdminWaitlist([]);
      setAdminMembers([]);
      setAdminSessions([]);
      return;
    }

    const isSuperAdminRole = adminMember.role === 'Super Admin';
    const sid = sessionIdRef.current;
    const prunedSessionIds = new Set<string>();

    const unsubBookings = onSnapshot(
      collection(db, 'bookings'),
      (snap) => setAdminBookings(sortByCreatedAtDesc(snap.docs.map((d) => d.data() as Booking))),
      (err) => handleFirestoreError(err, OperationType.LIST, 'bookings'),
    );

    let unsubWaitlist: (() => void) | null = null;
    let unsubAdmins: (() => void) | null = null;
    let unsubSessions: (() => void) | null = null;

    if (isSuperAdminRole) {
      unsubWaitlist = onSnapshot(
        collection(db, 'waitlist'),
        (snap) => setAdminWaitlist(sortByCreatedAtDesc(snap.docs.map((d) => d.data() as WaitlistEntry))),
        (err) => handleFirestoreError(err, OperationType.LIST, 'waitlist'),
      );
      unsubAdmins = onSnapshot(
        collection(db, 'admins'),
        (snap) => setAdminMembers(snap.docs.map((d) => d.data() as AdminMember)),
        (err) => handleFirestoreError(err, OperationType.LIST, 'admins'),
      );
      unsubSessions = onSnapshot(
        collection(db, 'adminSessions'),
        (snap) => {
          const allSessions = snap.docs.map((d) => d.data() as AdminSession);
          const { active, stale } = partitionAdminSessions(allSessions);
          setAdminSessions(active);
          for (const old of stale) {
            if (old.id !== sid && !prunedSessionIds.has(old.id)) {
              prunedSessionIds.add(old.id);
              void removeAdminSession(old.id);
            }
          }
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'adminSessions'),
      );
    } else {
      setAdminWaitlist([]);
      setAdminMembers([]);
      setAdminSessions([]);
    }

    void createAdminSession(
      sid,
      user.uid,
      adminDisplayNameRef.current,
      user.email || '',
      adminMember.role,
    ).catch(() => {});

    const heartbeatId = window.setInterval(() => {
      void touchAdminSession(sid, adminDisplayNameRef.current, adminMember.role);
    }, 2 * 60 * 1000);

    const handlePageHide = () => {
      void removeAdminSession(sid);
    };
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      window.clearInterval(heartbeatId);
      window.removeEventListener('pagehide', handlePageHide);
      unsubBookings();
      unsubWaitlist?.();
      unsubAdmins?.();
      unsubSessions?.();
      void removeAdminSession(sid);
    };
  }, [adminMember, user?.uid, user?.email, user?.emailVerified, adminPortalOpen]);

  // Keyboard shortcut: Ctrl/Cmd + Shift + A for Staff Portal
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        if (adminMember && user?.emailVerified) {
          setAdminPortalOpen((v) => !v);
        } else {
          setAuthModalOpen(true);
          showToast(t.toastNeedOrganizerSignIn);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [adminMember, user?.emailVerified, showToast, t.toastNeedOrganizerSignIn]);

  // Storefront Collections — strictly live Firestore documents (no hardcoded seed fallback)
  const isLoadingInitial = !concertsLoaded || !promosLoaded;
  const concerts = dbConcerts;
  const promos = dbPromos;

  // Keep open BookingModal in sync if an admin edits or removes that concert
  useEffect(() => {
    if (!bookingConcert) return;
    const latest = concerts.find((c) => c.id === bookingConcert.id);
    if (!latest) {
      setBookingConcert(null);
      showToast(t.toastConcertRemoved);
    } else if (latest !== bookingConcert) {
      setBookingConcert(latest);
    }
  }, [concerts, bookingConcert, showToast, t.toastConcertRemoved]);

  const activePromos = useMemo(() => promos.filter((p) => p.active), [promos]);
  const favorites = profile ? profile.favorites : guestFavorites;
  const activeFavoriteIds = useMemo(() => {
    const liveIds = new Set(concerts.map((c) => c.id));
    return favorites.filter((id) => liveIds.has(id));
  }, [concerts, favorites]);

  const genres = useMemo(() => {
    const unique = Array.from(new Set(concerts.map((c) => c.genre)));
    return ['All', ...unique];
  }, [concerts]);

  // Reset genre filter if an admin deletes the last concert in that genre
  useEffect(() => {
    if (selectedGenre !== 'All' && !genres.includes(selectedGenre)) {
      setSelectedGenre('All');
    }
  }, [genres, selectedGenre]);

  const filteredConcerts = useMemo(
    () =>
      filterAndSortConcerts(concerts, {
        search: searchQuery,
        genre: selectedGenre,
        sortBy,
        savedOnly,
        favorites,
      }),
    [concerts, searchQuery, selectedGenre, sortBy, savedOnly, favorites],
  );

  const nextConcert = useMemo(() => getNextUpcomingConcert(concerts), [concerts]);

  const handleToggleFavorite = async (concertId: string) => {
    const exists = favorites.includes(concertId);
    const nextFavs = exists
      ? favorites.filter((id) => id !== concertId)
      : Array.from(new Set([...favorites, concertId])).slice(0, 50);

    if (isVerifiedUser && user) {
      try {
        await upsertUserProfile(
          user.uid,
          {
            displayName: profile?.displayName || user.displayName || user.email?.split('@')[0] || 'Gen Z Fan',
            email: (user.email || profile?.email || '').trim().toLowerCase(),
            mobile: profile?.mobile || '',
            city: profile?.city || 'Qena',
            favoriteGenre: profile?.favoriteGenre || 'Indie Pop / Rap',
            bio: profile?.bio || '',
            favorites: nextFavs,
          },
        );
      } catch (err) {
        showToast(localizeKnownMessage(formatFriendlyFirebaseError(err), lang));
        return;
      }
    } else {
      setGuestFavorites(nextFavs);
    }
    showToast(exists ? t.toastRemovedFav : t.toastAddedFav);
  };

  const handleOpenStaffPortal = () => {
    if (adminMember && user?.emailVerified) {
      setAdminPortalOpen(true);
    } else {
      setAuthModalOpen(true);
      showToast(t.toastNeedOrganizerSignIn);
    }
  };

  const displayName = useMemo(
    () => profile?.displayName || auth.currentUser?.displayName || user?.displayName || '',
    [profile?.displayName, user?.displayName, authRevision],
  );
  const isSuperAdmin = Boolean(adminMember?.role === 'Super Admin' && user?.emailVerified);

  // Full-screen Staff Command Center Mode (lazy-loaded strictly for verified staff)
  if (adminPortalOpen && adminMember && user?.emailVerified) {
    return (
      <>
        <Suspense
          fallback={
            <div className="min-h-screen bg-[#08090C] text-slate-300 flex items-center justify-center text-sm">
              {t.pleaseWait}
            </div>
          }
        >
          <LazyAdminWorkspace
            concerts={dbConcerts}
            bookings={adminBookings}
            promos={dbPromos}
            waitlist={adminWaitlist}
            admins={adminMembers}
            sessions={adminSessions}
            adminName={displayName || adminMember.name}
            adminEmail={user.email || adminMember.email}
            adminRole={adminMember.role}
            isVerifiedStaff={Boolean(adminMember && user?.emailVerified)}
            onExit={() => setAdminPortalOpen(false)}
            onNotify={showToast}
          />
        </Suspense>
        {toast && (
          <div
            role="status"
            aria-live="polite"
            className="fixed bottom-5 end-5 z-[70] max-w-sm px-4 py-3 rounded-lg bg-[#171A23] border border-white/15 text-xs font-medium text-white shadow-2xl"
          >
            {toast}
          </div>
        )}
        <Analytics />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-[#08090C] text-[#F5F6F8] flex flex-col">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:start-3 focus:z-[100] focus:px-4 focus:py-2.5 focus:rounded-lg focus:bg-white focus:text-[#08090C] focus:text-xs focus:font-bold focus:shadow-xl"
      >
        {lang === 'ar' ? 'الانتقال إلى المحتوى الرئيسي' : 'Skip to main content'}
      </a>
      <Header
        user={user}
        displayName={displayName}
        ticketCount={userBookings.length}
        isAdmin={Boolean(adminMember && user?.emailVerified)}
        onOpenTickets={() => setTicketsOpen(true)}
        onOpenAuthProfile={() => setAuthModalOpen(true)}
        onOpenAdmin={handleOpenStaffPortal}
      />

      <main id="main-content" className="flex-1">
        <HeroSection
          nextConcert={nextConcert}
          activePromos={activePromos}
          onBookConcert={(c) => setBookingConcert(c)}
          onCopyPromo={(code) => {
            void copyTextToClipboard(code).then(() => {
              showToast(`${t.toastCopiedPromoPrefix} ${code} ${t.toastCopiedPromoSuffix}`);
            });
          }}
        />

        {/* Section 2: Concert Lineup Explorer */}
        <section id="lineup" className="py-14 sm:py-18">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
              <div className="space-y-1.5">
                <p className="text-xs uppercase tracking-[0.2em] rtl:tracking-normal text-neutral-400 font-semibold">
                  {t.calendarKicker}
                </p>
                <h2 className="font-display font-bold text-2xl sm:text-3xl text-white">
                  {t.upcomingLiveShows}
                </h2>
              </div>

              {/* Search & Sort Controls */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full md:w-auto">
                <div className="relative flex-1 sm:w-64">
                  <Search className="w-4 h-4 text-slate-500 absolute start-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={t.searchConcertsPlaceholder}
                    aria-label={t.searchConcertsAria}
                    className="w-full ps-10 pe-3.5 py-2.5 rounded-lg bg-[#101218] border border-white/12 text-xs sm:text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-white/50"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative flex-1 sm:flex-initial">
                    <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as SortOption)}
                      aria-label={t.sortConcertsAria}
                      className="w-full ps-8 pe-3 py-2.5 rounded-lg bg-[#101218] border border-white/12 text-xs font-medium text-white focus:outline-none focus:border-white/50"
                    >
                      <option value="date-asc">{t.sortSoonest}</option>
                      <option value="price-asc">{t.sortPriceAsc}</option>
                      <option value="price-desc">{t.sortPriceDesc}</option>
                    </select>
                  </div>

                  <button
                    type="button"
                    onClick={() => setSavedOnly((v) => !v)}
                    aria-pressed={savedOnly}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg border text-xs font-semibold transition-colors whitespace-nowrap ${
                      savedOnly
                        ? 'border-white bg-white text-[#08090C]'
                        : 'border-white/12 bg-[#101218] text-slate-300 hover:text-white hover:border-white/25'
                    }`}
                  >
                    <Heart className={`w-3.5 h-3.5 ${savedOnly ? 'fill-current' : ''}`} />
                    {t.savedLabel} ({activeFavoriteIds.length})
                  </button>
                </div>
              </div>
            </div>

            {/* Genre Filter Strip */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {genres.map((genre) => (
                <button
                  key={genre}
                  type="button"
                  onClick={() => setSelectedGenre(genre)}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                    selectedGenre === genre
                      ? 'bg-white text-[#08090C] font-semibold'
                      : 'text-slate-400 hover:text-white hover:bg-white/[0.05]'
                  }`}
                >
                  {getGenreLabel(genre, lang)}
                </button>
              ))}
            </div>

            {/* Responsive 3-Col Concert Grid */}
            {isLoadingInitial ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6" aria-busy="true">
                {[0, 1, 2].map((idx) => (
                  <div
                    key={idx}
                    className="h-80 rounded-xl bg-[#101218] border border-white/10 animate-pulse"
                  />
                ))}
              </div>
            ) : concerts.length === 0 ? (
              <div className="border border-white/10 bg-[#101218] rounded-xl p-12 text-center space-y-2.5">
                <p className="font-display font-bold text-lg text-white">
                  {t.noConcertsTitle}
                </p>
                <p className="text-sm text-slate-400 max-w-md mx-auto">
                  {t.noConcertsBody}
                </p>
              </div>
            ) : filteredConcerts.length === 0 ? (
              <div className="border border-white/10 bg-[#101218] rounded-xl p-12 text-center space-y-3">
                <p className="font-display font-bold text-lg text-white">{t.noFilterMatchTitle}</p>
                <p className="text-sm text-slate-400">{t.noFilterMatchBody}</p>
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedGenre('All');
                    setSavedOnly(false);
                  }}
                  className="px-4 py-2 rounded-lg bg-white hover:bg-neutral-200 text-xs font-semibold text-[#08090C] transition-colors"
                >
                  {t.resetFilters}
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredConcerts.map((concert) => (
                  <ConcertCard
                    key={concert.id}
                    concert={concert}
                    isFavorite={activeFavoriteIds.includes(concert.id)}
                    onToggleFavorite={(id) => void handleToggleFavorite(id)}
                    onBook={(c) => setBookingConcert(c)}
                    onNotify={showToast}
                  />
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Section 3: Pass Tier Guide */}
        <PassTiersSection concerts={concerts} />
      </main>

      {/* Clean Footer */}
      <footer className="border-t border-white/10 bg-[#06070A] py-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-slate-400">
          <div className="flex items-center gap-3.5">
            <BrandLogo size="md" />
            <div className="space-y-0.5">
              <p className="font-display font-bold text-sm text-white">{t.brandCity}</p>
              <p>{buildFooterSubtitle(lang, paymentConfig)}</p>
            </div>
          </div>
          <div className="flex items-center gap-5">
            <button
              type="button"
              onClick={() => setTicketsOpen(true)}
              className="hover:text-white transition-colors"
            >
              {t.myTickets}
            </button>
            <button
              type="button"
              onClick={() => setAuthModalOpen(true)}
              className="hover:text-white transition-colors"
            >
              {isVerifiedUser ? t.profile : user ? t.verifyEmail : t.signIn}
            </button>
            <button
              type="button"
              onClick={handleOpenStaffPortal}
              className="inline-flex items-center gap-1.5 text-slate-500 hover:text-amber-300 transition-colors"
            >
              <Shield className="w-3.5 h-3.5" />
              {t.staffPortal}
            </button>
          </div>
        </div>
      </footer>

      {/* Modals */}
      <BookingModal
        concert={bookingConcert}
        onClose={() => setBookingConcert(null)}
        promos={promos}
        paymentConfig={paymentConfig}
        isSuperAdmin={isSuperAdmin}
        adminName={displayName || adminMember?.name || user?.email || 'Super Admin'}
        user={user}
        profile={profile}
        onRequireAuth={() => {
          setBookingConcert(null);
          setAuthModalOpen(true);
        }}
        onBookingCreated={(code) => {
          showToast(`${t.toastPassReservedPrefix} (${code})! ${t.toastPassReservedSuffix}`);
          setTicketsOpen(true);
        }}
        onNotify={showToast}
      />

      <TicketsModal
        isOpen={ticketsOpen}
        onClose={() => setTicketsOpen(false)}
        user={user}
        bookings={userBookings}
        concerts={concerts}
        onRequireAuth={() => setAuthModalOpen(true)}
        onNotify={showToast}
      />

      <AuthProfileModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        user={user}
        profile={profile}
        guestFavorites={guestFavorites}
        favoritesCount={activeFavoriteIds.length}
        ticketsCount={userBookings.length}
        onOpenTickets={() => setTicketsOpen(true)}
        onRefreshUser={handleRefreshUser}
        onUserMutated={handleUserMutated}
        onNotify={showToast}
      />

      {/* Toast Notification */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-5 end-5 z-[70] max-w-sm px-4 py-3 rounded-lg bg-[#171A23] border border-white/15 text-xs font-medium text-white shadow-2xl"
        >
          {toast}
        </div>
      )}
      <Analytics />
    </div>
  );
}
