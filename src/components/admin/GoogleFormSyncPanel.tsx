import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  FileText,
  Link2,
  Loader2,
  LogOut,
  RefreshCw,
  RotateCcw,
  SlidersHorizontal,
} from 'lucide-react';
import { formatFriendlyFirebaseError } from '../../firebase';
import { useLanguage } from '../../i18n/LanguageContext';
import {
  formatCurrencyEgp,
  getTierCopy,
  localizeKnownMessage,
} from '../../i18n/translations';
import { adminBulkImportOfflineBookings } from '../../services/firestoreService';
import {
  clearCachedFormsAccessToken,
  connectGoogleFormsAccount,
  fetchAllGoogleFormResponses,
  fetchGoogleFormSchema,
  getCachedFormsAccessToken,
  getCachedFormsAccountEmail,
  GoogleFormsApiError,
  subscribeFormsAuthChange,
} from '../../services/googleFormsService';
import type { Concert, PaymentStatus } from '../../types';
import { getTierColorHex, isSafeHttpsUrl } from '../../utils/bookingLogic';
import {
  autoMapFormQuestions,
  DEFAULT_OFFLINE_FORM_EDIT_URL,
  DEFAULT_OFFLINE_FORM_ID,
  DEFAULT_OFFLINE_FORM_PUBLIC_URL,
  extractGoogleFormId,
  mapGoogleFormResponsesToBookings,
  type GoogleFormFieldMapping,
  type GoogleFormRawResponse,
  type GoogleFormSchema,
} from '../../utils/googleFormsMapper';

const STORAGE_FORM_INPUT_KEY = 'genz_bound_google_form_v1';

interface GoogleFormSyncPanelProps {
  concerts: Concert[];
  activeConcert: Concert | null;
  selectedConcertId: string;
  onSelectConcertId: (concertId: string) => void;
  existingCodes: Set<string>;
  adminName: string;
  adminEmail: string;
  canViewRevenueAnalytics: boolean;
  onNotify: (msg: string) => void;
}

function loadSavedFormInput(): string {
  try {
    const raw = window.localStorage.getItem(STORAGE_FORM_INPUT_KEY);
    if (raw && raw.trim()) return raw.trim();
  } catch {
    // ignore storage failures in restricted browsers
  }
  return DEFAULT_OFFLINE_FORM_EDIT_URL;
}

function saveFormInput(value: string): void {
  try {
    window.localStorage.setItem(STORAGE_FORM_INPUT_KEY, value.trim());
  } catch {
    // ignore storage failures
  }
}

export const GoogleFormSyncPanel: React.FC<GoogleFormSyncPanelProps> = ({
  concerts,
  activeConcert,
  selectedConcertId,
  onSelectConcertId,
  existingCodes,
  adminName,
  adminEmail,
  canViewRevenueAnalytics,
  onNotify,
}) => {
  const { lang, isAr } = useLanguage();

  // Bound Google Form URL/ID (non-sensitive preference; OAuth token is strictly in memory only)
  const [formInput, setFormInput] = useState<string>(() => loadSavedFormInput());
  const [accessToken, setAccessToken] = useState<string | null>(() => getCachedFormsAccessToken());
  const [connectedEmail, setConnectedEmail] = useState<string | null>(() =>
    getCachedFormsAccountEmail(),
  );

  // Live fetched form schema + responses
  const [formSchema, setFormSchema] = useState<GoogleFormSchema | null>(null);
  const [rawResponses, setRawResponses] = useState<GoogleFormRawResponse[]>([]);
  const [mapping, setMapping] = useState<GoogleFormFieldMapping | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string>('');

  // Controls & status
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('Paid');
  const [deductSeats, setDeductSeats] = useState<boolean>(true);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(false);
  const [showMappingEditor, setShowMappingEditor] = useState<boolean>(false);
  const [connecting, setConnecting] = useState<boolean>(false);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [importing, setImporting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const syncingRef = useRef<boolean>(false);

  // Keep local state in sync with in-memory token changes (e.g. sign-out or 401 expiry)
  useEffect(() => {
    return subscribeFormsAuthChange(() => {
      setAccessToken(getCachedFormsAccessToken());
      setConnectedEmail(getCachedFormsAccountEmail());
    });
  }, []);

  const parsedFormRef = useMemo(() => extractGoogleFormId(formInput), [formInput]);
  const activeFormId = parsedFormRef.formId;

  // Clear previously loaded form schema/responses if staff switches to a different Form ID
  useEffect(() => {
    if (formSchema && formSchema.formId && activeFormId !== formSchema.formId) {
      setFormSchema(null);
      setRawResponses([]);
      setMapping(null);
      setLastSyncedAt('');
    }
  }, [activeFormId, formSchema]);

  const openFormUrl = useMemo(() => {
    if (formSchema?.responderUri && isSafeHttpsUrl(formSchema.responderUri)) {
      return formSchema.responderUri;
    }
    if (activeFormId === DEFAULT_OFFLINE_FORM_ID) return DEFAULT_OFFLINE_FORM_PUBLIC_URL;
    if (activeFormId) return `https://docs.google.com/forms/d/${encodeURIComponent(activeFormId)}/viewform`;
    return DEFAULT_OFFLINE_FORM_PUBLIC_URL;
  }, [formSchema?.responderUri, activeFormId]);

  const performSync = useCallback(
    async (tokenOverride?: string, silent = false) => {
      if (syncingRef.current) return;
      const token = tokenOverride || getCachedFormsAccessToken();
      if (!token) {
        setErrorMsg(
          isAr
            ? 'يرجى ربط حساب Google Forms أولاً لقراءة ردود الفورم.'
            : 'Please connect Google Forms first to read form responses.',
        );
        return;
      }
      if (!activeFormId) {
        setErrorMsg(
          parsedFormRef.isResponderUrl
            ? isAr
              ? 'هذا رابط العرض العام (/d/e/1FAIpQL...). يرجى لصق رابط التعديل (/forms/d/<ID>/edit) أو الضغط على استعادة الرابط الافتراضي.'
              : 'That is a public responder link (/d/e/1FAIpQL...). Please paste the edit URL (/forms/d/<ID>/edit) or click Reset Default.'
            : isAr
              ? 'رابط أو معرّف Google Form غير صالح.'
              : 'Invalid Google Form URL or ID.',
        );
        return;
      }

      syncingRef.current = true;
      setSyncing(true);
      setErrorMsg('');
      try {
        const [schema, responses] = await Promise.all([
          fetchGoogleFormSchema(activeFormId, token),
          fetchAllGoogleFormResponses(activeFormId, token),
        ]);
        saveFormInput(formInput);
        setFormSchema(schema);
        setRawResponses(responses);
        setMapping((prev) => {
          // Preserve user-customized mapping if same form ID & question IDs still exist
          if (
            prev &&
            formSchema?.formId === schema.formId &&
            schema.questions.some((q) => q.questionId === prev.customerNameQuestionId)
          ) {
            return prev;
          }
          return autoMapFormQuestions(schema.questions);
        });
        setLastSyncedAt(
          new Date().toLocaleTimeString(isAr ? 'ar-EG' : 'en-US', {
            hour: 'numeric',
            minute: '2-digit',
            second: '2-digit',
          }),
        );
        if (!silent) {
          onNotify(
            isAr
              ? `تمت قراءة ${responses.length} رد من فورم «${schema.title}» بنجاح.`
              : `Fetched ${responses.length} response(s) from "${schema.title}".`,
          );
        }
      } catch (err: unknown) {
        if (err instanceof GoogleFormsApiError) {
          if (err.code === 'unauthorized') {
            setAccessToken(null);
            setConnectedEmail(null);
            setErrorMsg(
              isAr
                ? 'انتهت جلسة Google Forms. يرجى إعادة الربط بحساب Google للمتابعة.'
                : err.message,
            );
          } else if (err.code === 'forbidden') {
            setErrorMsg(
              isAr
                ? 'تم رفض الوصول من Google Forms. تأكد من تسجيل الدخول بحساب Google المالك للفورم والموافقة على صلاحية القراءة.'
                : err.message,
            );
          } else if (err.code === 'not_found') {
            setErrorMsg(
              isAr
                ? 'لم يتم العثور على الفورم. تأكد من استخدام رابط التعديل الصحيح (/forms/d/<ID>/edit).'
                : err.message,
            );
          } else {
            setErrorMsg(err.message);
          }
        } else {
          setErrorMsg(
            err instanceof Error
              ? err.message
              : isAr
                ? 'تعذر الاتصال بـ Google Forms.'
                : 'Failed to sync Google Form responses.',
          );
        }
      } finally {
        syncingRef.current = false;
        setSyncing(false);
      }
    },
    [activeFormId, parsedFormRef.isResponderUrl, formInput, formSchema?.formId, isAr, onNotify],
  );

  // Optional live auto-refresh every 60s when connected
  useEffect(() => {
    if (!autoRefresh || !accessToken || !activeFormId) return;
    const timer = window.setInterval(() => {
      void performSync(accessToken, true);
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [autoRefresh, accessToken, activeFormId, performSync]);

  const handleConnectGoogleForms = async () => {
    setConnecting(true);
    setErrorMsg('');
    try {
      const { accessToken: freshToken, email } = await connectGoogleFormsAccount(adminEmail);
      setAccessToken(freshToken);
      setConnectedEmail(email);
      await performSync(freshToken, false);
    } catch (err: unknown) {
      if (err instanceof GoogleFormsApiError && err.code === 'popup_closed') {
        setErrorMsg(
          isAr
            ? 'تم إغلاق نافذة تسجيل الدخول بـ Google قبل إتمام الربط.'
            : 'Google sign-in popup was closed before completing.',
        );
      } else {
        setErrorMsg(
          err instanceof Error
            ? err.message
            : isAr
              ? 'تعذر ربط حساب Google Forms.'
              : 'Could not connect Google Forms.',
        );
      }
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = () => {
    clearCachedFormsAccessToken();
    setAccessToken(null);
    setConnectedEmail(null);
    setAutoRefresh(false);
    onNotify(isAr ? 'تم فصل جلسة Google Forms.' : 'Disconnected Google Forms session.');
  };

  const syncResult = useMemo(() => {
    if (!formSchema || !mapping || !activeConcert) return null;
    return mapGoogleFormResponsesToBookings({
      responses: rawResponses,
      mapping,
      concert: activeConcert,
      adminName,
      existingCodes,
      defaultPaymentStatus: paymentStatus,
      lang,
    });
  }, [formSchema, mapping, activeConcert, rawResponses, adminName, existingCodes, paymentStatus, lang]);

  const handleConfirmImport = async () => {
    if (!syncResult || !activeConcert || syncResult.newBookings.length === 0) return;
    setImporting(true);
    setErrorMsg('');
    try {
      const res = await adminBulkImportOfflineBookings(
        activeConcert.id,
        syncResult.newBookings,
        deductSeats,
      );
      const dupSuffix =
        res.skippedDuplicateCount > 0
          ? isAr
            ? ` (تم تخطي ${res.skippedDuplicateCount} متزامن مسبقاً)`
            : ` (${res.skippedDuplicateCount} already synced)`
          : '';
      const revPart = canViewRevenueAnalytics
        ? ` · ${formatCurrencyEgp(res.importedRevenueEgp, lang)}`
        : '';
      onNotify(
        isAr
          ? `تم استيراد ${res.importedCount} تذكرة جديدة من Google Form (${res.importedTickets.toLocaleString()} تذكرة${revPart})${dupSuffix}.`
          : `Imported ${res.importedCount} new Google Form ticket(s) (${res.importedTickets.toLocaleString()} passes${revPart})${dupSuffix}.`,
      );
    } catch (err: unknown) {
      const friendly = localizeKnownMessage(formatFriendlyFirebaseError(err), lang);
      setErrorMsg(friendly);
      onNotify(friendly);
    } finally {
      setImporting(false);
    }
  };

  const formatTimestamp = (iso: string): string => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString(isAr ? 'ar-EG' : 'en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const mappingFields: Array<{
    key: keyof GoogleFormFieldMapping;
    label: string;
    required?: boolean;
  }> = [
    { key: 'customerNameQuestionId', label: isAr ? 'الاسم (مطلوب)' : 'Buyer Name (Required)', required: true },
    { key: 'mobileQuestionId', label: isAr ? 'رقم الواتساب / الموبايل (مطلوب)' : 'WhatsApp / Mobile (Required)', required: true },
    { key: 'tierQuestionId', label: isAr ? 'فئة التذكرة (مطلوب)' : 'Ticket Tier (Required)', required: true },
    { key: 'outletQuestionId', label: isAr ? 'مركز البيع' : 'Sales Outlet' },
    {
      key: 'otherOutletQuestionId',
      label: isAr ? 'مركز البيع عند اختيار "أخرى"' : 'Custom "Other" Outlet',
    },
    { key: 'quantityQuestionId', label: isAr ? 'العدد (اختياري، الافتراضي ١)' : 'Quantity (Optional, default 1)' },
    { key: 'emailQuestionId', label: isAr ? 'البريد الإلكتروني (اختياري)' : 'Email (Optional)' },
    { key: 'totalAmountQuestionId', label: isAr ? 'المبلغ المخصص (اختياري)' : 'Custom Total EGP (Optional)' },
  ];

  return (
    <section
      aria-label={isAr ? 'مزامنة فورم التذاكر الأوفلاين (Google Form)' : 'Google Form Offline Ticket Sync'}
      className="bg-[#101218] border border-white/15 rounded-xl p-5 space-y-4"
    >
      {/* Top Bar: Title, Bound Form Badge, Connection Actions */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-violet-500/15 border border-violet-400/30 text-violet-300 shrink-0">
              <FileText className="w-4 h-4" />
            </span>
            <h3 className="font-display font-bold text-base text-white">
              {isAr
                ? 'مزامنة فورم التذاكر الأوفلاين (Google Form)'
                : 'Live Google Form Offline Tickets Sync'}
            </h3>
            {accessToken ? (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-400/30 text-[11px] font-semibold text-emerald-300">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                {isAr ? 'متصل' : 'Connected'}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-white/[0.05] border border-white/15 text-[11px] font-medium text-slate-300">
                {isAr ? 'مربوط وجاهز للاتصال' : 'Form Bound · Sign in to Sync'}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            {isAr
              ? 'مربوط مباشرةً بفورم GEN Z EVENTS — يقرأ الأسئلة والردود بدقة (الاسم، الواتساب، الفئة بما فيها Fan Pit، ومركز البيع مع دعم «أخرى») بدون أي تكرار.'
              : 'Bound directly to the GEN Z EVENTS offline form — reads exact questions & submissions (Name, WhatsApp, Tier including Fan Pit, and Sales Outlet with conditional "Other") with automatic duplicate protection.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <a
            href={openFormUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-white/15 bg-white/[0.04] hover:bg-white/[0.09] text-xs font-semibold text-white transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5 text-slate-300" />
            {isAr ? 'فتح الفورم' : 'Open Form'}
          </a>

          {!accessToken ? (
            <button
              type="button"
              disabled={connecting || !activeFormId}
              onClick={() => void handleConnectGoogleForms()}
              className="inline-flex items-center gap-2.5 px-4 py-2 rounded-lg bg-white hover:bg-neutral-100 disabled:opacity-50 text-xs font-semibold text-[#1f1f1f] border border-neutral-300 shadow-sm transition-colors"
            >
              {connecting ? (
                <Loader2 className="w-4 h-4 animate-spin text-[#4285F4]" />
              ) : (
                <svg
                  className="w-4 h-4 shrink-0"
                  viewBox="0 0 48 48"
                  aria-hidden="true"
                >
                  <path
                    fill="#EA4335"
                    d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                  />
                  <path
                    fill="#4285F4"
                    d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                  />
                  <path
                    fill="#34A853"
                    d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                  />
                  <path fill="none" d="M0 0h48v48H0z" />
                </svg>
              )}
              <span>
                {connecting
                  ? isAr
                    ? 'جارٍ الربط بـ Google...'
                    : 'Connecting Google...'
                  : isAr
                    ? 'Sign in with Google · ربط Google Forms'
                    : 'Sign in with Google to Sync Form'}
              </span>
            </button>
          ) : (
            <>
              <button
                type="button"
                disabled={syncing || !activeFormId}
                onClick={() => void performSync(undefined, false)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white hover:bg-neutral-200 disabled:opacity-50 text-xs font-semibold text-[#08090C] transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
                {syncing
                  ? isAr
                    ? 'جارٍ المزامنة...'
                    : 'Syncing...'
                  : isAr
                    ? 'مزامنة الردود الآن'
                    : 'Sync Responses Now'}
              </button>
              <button
                type="button"
                onClick={handleDisconnect}
                title={isAr ? 'فصل جلسة Google Forms' : 'Disconnect Google Forms session'}
                className="inline-flex items-center gap-1 px-2.5 py-2 rounded-lg border border-white/12 bg-white/[0.04] hover:bg-white/[0.09] text-xs text-slate-300 hover:text-white transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{isAr ? 'فصل' : 'Disconnect'}</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Form Binding URL & Target Concert Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 p-3.5 rounded-lg bg-[#08090C] border border-white/10">
        <div className="lg:col-span-6 space-y-1">
          <label
            htmlFor="gf-form-url"
            className="flex items-center justify-between text-[11px] uppercase tracking-wider rtl:tracking-normal text-slate-400 font-semibold"
          >
            <span className="inline-flex items-center gap-1.5">
              <Link2 className="w-3.5 h-3.5 text-violet-300" />
              {isAr ? 'رابط أو معرّف Google Form المربوط' : 'Bound Google Form URL / ID'}
            </span>
            {activeFormId !== DEFAULT_OFFLINE_FORM_ID && (
              <button
                type="button"
                onClick={() => {
                  setFormInput(DEFAULT_OFFLINE_FORM_EDIT_URL);
                  saveFormInput(DEFAULT_OFFLINE_FORM_EDIT_URL);
                }}
                className="inline-flex items-center gap-1 text-[10px] text-amber-300 hover:text-amber-200 normal-case"
              >
                <RotateCcw className="w-3 h-3" />
                {isAr ? 'استعادة الفورم الافتراضي' : 'Reset Default'}
              </button>
            )}
          </label>
          <input
            id="gf-form-url"
            type="text"
            dir="ltr"
            value={formInput}
            onChange={(e) => {
              setFormInput(e.target.value);
              saveFormInput(e.target.value);
            }}
            placeholder={DEFAULT_OFFLINE_FORM_EDIT_URL}
            className="w-full px-3 py-2 rounded-lg bg-[#101218] border border-white/15 text-xs text-white font-mono-num focus:outline-none focus:border-white/50"
          />
          {parsedFormRef.isResponderUrl ? (
            <p className="text-[11px] text-amber-300">
              {isAr
                ? 'استخدم رابط التعديل (/forms/d/<ID>/edit) وليس رابط الرد العام (/d/e/1FAIpQL...).'
                : 'Use the edit link (/forms/d/<ID>/edit), not the public responder link (/d/e/1FAIpQL...).'}
            </p>
          ) : activeFormId ? (
            <p className="text-[11px] text-slate-500 flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span>
                {isAr ? 'معرّف الفورم:' : 'Form ID:'}{' '}
                <span className="font-mono-num text-slate-300" dir="ltr">
                  {activeFormId}
                </span>
              </span>
              {connectedEmail && (
                <span>
                  · {isAr ? 'الحساب:' : 'Account:'}{' '}
                  <span className="text-slate-300" dir="ltr">
                    {connectedEmail}
                  </span>
                </span>
              )}
              {lastSyncedAt && (
                <span>
                  · {isAr ? 'آخر مزامنة:' : 'Last sync:'}{' '}
                  <span className="font-mono-num text-emerald-300">{lastSyncedAt}</span>
                </span>
              )}
            </p>
          ) : (
            <p className="text-[11px] text-rose-300">
              {isAr ? 'أدخل رابط Google Form صحيح.' : 'Enter a valid Google Form URL or ID.'}
            </p>
          )}
        </div>

        <div className="lg:col-span-4 space-y-1">
          <label
            htmlFor="gf-concert"
            className="block text-[11px] uppercase tracking-wider rtl:tracking-normal text-slate-400 font-semibold"
          >
            {isAr ? 'الحفل المرتبط بالتذاكر' : 'Target Concert'}
          </label>
          <select
            id="gf-concert"
            value={selectedConcertId}
            onChange={(e) => onSelectConcertId(e.target.value)}
            disabled={concerts.length === 0}
            className="w-full px-3 py-2 rounded-lg bg-[#101218] border border-white/15 text-xs text-white focus:outline-none focus:border-white/50 disabled:opacity-50"
          >
            {concerts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title} ({c.seatsLeft.toLocaleString()} {isAr ? 'متبقي' : 'left'})
              </option>
            ))}
          </select>
        </div>

        <div className="lg:col-span-2 space-y-1">
          <label
            htmlFor="gf-status"
            className="block text-[11px] uppercase tracking-wider rtl:tracking-normal text-slate-400 font-semibold"
          >
            {isAr ? 'حالة الدفع' : 'Payment Status'}
          </label>
          <select
            id="gf-status"
            value={paymentStatus}
            onChange={(e) => setPaymentStatus(e.target.value as PaymentStatus)}
            className="w-full px-3 py-2 rounded-lg bg-[#101218] border border-white/15 text-xs text-white focus:outline-none focus:border-white/50"
          >
            <option value="Paid">{isAr ? 'مدفوعة (Paid)' : 'Paid'}</option>
            <option value="Pending">{isAr ? 'قيد المراجعة (Pending)' : 'Pending'}</option>
          </select>
        </div>
      </div>

      {/* Options Row when connected */}
      {accessToken && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-4">
            <label className="inline-flex items-center gap-2 text-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={deductSeats}
                onChange={(e) => setDeductSeats(e.target.checked)}
                className="w-4 h-4 rounded border-white/25 bg-[#08090C] accent-white"
              />
              <span>
                {isAr
                  ? 'خصم التذاكر المدفوعة الجديدة من المقاعد المتبقية للحفل'
                  : 'Deduct newly imported paid tickets from concert seats left'}
              </span>
            </label>

            <label className="inline-flex items-center gap-2 text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="w-4 h-4 rounded border-white/25 bg-[#08090C] accent-white"
              />
              <span>
                {isAr ? 'تحديث تلقائي كل ٦٠ ثانية' : 'Auto-refresh every 60s'}
              </span>
            </label>
          </div>

          {formSchema && (
            <button
              type="button"
              onClick={() => setShowMappingEditor((v) => !v)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/12 bg-white/[0.04] hover:bg-white/[0.08] text-xs font-medium text-slate-200"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-violet-300" />
              <span>
                {isAr
                  ? `مطابقة الحقول (${formSchema.questions.length} أسئلة)`
                  : `Field Mapping (${formSchema.questions.length} questions)`}
              </span>
              {showMappingEditor ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>
          )}
        </div>
      )}

      {/* Error Banner */}
      {errorMsg && (
        <div className="p-3 rounded-lg border border-rose-500/35 bg-rose-500/10 text-xs text-rose-200 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-rose-300 shrink-0 mt-0.5" />
          <span className="leading-relaxed">{errorMsg}</span>
        </div>
      )}

      {/* Collapsible Exact Field Mapping Inspector */}
      {showMappingEditor && formSchema && mapping && (
        <div className="p-4 rounded-lg bg-[#08090C] border border-white/12 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-semibold text-white">
                {isAr ? 'مطابقة أسئلة الفورم بدقة' : 'Exact Form Question Mapping'} ·{' '}
                <span className="text-violet-300">{formSchema.title}</span>
              </p>
              <p className="text-[11px] text-slate-400">
                {isAr
                  ? 'تم التعرف التلقائي على أسئلة الفورم. يمكنك مراجعتها أو تعديل أي حقل.'
                  : 'Auto-detected from live Google Form questions. Inspect or override any field below.'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setMapping(autoMapFormQuestions(formSchema.questions))}
              className="text-[11px] text-amber-300 hover:text-amber-200 font-semibold"
            >
              {isAr ? 'إعادة التعرف التلقائي' : 'Auto-Detect Again'}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            {mappingFields.map((field) => (
              <div key={field.key} className="space-y-1">
                <label
                  htmlFor={`gf-map-${field.key}`}
                  className="block text-[11px] font-medium text-slate-300"
                >
                  {field.label}
                </label>
                <select
                  id={`gf-map-${field.key}`}
                  value={mapping[field.key]}
                  onChange={(e) =>
                    setMapping((prev) =>
                      prev ? { ...prev, [field.key]: e.target.value } : prev,
                    )
                  }
                  className="w-full px-2.5 py-1.5 rounded-md bg-[#101218] border border-white/15 text-xs text-white focus:outline-none focus:border-white/50"
                >
                  <option value="">{isAr ? '— غير مربوط —' : '— Not Mapped —'}</option>
                  {formSchema.questions.map((q) => (
                    <option key={q.questionId} value={q.questionId}>
                      {q.title}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sync Results Summary & Preview Table */}
      {formSchema && syncResult && activeConcert && (
        <div className="space-y-3 pt-1">
          {/* Live Form Identity + Precision Stats */}
          <div className={`grid grid-cols-2 ${canViewRevenueAnalytics ? 'lg:grid-cols-4' : 'lg:grid-cols-3'} gap-2.5`}>
            <div className="rounded-lg bg-[#08090C] border border-white/10 px-3.5 py-2.5">
              <p className="text-[10px] uppercase tracking-wider rtl:tracking-normal text-slate-500 font-semibold">
                {isAr ? 'إجمالي ردود الفورم' : 'Total Responses'}
              </p>
              <p className="font-mono-num text-base font-bold text-white mt-0.5">
                {syncResult.totalResponses.toLocaleString()}
              </p>
            </div>
            <div className="rounded-lg bg-[#08090C] border border-emerald-500/25 px-3.5 py-2.5">
              <p className="text-[10px] uppercase tracking-wider rtl:tracking-normal text-emerald-400 font-semibold">
                {isAr ? 'جديدة جاهزة للاستيراد' : 'New Ready to Import'}
              </p>
              <p className="font-mono-num text-base font-bold text-emerald-300 mt-0.5">
                {syncResult.newBookings.length.toLocaleString()}
              </p>
            </div>
            <div className="rounded-lg bg-[#08090C] border border-white/10 px-3.5 py-2.5">
              <p className="text-[10px] uppercase tracking-wider rtl:tracking-normal text-slate-500 font-semibold">
                {isAr ? 'تمت مزامنتها مسبقاً' : 'Already Synced'}
              </p>
              <p className="font-mono-num text-base font-bold text-slate-300 mt-0.5">
                {syncResult.alreadySyncedCount.toLocaleString()}
              </p>
            </div>
            {canViewRevenueAnalytics && (
              <div className="rounded-lg bg-[#08090C] border border-white/10 px-3.5 py-2.5">
                <p className="text-[10px] uppercase tracking-wider rtl:tracking-normal text-slate-500 font-semibold">
                  {isAr ? 'إيرادات الردود الجديدة' : 'New Revenue'}
                </p>
                <p className="font-modern-price text-base font-bold tracking-tight rtl:tracking-normal text-white mt-0.5">
                  {formatCurrencyEgp(syncResult.newRevenueEgp, lang)}
                </p>
              </div>
            )}
          </div>

          {/* Skipped Rows Diagnostics */}
          {syncResult.skippedRows.length > 0 && (
            <div className="p-3 rounded-lg border border-amber-400/30 bg-amber-400/10 space-y-1 max-h-32 overflow-y-auto">
              <p className="text-xs font-semibold text-amber-200 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                {isAr
                  ? `تم تخطي ${syncResult.skippedRows.length} رد بسبب بيانات ناقصة أو غير صالحة:`
                  : `${syncResult.skippedRows.length} response(s) skipped due to incomplete or invalid fields:`}
              </p>
              {syncResult.skippedRows.slice(0, 15).map((row) => (
                <p key={row.responseId} className="text-[11px] text-amber-100/90">
                  <span className="font-mono-num font-bold">#{row.rowIndex}:</span> {row.skipReason}
                </p>
              ))}
            </div>
          )}

          {/* New Responses Preview Table */}
          {syncResult.newBookings.length > 0 ? (
            <>
              <div className="border border-white/10 rounded-lg overflow-hidden">
                <div className="overflow-x-auto max-h-64">
                  <table className="w-full text-start text-xs">
                    <thead className="bg-[#0B0D12] text-slate-400 uppercase tracking-wider text-[10px] sticky top-0">
                      <tr>
                        <th className="px-3 py-2.5 text-start">{isAr ? 'الكود' : 'Code'}</th>
                        <th className="px-3 py-2.5 text-start">{isAr ? 'العميل / الواتساب' : 'Buyer & WhatsApp'}</th>
                        <th className="px-3 py-2.5 text-start">{isAr ? 'الفئة' : 'Tier'}</th>
                        <th className="px-3 py-2.5 text-start">{isAr ? 'مركز البيع' : 'Sales Outlet'}</th>
                        <th className="px-3 py-2.5 text-start">{isAr ? 'السعر' : 'Total'}</th>
                        <th className="px-3 py-2.5 text-start">{isAr ? 'وقت التسجيل' : 'Submitted'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/8 bg-[#08090C]/60">
                      {syncResult.rows
                        .filter((r) => r.status === 'new' && r.booking)
                        .slice(0, 50)
                        .map((row) => {
                          const b = row.booking!;
                          const tierHex = getTierColorHex(activeConcert, b.tier);
                          return (
                            <tr key={row.responseId}>
                              <td className="px-3 py-2 font-mono-num font-semibold text-white whitespace-nowrap" dir="ltr">
                                {b.bookingCode}
                              </td>
                              <td className="px-3 py-2">
                                <span className="text-white font-medium block">{b.customerName}</span>
                                <span className="text-[11px] font-mono-num text-slate-400" dir="ltr">
                                  {b.customerMobile}
                                </span>
                              </td>
                              <td className="px-3 py-2 whitespace-nowrap">
                                <span
                                  className="inline-flex items-center gap-1.5 font-semibold"
                                  style={{ color: tierHex }}
                                >
                                  <span
                                    className="w-2 h-2 rounded-full"
                                    style={{ backgroundColor: tierHex }}
                                  />
                                  {b.quantity > 1 ? `${b.quantity}x ` : ''}
                                  {getTierCopy(b.tier, lang).name}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-slate-200">{b.transferRef}</td>
                              <td className="px-3 py-2 font-modern-price font-semibold text-white whitespace-nowrap">
                                {formatCurrencyEgp(b.totalEgp, lang)}
                              </td>
                              <td className="px-3 py-2 text-[11px] text-slate-400 whitespace-nowrap">
                                {formatTimestamp(row.submittedAt)}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
                {syncResult.newBookings.length > 50 && (
                  <div className="px-3 py-2 bg-[#0B0D12] border-t border-white/8 text-[11px] text-slate-400">
                    {isAr
                      ? `عرض أول ٥٠ رد جديد من إجمالي ${syncResult.newBookings.length}. سيتم استيراد الجميع.`
                      : `Showing first 50 of ${syncResult.newBookings.length} new responses. All will be imported.`}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <p className="text-xs text-slate-400">
                  {isAr
                    ? `جاهز لحفظ ${syncResult.newBookings.length} تذكرة جديدة لحفل «${activeConcert.title}» (${syncResult.newTicketsCount} تذكرة).`
                    : `Ready to save ${syncResult.newBookings.length} new form submission(s) to "${activeConcert.title}" (${syncResult.newTicketsCount} pass(es)).`}
                </p>
                <button
                  type="button"
                  disabled={importing}
                  onClick={() => void handleConfirmImport()}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-xs font-semibold text-white transition-colors"
                >
                  {importing ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  )}
                  {importing
                    ? isAr
                      ? 'جارٍ الحفظ في قاعدة البيانات...'
                      : 'Importing to Firestore...'
                    : isAr
                      ? `تأكيد واستيراد ${syncResult.newBookings.length} تذكرة جديدة`
                      : `Confirm & Import ${syncResult.newBookings.length} New Ticket(s)`}
                </button>
              </div>
            </>
          ) : (
            <div className="p-3.5 rounded-lg border border-emerald-500/25 bg-emerald-500/10 text-xs text-emerald-200 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>
                {syncResult.totalResponses === 0
                  ? isAr
                    ? 'تم الاتصال بالفورم بنجاح — لا توجد ردود مسجلة في Google Form حتى الآن.'
                    : 'Connected to Google Form — no responses have been submitted yet.'
                  : isAr
                    ? `جميع الردود الصالحة (${syncResult.alreadySyncedCount}) متزامنة بالفعل في الموقع ولا توجد تذاكر جديدة معلّقة.`
                    : `All ${syncResult.alreadySyncedCount} valid form response(s) are already synced — you are 100% up to date.`}
              </span>
            </div>
          )}
        </div>
      )}
    </section>
  );
};
