import type { AdminRole, OnlinePaymentMethodId, PaymentConfig, PaymentMethodId, TierId } from '../types';
import { PAYMENT_PHONE_NUMBER } from '../data/defaults';

export type Language = 'en' | 'ar';
export type TextDirection = 'ltr' | 'rtl';

export const LANGUAGE_STORAGE_KEY = 'genz_events_lang';

export function resolveInitialLanguage(stored: string | null | undefined): Language {
  return stored === 'ar' ? 'ar' : 'en';
}

export function getDirection(lang: Language): TextDirection {
  return lang === 'ar' ? 'rtl' : 'ltr';
}

export function formatCurrencyEgp(amount: number, lang: Language): string {
  const formatted = amount.toLocaleString('en-US');
  return lang === 'ar' ? `${formatted} ج.م` : `${formatted} EGP`;
}

export const TIER_COPY: Record<
  Language,
  Record<TierId, { name: string; perk: string; compareLead: string; details: string }>
> = {
  en: {
    Silver: {
      name: 'Silver',
      perk: 'Arena Floor · Clear Stage View',
      compareLead: '',
      details:
        'Enjoy the concert atmosphere on the arena floor with a clear view of the stage and organized entry & exit gates.',
    },
    Gold: {
      name: 'Gold',
      perk: 'Mid-Arena · Closer View & Sound',
      compareLead: '',
      details:
        'Mid-arena — positioned in the central zone closer to the stage with clearer sightlines and sound, complete organization, and secure barriers separating zones.',
    },
    VIP: {
      name: 'Fan Pit',
      perk: 'Right in Front of the Stage',
      compareLead: 'Right in Front of the Stage',
      details:
        'The closest point to the stage so you can live every moment and interact with the concert right from the front row.',
    },
    Lounge: {
      name: 'Lounge',
      perk: 'Front-Side Exclusive Area & Privacy',
      compareLead: '',
      details:
        'A distinguished area on both sides of the front zone next to the stage, combining closeness to the stage with complete privacy away from the crowd.',
    },
  },
  ar: {
    Silver: {
      name: 'سيلفر (Silver)',
      perk: 'أرضية الملعب · رؤية واضحة للمسرح',
      compareLead: '',
      details:
        'استمتع بأجواء الحفلة في أرضية الملعب برؤية واضحة للمسرح، وبوابات دخول وخروج منظمة',
    },
    Gold: {
      name: 'جولد (Gold)',
      perk: 'في نص الملعب · رؤية وصوت أوضح',
      compareLead: '',
      details:
        'في نص الملعب - مكانك في المنطقة الوسطى قريب من المسرح برؤية وصوت أوضح، وسط تنظيم كامل وحواجز آمنة تفصل بين المناطق.',
    },
    VIP: {
      name: 'فان بيت (Fan Pit)',
      perk: 'قدام المسرح على طول',
      compareLead: 'قدام المسرح على طول',
      details:
        'أقرب نقطة للمسرح عشان تعيش كل لحظة وتتفاعل مع الحفلة من أول صف',
    },
    Lounge: {
      name: 'لاونج (Lounge)',
      perk: 'بجوار المسرح · خصوصية كاملة',
      compareLead: '',
      details:
        ' (٢ كرسي + طرابيزه)'
        'مساحة مميزة على جانبي المنطقة الأمامية بجوار المسرح، تجمع بين القرب من المسرح والخصوصية الكاملة بعيداً عن الزحمة.',
    },
  },
};

export function getTierCopy(tier: TierId, lang: Language) {
  return TIER_COPY[lang][tier];
}

export const PAYMENT_COPY: Record<
  Language,
  Record<OnlinePaymentMethodId, { label: string; sub: string; destination: string; instructions: string }>
> = {
  en: {
    InstaPay: {
      label: 'InstaPay',
      sub: 'Instant bank or IPA transfer',
      destination: PAYMENT_PHONE_NUMBER,
      instructions: `Transfer the total via InstaPay to ${PAYMENT_PHONE_NUMBER} and paste your transfer reference or sender mobile below.`,
    },
    'Mobile Wallets': {
      label: 'Mobile Wallets',
      sub: 'Vodafone, Orange, Etisalat, WE Pay',
      destination: PAYMENT_PHONE_NUMBER,
      instructions: `Send the total from any Egyptian Mobile Wallet to ${PAYMENT_PHONE_NUMBER} and enter your SMS receipt reference or wallet number.`,
    },
  },
  ar: {
    InstaPay: {
      label: 'إنستاباي (InstaPay)',
      sub: 'تحويل بنكي فوري أو عبر عنوان الدفع',
      destination: PAYMENT_PHONE_NUMBER,
      instructions: `حوّل إجمالي المبلغ عبر إنستاباي إلى الرقم \u2066${PAYMENT_PHONE_NUMBER}\u2069 ثم أدخل رقم مرجع التحويل أو رقم هاتف المُرسِل بالأسفل.`,
    },
    'Mobile Wallets': {
      label: 'المحافظ الإلكترونية',
      sub: 'فودافون كاش، أورنج، اتصالات، WE Pay',
      destination: PAYMENT_PHONE_NUMBER,
      instructions: `أرسل إجمالي المبلغ من أي محفظة إلكترونية في مصر إلى الرقم \u2066${PAYMENT_PHONE_NUMBER}\u2069 ثم أدخل رقم مرجع الرسالة أو رقم المحفظة بالأسفل.`,
    },
  },
};

export function buildPaymentMethodCopy(
  method: OnlinePaymentMethodId,
  lang: Language,
  paymentConfig?: Pick<PaymentConfig, 'instapayNumber' | 'walletNumber'> | null,
): { label: string; sub: string; destination: string; instructions: string } {
  const base = PAYMENT_COPY[lang][method] || PAYMENT_COPY[lang].InstaPay;
  const instapayDest = paymentConfig?.instapayNumber?.trim() || PAYMENT_PHONE_NUMBER;
  const walletDest = paymentConfig?.walletNumber?.trim() || PAYMENT_PHONE_NUMBER;
  const destination = method === 'InstaPay' ? instapayDest : walletDest;

  if (lang === 'ar') {
    const instructions =
      method === 'InstaPay'
        ? `حوّل إجمالي المبلغ عبر إنستاباي إلى \u2066${destination}\u2069 ثم أدخل رقم مرجع التحويل أو رقم هاتف المُرسِل بالأسفل.`
        : `أرسل إجمالي المبلغ من فودافون كاش أو أي محفظة إلكترونية في مصر إلى الرقم \u2066${destination}\u2069 ثم أدخل رقم مرجع الرسالة أو رقم المحفظة بالأسفل.`;
    return {
      ...base,
      destination,
      instructions,
    };
  }

  const instructions =
    method === 'InstaPay'
      ? `Transfer the total via InstaPay to ${destination} and paste your transfer reference or sender mobile below.`
      : `Send the total from Vodafone Cash or any Egyptian Mobile Wallet to ${destination} and enter your SMS receipt reference or wallet number.`;
  return {
    ...base,
    destination,
    instructions,
  };
}

export function buildFooterSubtitle(
  lang: Language,
  paymentConfig?: Pick<PaymentConfig, 'instapayNumber' | 'walletNumber'> | null,
): string {
  const instapayDest = paymentConfig?.instapayNumber?.trim() || PAYMENT_PHONE_NUMBER;
  const walletDest = paymentConfig?.walletNumber?.trim() || PAYMENT_PHONE_NUMBER;
  if (lang === 'ar') {
    return `إنستاباي: \u2066${instapayDest}\u2069 · فودافون كاش والمحافظ: \u2066${walletDest}\u2069 · حفلات صعيد مصر المباشرة`;
  }
  return `InstaPay: ${instapayDest} · Vodafone Cash & Wallets: ${walletDest} · Upper Egypt Live Productions`;
}

export const TICKET_ENTRY_TERMS: Record<
  Language,
  { title: string; subtitle: string; items: ReadonlyArray<{ number: string; text: string }> }
> = {
  en: {
    title: 'Terms & Conditions',
    subtitle: 'Entry Rules & Gate Instructions',
    items: [
      {
        number: '1',
        text: 'The ticket is valid for single-person, one-time entry only (re-entry is not permitted).',
      },
      {
        number: '2',
        text: 'Please arrive one hour before the concert starts to avoid congestion at the gates.',
      },
      {
        number: '3',
        text: 'Sold tickets are non-refundable and non-exchangeable, except in the event of concert cancellation by the organizers.',
      },
      {
        number: '4',
        text: 'Food and beverages, fireworks, lasers, or any sharp objects are strictly prohibited.',
      },
      {
        number: '5',
        text: 'Please keep your ticket in good condition; damaged or torn tickets are considered invalid.',
      },
      {
        number: '6',
        text: 'Event management is not responsible for lost personal belongings and reserves the right to remove anyone causing a disturbance without a refund.',
      },
    ],
  },
  ar: {
    title: 'شروط وتعليمات الدخول',
    subtitle: 'TERMS & CONDITIONS',
    items: [
      {
        number: '١',
        text: 'التذكرة صالحة لدخول فرد واحد فقط ولمرة واحدة (يُمنع الخروج والعودة).',
      },
      {
        number: '٢',
        text: 'يُرجى الحضور قبل موعد الحفل بساعة لتجنب الزحام عند البوابات.',
      },
      {
        number: '٣',
        text: 'التذكرة المباعة لا تُرد ولا تُستبدل إلا في حال إلغاء الحفل من قِبل المنظمين.',
      },
      {
        number: '٤',
        text: 'يُمنع منعاً باتاً دخول المأكولات والمشروبات، الألعاب النارية، الليزر، أو أي أدوات حادة.',
      },
      {
        number: '٥',
        text: 'يُرجى الحفاظ على التذكرة بحالة جيدة؛ التذكرة التالفة أو المقطوعة تعتبر لاغية.',
      },
      {
        number: '٦',
        text: 'إدارة الحفل غير مسؤولة عن فقدان المتعلقات الشخصية، وتحتفظ بحق إخراج أي شخص يثير الشغب دون استرداد قيمة التذكرة.',
      },
    ],
  },
};

export function getPaymentMethodLabel(method: PaymentMethodId, lang: Language): string {
  if (method === 'Offline') {
    return lang === 'ar' ? 'مبيعات أوفلاين' : 'Offline';
  }
  return PAYMENT_COPY[lang][method].label;
}

const GENRE_AR_MAP: Record<string, string> = {
  All: 'الكل',
  'Indie Pop / Rap': 'إندي بوب / راب',
  'Electronic / Indie': 'إلكترونيك / إندي',
  'Acoustic / Fusion': 'أكوستيك / فيوجن',
  'Alternative Rock': 'روك بديل',
  'Hip-Hop / Pop': 'هيب هوب / بوب',
  'Shaabi / Urban': 'شعبي / إيربان',
};

export function getGenreLabel(genre: string, lang: Language): string {
  if (lang === 'en') return genre;
  return GENRE_AR_MAP[genre] || genre;
}

export function getAdminRoleLabel(role: AdminRole, lang: Language): string {
  if (lang === 'en') return role;
  return role === 'Super Admin' ? 'مدير عام' : 'فريق البوابة';
}

export const SWATCH_NAME_AR: Record<string, string> = {
  'Slate Silver': 'فضي معدني',
  'Pure Ice': 'ثلجي ناصع',
  'Amber Gold': 'ذهبي كهرماني',
  'Sunset Orange': 'برتقالي غروب',
  'Stage Rose': 'وردي مسرحي',
  'Electric Violet': 'بنفسجي كهربائي',
  'Nile Cyan': 'سماوي نيلي',
  'Emerald Mint': 'زمردي نعناعي',
};

export function getSwatchName(name: string, lang: Language): string {
  if (lang === 'en') return name;
  return SWATCH_NAME_AR[name] || name;
}

const EN_TO_AR_MESSAGES: Record<string, string> = {
  'Promo code is invalid or currently inactive.': 'كود الخصم غير صالح أو غير مفعل حالياً.',
  'Please enter your full name (2–100 characters).': 'يرجى إدخال الاسم بالكامل (من ٢ إلى ١٠٠ حرف).',
  'Please enter a valid Egyptian mobile number.': 'يرجى إدخال رقم موبايل مصري صحيح.',
  'Enter your Egyptian mobile number.': 'يرجى إدخال رقم الموبايل المصري.',
  'Enter a valid 11-digit Egyptian mobile number starting with 010, 011, 012, or 015.':
    'يرجى إدخال رقم موبايل مصري مكون من ١١ رقماً يبدأ بـ 010 أو 011 أو 012 أو 015.',
  'Please enter your real mobile number rather than repeated digits.':
    'يرجى إدخال رقم موبايل حقيقي بدون أرقام مكررة.',
  'Please enter a valid email address.': 'يرجى إدخال بريد إلكتروني صحيح.',
  'Please enter a properly formatted email address.': 'يرجى إدخال بريد إلكتروني بصيغة صحيحة.',
  'Email address cannot contain consecutive dots.': 'لا يمكن أن يحتوي البريد الإلكتروني على نقطتين متتاليتين.',
  'Please use a real personal email address (test or temporary email domains are not accepted).':
    'يرجى استخدام بريد إلكتروني شخصي حقيقي (لا تُقبل نطاقات البريد المؤقتة أو التجريبية).',
  'Please enter your InstaPay / Wallet transfer reference or sender number.':
    'يرجى إدخال رقم مرجع التحويل أو رقم هاتف المُرسِل لإنستاباي أو المحفظة.',
  'That ticket quantity is not currently available for this show. Try selecting fewer passes.':
    'هذا العدد من التذاكر غير متاح حالياً لهذا الحفل. جرّب اختيار عدد أقل.',
  'Please enter a valid email address or leave it blank.':
    'يرجى إدخال بريد إلكتروني صحيح أو تركه فارغاً.',
  'Enter your real first and last name (4–60 characters).':
    'يرجى إدخال الاسم الأول والأخير الحقيقي (من ٤ إلى ٦٠ حرفاً).',
  'Full name can only contain letters, spaces, hyphens, or apostrophes (no numbers or symbols).':
    'الاسم يجب أن يحتوي على حروف ومسافات فقط بدون أرقام أو رموز.',
  'Please enter both your first and last name.': 'يرجى إدخال الاسم الأول والاسم الأخير.',
  'Each part of your name must be at least 2 letters.': 'يجب أن يتكون كل جزء من الاسم من حرفين على الأقل.',
  'Please enter a real name without repeated filler letters.': 'يرجى إدخال اسم حقيقي بدون تكرار عشوائي للحروف.',
  'Please enter your real full name rather than placeholder text.': 'يرجى إدخال اسمك الحقيقي بالكامل.',
  'Password must be at least 8 characters long.': 'كلمة المرور يجب أن لا تقل عن ٨ أحرف.',
  'Password must include both letters and at least one number.':
    'كلمة المرور يجب أن تحتوي على حروف ورقم واحد على الأقل.',
  'Choose a stronger password — avoid common or repeated patterns.':
    'اختر كلمة مرور أقوى وتجنّب الكلمات الشائعة أو المتكررة.',
  'Passwords do not match.': 'كلمتا المرور غير متطابقتين.',
  'Enter a valid city name (letters only, 2–60 characters).':
    'يرجى إدخال اسم مدينة صحيح (حروف فقط، من ٢ إلى ٦٠ حرفاً).',
  'Email/Password sign-in is not enabled yet in Firebase Console. Enable Email/Password under Authentication -> Sign-in method, or use Continue with Google.':
    'تسجيل الدخول بالبريد وكلمة المرور غير مفعل بعد في Firebase. يرجى المتابعة عبر جوجل أو تفعيله من الإعدادات.',
  'This app domain must be added under Firebase Console -> Authentication -> Settings -> Authorized domains.':
    'يجب إضافة نطاق الموقع ضمن النطاقات المصرح بها في إعدادات Firebase Authentication.',
  'An account with this email already exists. Try signing in instead.':
    'يوجد حساب مسجل بهذا البريد الإلكتروني بالفعل. جرّب تسجيل الدخول.',
  'Invalid email or password. Double-check your credentials and try again.':
    'البريد الإلكتروني أو كلمة المرور غير صحيحة. تأكد من بياناتك وحاول مرة أخرى.',
  'Password must be at least 8 characters long and include both letters and numbers.':
    'يجب أن تكون كلمة المرور ٨ أحرف على الأقل وتشمل حروفاً وأرقاماً.',
  'Sign-in popup was closed before completing.': 'تم إغلاق نافذة تسجيل الدخول قبل إتمام العملية.',
  'Too many attempts. Please wait a moment and try again.':
    'محاولات كثيرة متتالية. يرجى الانتظار قليلاً ثم المحاولة مرة أخرى.',
  'Daily Firestore free-tier quota exceeded. Quota resets tomorrow.':
    'تم الوصول للحد اليومي لقاعدة البيانات. يتم التصفير تلقائياً غداً.',
  'Permission denied. Make sure your account is signed in and verified.':
    'ليست لديك صلاحية تنفيذ هذه العملية. تأكد من تسجيل الدخول وتفعيل بريدك الإلكتروني.',
};

export function localizeKnownMessage(msg: string, lang: Language): string {
  if (lang === 'en' || !msg) return msg;
  if (EN_TO_AR_MESSAGES[msg]) return EN_TO_AR_MESSAGES[msg];
  if (msg.startsWith('Quantity must be between 1 and ')) {
    const max = msg.replace('Quantity must be between 1 and ', '').replace('.', '');
    return `يجب أن يكون عدد التذاكر بين ١ و ${max}.`;
  }
  const appliesOnly = /^([A-Z0-9_\-]+) applies only to (.+) passes\.$/.exec(msg);
  if (appliesOnly) {
    return `الكود ${appliesOnly[1]} ينطبق فقط على فئات ${appliesOnly[2]}.`;
  }
  const promoApplied = /^(.+) applied \(-(.+) EGP\)$/.exec(msg);
  if (promoApplied) {
    return `تم تطبيق الخصم: ${promoApplied[1]} (-${promoApplied[2]} ج.م)`;
  }
  return msg;
}

export const translations = {
  en: {
    siteTitle: 'Gen Z Events — Live Concerts in Qena',
    brandName: 'GEN Z EVENTS',
    brandCity: 'GEN Z EVENTS · QENA',
    switchLangLabel: 'العربية',
    switchLangAria: 'Switch site language to Arabic',

    // Header
    navLineup: 'Lineup',
    navPasses: 'Pass Tiers',
    staffPortal: 'Staff Portal',
    openStaffPortal: 'Open Staff Portal',
    myTickets: 'My Tickets',
    account: 'Account',
    profile: 'Profile',
    verifyEmail: 'Verify Email',
    verifyYourEmail: 'Verify Your Email',
    signIn: 'Sign In',
    signInSignUp: 'Sign In / Sign Up',
    openMenuAria: 'Open navigation menu',
    closeMenuAria: 'Close navigation menu',
    primaryNavAria: 'Primary navigation',

    // Hero
    heroKicker: 'Qena Live · Winter 2026/27 Season',
    heroTitle: "Upper Egypt's stage for live sound & night culture.",
    heroSubtitle:
      "Reserve Silver, Gold, VIP, or Private Lounge passes across Qena's flagship open-air arenas with instant QR gate check-in.",
    exploreLineup: 'Explore Lineup',
    comparePassTiers: 'Compare Pass Tiers',
    nextUpInQena: 'Next Up in Qena',
    days: 'Days',
    hours: 'Hours',
    mins: 'Mins',
    secs: 'Secs',
    bookNextShow: 'Book Next Show',
    joinWaitlist: 'Join Waitlist',
    activeClubCodes: 'Active Club Codes',
    heroImgAlt: 'Live concert stage in Qena with crowd lights',

    // Lineup section & filters
    calendarKicker: 'Qena Concert Calendar',
    upcomingLiveShows: 'Upcoming Live Shows',
    searchConcertsPlaceholder: 'Search shows, artists, venues...',
    searchConcertsAria: 'Search concerts',
    sortConcertsAria: 'Sort concerts',
    sortSoonest: 'Soonest First',
    sortPriceAsc: 'Price: Low to High',
    sortPriceDesc: 'Price: High to Low',
    savedLabel: 'Saved',
    noConcertsTitle: 'No upcoming concerts scheduled right now',
    noConcertsBody: 'Our Qena stage calendar is being refreshed. Check back soon for the next live lineup drop.',
    noFilterMatchTitle: 'No concerts match your filter',
    noFilterMatchBody: 'Clear your search or genre selection to view the full Qena winter schedule.',
    resetFilters: 'Reset Filters',

    // Concert Card
    soldOut: 'Sold Out',
    startingFrom: 'Starting From',
    bookPass: 'Book Pass',
    removeFavAria: 'Remove from favorites',
    saveFavAria: 'Save to favorites',
    shareLabel: 'Share',
    shareCopiedLabel: 'Copied',
    shareEventAria: 'Share event',

    // Pass Tiers Section
    transparentAccess: 'Transparent Access',
    seasonRange: 'Season Range',

    // Footer
    footerSubtitle: `InstaPay: ${PAYMENT_PHONE_NUMBER} · Mobile Wallets: ${PAYMENT_PHONE_NUMBER} · Upper Egypt Live Productions`,

    // Toasts
    toastEmailVerified: 'Email verified! Your account is now active.',
    toastNeedOrganizerSignIn: 'Sign in with a verified organizer account to open Staff Portal.',
    toastConcertRemoved: 'That concert is no longer on the live lineup.',
    toastRemovedFav: 'Removed from saved shows.',
    toastAddedFav: 'Saved show to favorites.',
    toastCopiedPromoPrefix: 'Copied promo code',
    toastCopiedPromoSuffix: '— paste it during checkout!',
    toastPassReservedPrefix: 'Pass reserved',
    toastPassReservedSuffix: 'Open My Tickets to track verification.',
    toastEventShared: 'Event details shared!',
    toastEventCopied: 'Event details copied — ready to share!',
    toastEventShareFailed: 'Could not share event details right now.',

    // Booking Modal
    closeBookingAria: 'Close booking modal',
    waitlistNoticeStart: 'All seats for',
    waitlistNoticeEnd:
      'are currently spoken for. Join the Qena Waitlist and our staff will message you immediately if extra passes are released.',
    fullName: 'Full Name',
    mobileNumber: 'Mobile Number',
    mobile: 'Mobile',
    emailAddress: 'Email Address',
    email: 'Email',
    signInToWaitlist: 'Sign In to Join Waitlist',
    verifyToWaitlist: 'Verify Email to Join Waitlist',
    joining: 'Joining...',
    joinSoldOutWaitlist: 'Join Sold-Out Waitlist',
    showLabel: 'Show',
    doorsLabel: 'Doors',
    step1SelectTier: '1. Select Pass Tier',
    step2Quantity: '2. Quantity',
    decreaseQtyAria: 'Decrease ticket quantity',
    increaseQtyAria: 'Increase ticket quantity',
    promoCodeOptional: 'Promo Code (Optional)',
    apply: 'Apply',
    clear: 'Clear',
    pressApplyHintPrefix: 'Press Apply to activate promo code',
    step3PaymentMethod: '3. Payment Transfer Method',
    sendTo: 'Send to:',
    copyNumber: 'Copy Number',
    transferRefLabel: 'Transfer Reference / Sender Mobile',
    step4HolderDetails: '4. Ticket Holder Details',
    passWord: 'Pass',
    passesWord: 'Passes',
    signInToReserve: 'Sign In to Reserve',
    verifyToReserve: 'Verify Email to Reserve',
    submitting: 'Submitting...',
    reserveAction: 'Reserve',
    copiedNumberPrefix: 'Copied',
    addedWaitlistPrefix: 'Added to waitlist for',
    editPaymentNumbers: 'Edit Numbers',
    editPaymentNumbersAria: 'Edit InstaPay and Vodafone Cash numbers',
    editPaymentPanelTitle: 'Super Admin · Edit Payment Numbers',
    editPaymentPanelSubtitle: 'Saves to Firestore and updates live for all fans immediately.',
    instapayNumberLabel: 'InstaPay Number or IPA',
    vodafoneCashNumberLabel: 'Vodafone Cash / Mobile Wallets Number',
    savePaymentNumbers: 'Save Numbers',
    savingPaymentNumbers: 'Saving...',
    paymentNumbersUpdatedToast: 'InstaPay & Vodafone Cash numbers updated live.',
    superAdminBadge: 'Super Admin',

    // Tickets Modal
    myBookedTickets: 'My Booked Tickets',
    closeTicketsAria: 'Close tickets modal',
    verifyToViewPasses: 'Verify your email to view your passes',
    signInToViewPasses: 'Sign in to view your passes',
    verifyToViewPassesDescPrefix: 'Confirm the link sent to',
    verifyToViewPassesDescSuffix: 'to activate your account and sync your concert passes.',
    signInToViewPassesDesc:
      'Your QR passes, payment verification status, and downloadable PNG tickets sync automatically with your verified account.',
    openEmailVerification: 'Open Email Verification',
    signInCreateAccount: 'Sign In / Create Account',
    noPassesYet: 'No concert passes yet',
    noPassesYetDesc: 'Book any live show in Qena and your pass will appear here instantly.',
    qrLocked: 'QR Locked',
    unlocksAfterCheck: 'Unlocks after transfer check',
    statusCheckedIn: 'Checked In',
    statusPaidReady: 'Paid · QR Ready',
    statusPendingVerification: 'Pending Verification',
    tierLabel: 'Tier',
    guestsLabel: 'Guests',
    totalLabel: 'Total',
    copyCode: 'Copy Code',
    ePassPng: 'E-Pass PNG',
    downloadQr: 'Download QR',
    downloadQrAria: 'Download original-size QR code PNG',
    qrDownloading: 'Downloading QR...',
    qrDownloadedPrefix: 'Downloaded full-size QR for',
    qrDownloadFailed: 'Could not download QR image.',
    whatsappLabel: 'WhatsApp',
    sendReceiptWhatsapp: 'Send Receipt (WhatsApp)',
    whatsappReceiptAria: `Send payment receipt via WhatsApp to ${PAYMENT_PHONE_NUMBER}`,
    whatsappPaymentScreenshotNote:
      'Please send your payment screenshot on WhatsApp and our sales representative will confirm your payment.',
    cancelling: 'Cancelling...',
    confirmCancel: 'Confirm Cancel',
    keep: 'Keep',
    cancel: 'Cancel',
    enteredLabel: 'Entered',
    ePassPreviewTitle: 'E-Pass',
    closePreviewAria: 'Close E-Pass preview',
    close: 'Close',
    downloadPng: 'Download PNG',
    enlargeQr: 'Enlarge QR',
    enlargeQrAria: 'Enlarge QR code for gate scanning',
    gateScanReady: 'Hold up to Gate Scanner',
    tapQrToEnlarge: 'Tap QR to enlarge',
    ePassGenerating: 'Generating...',
    copiedCodePrefix: 'Copied booking code',
    pngRenderFailed: 'Could not render PNG pass.',
    cancelledReservationPrefix: 'Cancelled reservation',

    // Auth & Profile Modal
    fanProfileAccount: 'Fan Profile & Account',
    createAccount: 'Create Account',
    closeAccountAria: 'Close account modal',
    logIn: 'Log In',
    signUp: 'Sign Up',
    egyptianMobileLabel: 'Egyptian Mobile Number',
    egyptianMobileHint: '11-digit number starting with 010, 011, 012, or 015.',
    passwordLabel: 'Password',
    forgotPassword: 'Forgot password?',
    showPasswordAria: 'Show password',
    hidePasswordAria: 'Hide password',
    pwRuleChars: '8+ characters',
    pwRuleLetter: 'Letter',
    pwRuleNumber: 'Number',
    confirmPasswordLabel: 'Confirm Password',
    signupVerifyNote:
      "We'll send a verification link to your email. Your account and profile activate only after you verify.",
    pleaseWait: 'Please wait...',
    logInWithEmail: 'Log In with Email',
    createAccountSendVerify: 'Create Account & Send Verification',
    orInstantVerified: 'Or instant verified access',
    continueWithGoogle: 'Continue with Google',
    confirmEmailHeading: 'Confirm your email to activate your account',
    confirmEmailBodyPrefix: 'We sent a confirmation link to',
    confirmEmailBodySuffix:
      '. Click the link in your inbox (or spam folder), then come back and press the button below.',
    confirmEmailProfileNote: 'Your profile is not saved until your email is verified.',
    checking: 'Checking...',
    iveVerifiedEmail: "I've Verified My Email",
    resendVerification: 'Resend Verification Email',
    wrongEmailCancel: 'Wrong email? Cancel & start over',
    signOut: 'Sign Out',
    logOut: 'Log Out',
    verifiedAccount: 'Verified Account',
    ticketsWord: 'Tickets',
    cityLabel: 'City',
    favoriteMusicVibe: 'Favorite Music Vibe',
    bioCrewNote: 'Bio / Crew Note',
    saving: 'Saving...',
    saveProfile: 'Save Profile',
    welcomeBackToast: 'Welcome back to Gen Z Events!',
    signedInGoogleToast: 'Signed in with Google.',
    signedOutToast: 'Signed out cleanly.',
    profileSavedToast: 'Profile saved to your account.',
    profileUpdatedStatus: 'Profile updated successfully.',
    enterEmailFirstReset: 'Enter your account email address above first, then click Forgot Password.',
    resetLinkSentPrefix: 'Password reset link sent to',
    resetLinkSentSuffix: '. Check your inbox or spam folder.',
    enterPasswordError: 'Please enter your password.',
    verifyLinkSentPrefix: 'Verification link sent to',
    verifyLinkSentSuffix:
      '. Open your inbox (or spam folder) and click the link to activate your account.',
    verifyLinkFail:
      'Account created, but we could not send the verification email right now. Click Resend Verification Email below.',
    unverifiedSignInError:
      'Your email address is not verified yet. Open the verification link in your inbox or request a fresh link below to activate your account.',
    freshVerifySentPrefix: 'Fresh verification link sent to',
    freshVerifySentSuffix: '. Check your inbox and spam folder.',
    stillNotVerified:
      'Still not verified yet. Open the verification email in your inbox, click the confirmation link, then tap this button again.',
    unverifiedRemoved: 'Unverified account removed. You can sign up again with the right email.',
    signedOutUnverified: 'Signed out of unverified account.',

    // Error Boundary
    errorTitle: 'Something went wrong',
    errorReload: 'Reload Gen Z Events',

    // Admin Workspace
    staffCommandCenter: 'Gen Z Events · Staff Command Center',
    backToStorefront: 'Back to Storefront',
    staffNavAria: 'Staff portal navigation',
    tabDashboard: 'Analytics & Logs',
    tabRecentApprovals: 'Recent Approvals',
    tabCheckin: 'Gate QR Check-In',
    tabOffline: 'Offline Tickets',
    tabSchedule: 'Schedule Concert',
    tabManage: 'Manage & CSV',
    tabPromos: 'Promo Codes',
    tabTeam: 'Admin Team',
    kpiLiveEvents: 'Live Events',
    kpiSeatsLeft: 'Seats Left',
    kpiTicketsSold: 'Tickets Sold',
    kpiCheckedIn: 'Checked In',
    kpiPaidRevenue: 'Paid Revenue',

    // Admin Dashboard
    analyticsTitle: 'Analytics & Gate Audit',
    analyticsSubtitle: 'Live Firestore revenue breakdown and recent staff verification logs.',
    recentApprovalsGateSubtitle: 'Live audit trail of verified payments and gate check-in entries.',
    onlineSalesLabel: 'Online Sales (InstaPay & Wallets)',
    offlineSalesLabel: 'Offline Sales (Box Office & Excel Import)',
    paidTickets: 'Paid Tickets',
    paidRevenueByTier: 'Paid Revenue by Pass Tier',
    noConfirmedSalesYet:
      'No confirmed paid sales yet. Confirm pending transfers in Gate QR Check-In to see revenue metrics.',
    revenueWord: 'Revenue',
    paidPassesByConcert: 'Paid Passes Sold by Concert',
    showsTracked: 'shows tracked',
    noConcertsInDb: 'No concerts in database yet.',
    paidPassesWord: 'Paid Passes',
    recentApprovalsTitle: 'Recent Payment & Gate Approvals',
    recordsWord: 'records',
    noApprovalsYet: 'Approvals and gate check-ins will log here automatically with staff attribution.',
    colCode: 'Code',
    colGuest: 'Guest',
    colConcert: 'Concert',
    colApprover: 'Approver',
    colMethod: 'Method',
    colGateTime: 'Gate Time',
    paidOnly: 'Paid Only',
    verifiedWord: 'Verified',

    // Admin Check-In
    gateQrTitle: 'Gate QR & Code Verification',
    gateQrSubtitle: "Scan a fan's E-Pass or enter booking code manually.",
    soundOn: 'Sound On',
    soundMuted: 'Sound Muted',
    bookingCodeLabel: 'Booking Code',
    verifyAndAdmit: 'Verify & Admit',
    stopCamera: 'Stop Camera Scanner',
    openCamera: 'Open Camera Scanner',
    scanTicketPng: 'Scan Ticket PNG',
    confirmPayAndApprove: 'Confirm Payment & Approve Entry',
    pointCameraHint: 'Point camera at fan QR pass…',
    cameraIdleHint: 'Camera scanner idle. Tap Open Camera Scanner or upload a PNG pass.',
    cameraLiveBadge: 'LIVE SCANNER ACTIVE',
    scanNextBtn: 'Scan Next',
    scannedCodeLabel: 'Scanned QR',
    snapQrCamera: 'Snap QR with Camera',
    retryCamera: 'Retry Live Camera',
    searchRosterPlaceholder: 'Search attendee roster...',
    searchRosterAria: 'Search attendee roster',
    filterAll: 'All',
    filterUnpaid: 'Unpaid',
    filterPaidReady: 'Paid · Ready',
    filterCheckedIn: 'Checked In',
    filterOffline: 'Offline',
    colAttendee: 'Attendee',
    colConcertTier: 'Concert & Tier',
    colPaymentRef: 'Payment / Ref',
    colActions: 'Actions',
    noBookingsMatch: 'No bookings match this filter.',
    statusPaid: 'Paid',
    statusPending: 'Pending',
    confirmPay: 'Confirm Pay',
    awaitingSuperAdmin: 'Super Admin Only',
    checkInBtn: 'Check In',
    sureBtn: 'Sure?',
    cancelDeleteAria: 'Cancel delete',

    // Admin Offline Tickets
    offlineTitle: 'Offline Tickets · Google Form & Excel Sync',
    offlineSubtitle:
      'Sync live submissions from your bound Google Form, upload booth Excel sheets (.xlsx / .csv), or log walk-in sales into attendance & revenue reports.',
    importExcelFile: 'Import Excel File',
    downloadTemplate: 'Download Template',
    hideManualEntry: 'Hide Manual Entry',
    addSingleSale: 'Add Single Sale',
    exportExcel: 'Export Excel',
    kpiOfflineOrders: 'Offline Orders',
    kpiOfflineTickets: 'Offline Tickets',
    kpiOfflineRevenue: 'Offline Revenue',
    kpiOfflineCheckedIn: 'Offline Checked In',
    scheduleConcertFirstWarn:
      'Schedule at least one live concert first so offline tickets can be linked to an event.',
    excelPreviewTitle: 'Excel Import Preview',
    worksheetLabel: 'Worksheet',
    reviewParsedHint: 'Review parsed rows below before saving to Firestore.',
    assignImportedConcert: 'Assign Imported Tickets to Concert',
    seatsLeftWord: 'seats left',
    deductImportedPrefix: 'Deduct imported paid tickets',
    deductImportedSuffix: 'from concert seats left',
    validRowsWord: 'valid row(s)',
    ticketsLower: 'tickets',
    skippedRowsWord: 'skipped row(s) with issues',
    rowWord: 'Row',
    moreSkippedRows: 'more skipped rows…',
    colBuyer: 'Buyer',
    colCategory: 'Category',
    colQty: 'Qty',
    colTotal: 'Total',
    colOutletRef: 'Outlet / Ref',
    showingFirst50Prefix: 'Showing first 50 of',
    showingFirst50Suffix: 'ready rows. All valid rows will be imported.',
    importingFirestore: 'Importing to Firestore...',
    confirmAndImport: 'Confirm & Import',
    recordWord: 'Record',
    recordsPlural: 'Records',
    logSingleOfflineTitle: 'Log Single Offline Ticket Sale',
    ticketCategoryLabel: 'Ticket Category',
    totalEgpAuto: 'Total EGP',
    autoPrefix: 'Auto',
    buyerFullName: 'Buyer Full Name',
    emailOptional: 'Email (Optional)',
    outletSellerReceipt: 'Outlet / Seller / Receipt',
    deductFromSeats: 'Deduct from concert seats left',
    markAlreadyCheckedIn: 'Mark already checked in',
    saveOfflineSale: 'Save Offline Sale',
    searchOfflinePlaceholder: 'Search offline records...',
    allConcerts: 'All Concerts',
    colConcertCategory: 'Concert & Category',
    colOutletSource: 'Outlet / Source',
    noOfflineRecorded: 'No offline ticket sales recorded yet.',
    noOfflineFilterMatch: 'No offline records match your search filter.',
    offlineEmptyGuide:
      'Click "Import Excel File" above to upload an .xlsx/.csv sheet (columns: Customer Name, Mobile, Tier, Quantity, Total EGP, Outlet) or log a single sale manually.',

    // Admin Schedule
    scheduleTitle: 'Schedule New Qena Concert',
    scheduleSubtitle: 'Publishes immediately to the live storefront across all devices.',
    concertTitleLabel: 'Concert Title',
    headlinerArtistLabel: 'Headliner / Artist',
    venueQenaLabel: 'Venue in Qena',
    vibeGenreLabel: 'Vibe / Genre',
    eventDateLabel: 'Event Date',
    startTimeLabel: 'Start Time',
    totalCapacityLabel: 'Total Capacity',
    customTierPricing: 'Custom Tier Pricing (EGP)',
    autoSuggestFromSilver: 'Auto-Suggest from Silver',
    concertPosterLabel: 'Concert Poster (Optional — HTTPS URL or Upload Compressed Image)',
    compressedPosterReady: 'Compressed poster ready',
    removeBtn: 'Remove',
    uploadImage: 'Upload Image',
    eventDescriptionLabel: 'Event Description',
    publishingConcert: 'Publishing Concert...',
    publishConcertBtn: 'Publish Concert to Lineup',

    // Tier Color Editor
    customColorsTitle: 'Custom Ticket Category Colors',
    customColorsSubtitle:
      'Toggle on to assign a bespoke hex color to Silver, Gold, VIP, and Lounge passes.',
    resetDefaults: 'Reset Defaults',
    toggleColorsAria: 'Toggle custom ticket category colors',
    usingDefaultPalette: 'Using default palette:',
    hexCodeLabel: 'Hex Color',
    invalidHexHint: 'Enter a valid 6-digit hex code.',

    // Admin Manage
    manageTitle: 'Manage Concerts & Waitlist',
    manageSubtitle:
      'Edit any published concert detail (title, artist, venue, genre, date, time, capacity, pricing, poster, colors) and export attendee CSV sheets.',
    exportAttendeesCsv: 'Export Attendees CSV',
    colShowVenue: 'Show & Venue',
    colSeatsLeft: 'Seats Left',
    colTierPrices: 'Tier Prices (S / G / V / L)',
    noLiveConcertsYet: 'No live concerts yet. Schedule a new concert to publish it.',
    customPaletteTag: 'Custom palette',
    saveBtn: 'Save',
    editBtn: 'Edit',
    editConcertTitle: 'Edit Published Concert',
    editConcertSubtitle: 'Updates publish immediately to the live storefront across all devices.',
    seatsLeftLabel: 'Seats Left',
    saveChangesBtn: 'Save Changes',
    savingChangesBtn: 'Saving Changes...',
    cancelBtn: 'Cancel',
    bookedSeatsLabel: 'Booked / Used',
    confirmDeleteBtn: 'Confirm Delete',
    waitlistTitle: 'Sold-Out Waitlist Requests',
    waitingWord: 'waiting',
    noWaitlistYet: 'No waitlist entries yet. When a concert hits 0 seats left, fans can join here.',
    colFan: 'Fan',
    colMobile: 'Mobile',
    copyBtn: 'Copy',

    // Admin Promos
    createDiscountTitle: 'Create Discount Code',
    promoCodeLabel: 'Promo Code',
    promoScopeLabel: 'Pass Tier Scope',
    allPassTiers: 'All Pass Tiers',
    vipLoungeOnly: 'VIP & Lounge Only',
    discountTypeLabel: 'Discount Type',
    percentOffOpt: '% Percentage Off',
    flatEgpOffOpt: 'Flat EGP Off',
    discountValueLabel: 'Discount Value',
    displayLabelField: 'Display Label (Optional)',
    savePromoCodeBtn: 'Save Promo Code',
    liveDiscountCodesTitle: 'Live Discount Codes',
    totalCountWord: 'total',
    noPromosLive: 'No promo codes live. Create one on the left to offer discounts during checkout.',
    allTiersWord: 'All Tiers',
    liveWord: 'Live',
    hiddenWord: 'Hidden',

    // Admin Team
    authorizedTeamTitle: 'Authorized Staff Team',
    authorizedTeamSubtitle:
      'Verified emails listed here automatically unlock the Staff Command Center.',
    staffNameLabel: 'Staff Name',
    staffEmailLabel: 'Staff Email',
    staffRoleLabel: 'Role',
    addBtn: 'Add',
    leadOrganizerPrimary: 'Lead Organizer (Primary)',
    activeSessionsTitle: 'Active Staff Sessions',
    activeSessionsSubtitle:
      'Real-time Firestore Cloud Sync is active across all verified organizer devices.',
    currentSessionActive: 'Current session active.',
  },
  ar: {
    siteTitle: 'Gen Z Events — حفلات قنا المباشرة',
    brandName: 'GEN Z EVENTS',
    brandCity: 'GEN Z EVENTS · قنا',
    switchLangLabel: 'EN',
    switchLangAria: 'التبديل إلى اللغة الإنجليزية',

    // Header
    navLineup: 'الحفلات',
    navPasses: 'فئات التذاكر',
    staffPortal: 'لوحة الإدارة',
    openStaffPortal: 'فتح لوحة الإدارة',
    myTickets: 'تذاكري',
    account: 'حسابي',
    profile: 'الملف الشخصي',
    verifyEmail: 'تفعيل البريد',
    verifyYourEmail: 'تفعيل البريد الإلكتروني',
    signIn: 'تسجيل الدخول',
    signInSignUp: 'تسجيل الدخول / إنشاء حساب',
    openMenuAria: 'فتح قائمة التنقل',
    closeMenuAria: 'إغلاق قائمة التنقل',
    primaryNavAria: 'التنقل الرئيسي',

    // Hero
    heroKicker: 'حفلات قنا • شتاء ٢٠٢٦ / ٢٠٢٧',
    heroTitle: 'الوجهة الأولى لأضخم الحفلات في الصعيد',
    heroSubtitle:
      'احجز تذكرتك (سيلفر – جولد – في آي بي – لاونج) بأكبر استادات وساحات قنا المفتوحة، مع استلام تذكرتك ودخولك الفوري بكود QR.',
    exploreLineup: 'استكشف الحفلات',
    comparePassTiers: 'قارن فئات التذاكر',
    nextUpInQena: 'الحفل القادم في قنا',
    days: 'أيام',
    hours: 'ساعات',
    mins: 'دقائق',
    secs: 'ثوانٍ',
    bookNextShow: 'احجز الحفل القادم',
    joinWaitlist: 'انضم لقائمة الانتظار',
    activeClubCodes: 'أكواد خصم مفعّلة',
    heroImgAlt: 'مسرح حفل مباشر في قنا مع أضواء الجمهور',

    // Lineup section & filters
    calendarKicker: 'جدول حفلات قنا',
    upcomingLiveShows: 'الحفلات المباشرة القادمة',
    searchConcertsPlaceholder: 'ابحث عن حفل أو فنان أو مسرح...',
    searchConcertsAria: 'البحث في الحفلات',
    sortConcertsAria: 'ترتيب الحفلات',
    sortSoonest: 'الأقرب موعداً',
    sortPriceAsc: 'السعر: من الأقل للأعلى',
    sortPriceDesc: 'السعر: من الأعلى للأقل',
    savedLabel: 'المحفوظة',
    noConcertsTitle: 'لا توجد حفلات قادمة مجدولة حالياً',
    noConcertsBody: 'جارٍ تحديث جدول حفلات قنا. تابعنا قريباً للإعلان عن الحفلات الجديدة.',
    noFilterMatchTitle: 'لا توجد حفلات تطابق بحثك',
    noFilterMatchBody: 'امسح نص البحث أو غيّر التصنيف لعرض جدول حفلات قنا بالكامل.',
    resetFilters: 'إعادة ضبط الفلاتر',

    // Concert Card
    soldOut: 'نفدت التذاكر',
    startingFrom: 'تبدأ من',
    bookPass: 'احجز تذكرتك',
    removeFavAria: 'إزالة من المفضلة',
    saveFavAria: 'حفظ في المفضلة',
    shareLabel: 'مشاركة',
    shareCopiedLabel: 'تم النسخ',
    shareEventAria: 'مشاركة الحفل',

    // Pass Tiers Section
    transparentAccess: 'فئات دخول واضحة',
    seasonRange: 'السعر',

    // Footer
    footerSubtitle: `إنستاباي: \u2066${PAYMENT_PHONE_NUMBER}\u2069 · المحافظ الإلكترونية: \u2066${PAYMENT_PHONE_NUMBER}\u2069 · حفلات صعيد مصر المباشرة`,

    // Toasts
    toastEmailVerified: 'تم تفعيل بريدك الإلكتروني! حسابك الآن نشط.',
    toastNeedOrganizerSignIn: 'سجّل الدخول بحساب منظم مفعّل لفتح لوحة الإدارة.',
    toastConcertRemoved: 'هذا الحفل لم يعد متاحاً في الجدول الحالي.',
    toastRemovedFav: 'تمت الإزالة من الحفلات المحفوظة.',
    toastAddedFav: 'تم حفظ الحفل في المفضلة.',
    toastCopiedPromoPrefix: 'تم نسخ كود الخصم',
    toastCopiedPromoSuffix: '— الصقه عند إتمام الحجز!',
    toastPassReservedPrefix: 'تم حجز التذكرة',
    toastPassReservedSuffix: 'افتح «تذاكري» لمتابعة تأكيد الدفع.',
    toastEventShared: 'تمت مشاركة تفاصيل الحفل!',
    toastEventCopied: 'تم نسخ تفاصيل الحفل — جاهز للمشاركة!',
    toastEventShareFailed: 'تعذر مشاركة تفاصيل الحفل حالياً.',

    // Booking Modal
    closeBookingAria: 'إغلاق نافذة الحجز',
    waitlistNoticeStart: 'تم حجز جميع المقاعد لحفل',
    waitlistNoticeEnd:
      'حالياً. انضم إلى قائمة انتظار قنا وسيتواصل معك فريقنا فور توفر تذاكر إضافية.',
    fullName: 'الاسم بالكامل',
    mobileNumber: 'رقم الموبايل',
    mobile: 'الموبايل',
    emailAddress: 'البريد الإلكتروني',
    email: 'البريد الإلكتروني',
    signInToWaitlist: 'سجّل الدخول للانضمام لقائمة الانتظار',
    verifyToWaitlist: 'فعّل البريد للانضمام لقائمة الانتظار',
    joining: 'جارٍ التسجيل...',
    joinSoldOutWaitlist: 'الانضمام لقائمة الانتظار',
    showLabel: 'الحفل',
    doorsLabel: 'فتح الأبواب',
    step1SelectTier: '١. اختر فئة التذكرة',
    step2Quantity: '٢. عدد التذاكر',
    decreaseQtyAria: 'تقليل عدد التذاكر',
    increaseQtyAria: 'زيادة عدد التذاكر',
    promoCodeOptional: 'كود الخصم (اختياري)',
    apply: 'تطبيق',
    clear: 'مسح',
    pressApplyHintPrefix: 'اضغط «تطبيق» لتفعيل كود الخصم',
    step3PaymentMethod: '٣. طريقة تحويل الدفع',
    sendTo: 'التحويل إلى رقم:',
    copyNumber: 'نسخ الرقم',
    transferRefLabel: 'مرجع التحويل / رقم هاتف المُرسِل',
    step4HolderDetails: '٤. بيانات صاحب التذكرة',
    passWord: 'تذكرة',
    passesWord: 'تذاكر',
    signInToReserve: 'سجّل الدخول لإتمام الحجز',
    verifyToReserve: 'فعّل البريد لإتمام الحجز',
    submitting: 'جارٍ إرسال الحجز...',
    reserveAction: 'تأكيد حجز',
    copiedNumberPrefix: 'تم نسخ رقم',
    addedWaitlistPrefix: 'تم تسجيلك في قائمة انتظار حفل',
    editPaymentNumbers: 'تعديل الأرقام',
    editPaymentNumbersAria: 'تعديل أرقام إنستاباي وفودافون كاش',
    editPaymentPanelTitle: 'المدير العام · تعديل أرقام الدفع',
    editPaymentPanelSubtitle: 'يتم الحفظ في قاعدة البيانات وتحديث الأرقام فوراً لجميع الجمهور.',
    instapayNumberLabel: 'رقم إنستاباي أو عنوان الدفع (IPA)',
    vodafoneCashNumberLabel: 'رقم فودافون كاش / المحافظ الإلكترونية',
    savePaymentNumbers: 'حفظ الأرقام',
    savingPaymentNumbers: 'جارٍ الحفظ...',
    paymentNumbersUpdatedToast: 'تم تحديث أرقام إنستاباي وفودافون كاش مباشرة للجميع.',
    superAdminBadge: 'مدير عام',

    // Tickets Modal
    myBookedTickets: 'تذاكري المحجوزة',
    closeTicketsAria: 'إغلاق نافذة التذاكر',
    verifyToViewPasses: 'فعّل بريدك الإلكتروني لعرض تذاكرك',
    signInToViewPasses: 'سجّل الدخول لعرض تذاكرك',
    verifyToViewPassesDescPrefix: 'افتح رابط التفعيل المرسل إلى',
    verifyToViewPassesDescSuffix: 'لتنشيط حسابك ومزامنة تذاكر الحفلات.',
    signInToViewPassesDesc:
      'تذاكر الـ QR وحالة تأكيد الدفع وبطاقات PNG القابلة للتحميل تتزامن تلقائياً مع حسابك المفعّل.',
    openEmailVerification: 'فتح صفحة تفعيل البريد',
    signInCreateAccount: 'تسجيل الدخول / إنشاء حساب',
    noPassesYet: 'لا توجد تذاكر محجوزة بعد',
    noPassesYetDesc: 'احجز أي حفل مباشر في قنا وستظهر تذكرتك هنا فوراً.',
    qrLocked: 'الرمز مقفل',
    unlocksAfterCheck: 'يُفتح فور مراجعة التحويل',
    statusCheckedIn: 'تم الدخول',
    statusPaidReady: 'مدفوعة · QR جاهز',
    statusPendingVerification: 'بانتظار مراجعة التحويل',
    tierLabel: 'الفئة',
    guestsLabel: 'الأفراد',
    totalLabel: 'الإجمالي',
    copyCode: 'نسخ الكود',
    ePassPng: 'بطاقة PNG',
    downloadQr: 'تحميل QR',
    downloadQrAria: 'تحميل رمز QR بالحجم الأصلي PNG',
    qrDownloading: 'جارٍ التحميل...',
    qrDownloadedPrefix: 'تم تحميل رمز QR بالحجم الأصلي للكود',
    qrDownloadFailed: 'تعذر تحميل صورة رمز QR.',
    whatsappLabel: 'واتساب',
    sendReceiptWhatsapp: 'إرسال الإيصال (واتساب)',
    whatsappReceiptAria: `إرسال إيصال الدفع عبر واتساب إلى ${PAYMENT_PHONE_NUMBER}`,
    whatsappPaymentScreenshotNote:
      'برجاء ارسال اسكرين الدفع علي الواتساب وسيتم تأكيد الدفع من مسؤول البيع',
    cancelling: 'جارٍ الإلغاء...',
    confirmCancel: 'تأكيد الإلغاء',
    keep: 'إبقاء',
    cancel: 'إلغاء',
    enteredLabel: 'وقت الدخول',
    ePassPreviewTitle: 'التذكرة الإلكترونية',
    closePreviewAria: 'إغلاق معاينة التذكرة',
    close: 'إغلاق',
    downloadPng: 'تحميل PNG',
    enlargeQr: 'تكبير الـ QR',
    enlargeQrAria: 'تكبير رمز QR للمسح على البوابة',
    gateScanReady: 'اعرض الرمز أمام ماسح البوابة',
    tapQrToEnlarge: 'اضغط على الرمز للتكبير',
    ePassGenerating: 'جارٍ التجهيز...',
    copiedCodePrefix: 'تم نسخ كود الحجز',
    pngRenderFailed: 'تعذر تجهيز صورة التذكرة.',
    cancelledReservationPrefix: 'تم إلغاء الحجز',

    // Auth & Profile Modal
    fanProfileAccount: 'الملف الشخصي والحساب',
    createAccount: 'إنشاء حساب جديد',
    closeAccountAria: 'إغلاق نافذة الحساب',
    logIn: 'تسجيل الدخول',
    signUp: 'حساب جديد',
    egyptianMobileLabel: 'رقم الموبايل المصري',
    egyptianMobileHint: '١١ رقماً يبدأ بـ 010 أو 011 أو 012 أو 015.',
    passwordLabel: 'كلمة المرور',
    forgotPassword: 'نسيت كلمة المرور؟',
    showPasswordAria: 'إظهار كلمة المرور',
    hidePasswordAria: 'إخفاء كلمة المرور',
    pwRuleChars: '٨ أحرف على الأقل',
    pwRuleLetter: 'حرف',
    pwRuleNumber: 'رقم',
    confirmPasswordLabel: 'تأكيد كلمة المرور',
    signupVerifyNote:
      'سنرسل رابط تفعيل إلى بريدك الإلكتروني. يتم تنشيط حسابك وملفك الشخصي فور التفعيل.',
    pleaseWait: 'يرجى الانتظار...',
    logInWithEmail: 'الدخول بالبريد الإلكتروني',
    createAccountSendVerify: 'إنشاء الحساب وإرسال رابط التفعيل',
    orInstantVerified: 'أو دخول فوري موثّق',
    continueWithGoogle: 'المتابعة باستخدام جوجل',
    confirmEmailHeading: 'أكّد بريدك الإلكتروني لتنشيط حسابك',
    confirmEmailBodyPrefix: 'أرسلنا رابط التفعيل إلى',
    confirmEmailBodySuffix:
      '. افتح البريد الوارد (أو الرسائل غير المرغوب فيها) واضغط على الرابط ثم عد واضغط الزر بالأسفل.',
    confirmEmailProfileNote: 'لن يتم حفظ ملفك الشخصي إلا بعد تأكيد بريدك الإلكتروني.',
    checking: 'جارٍ التحقق...',
    iveVerifiedEmail: 'لقد فعّلت بريدي الإلكتروني',
    resendVerification: 'إعادة إرسال رابط التفعيل',
    wrongEmailCancel: 'بريد خاطئ؟ إلغاء والبدء من جديد',
    signOut: 'تسجيل الخروج',
    logOut: 'تسجيل الخروج',
    verifiedAccount: 'حساب موثّق',
    ticketsWord: 'تذاكر',
    cityLabel: 'المدينة',
    favoriteMusicVibe: 'نوع الموسيقى المفضل',
    bioCrewNote: 'نبذة شخصية',
    saving: 'جارٍ الحفظ...',
    saveProfile: 'حفظ البيانات',
    welcomeBackToast: 'أهلاً بعودتك إلى Gen Z Events!',
    signedInGoogleToast: 'تم تسجيل الدخول عبر جوجل.',
    signedOutToast: 'تم تسجيل الخروج بنجاح.',
    profileSavedToast: 'تم حفظ بيانات ملفك الشخصي.',
    profileUpdatedStatus: 'تم تحديث الملف الشخصي بنجاح.',
    enterEmailFirstReset: 'أدخل بريدك الإلكتروني بالأعلى أولاً ثم اضغط نسيت كلمة المرور.',
    resetLinkSentPrefix: 'تم إرسال رابط استعادة كلمة المرور إلى',
    resetLinkSentSuffix: '. راجع البريد الوارد أو الرسائل غير المرغوب فيها.',
    enterPasswordError: 'يرجى إدخال كلمة المرور.',
    verifyLinkSentPrefix: 'تم إرسال رابط التفعيل إلى',
    verifyLinkSentSuffix: '. افتح بريدك واضغط على الرابط لتفعيل حسابك.',
    verifyLinkFail:
      'تم إنشاء الحساب لكن تعذر إرسال رسالة التفعيل حالياً. اضغط «إعادة إرسال رابط التفعيل» بالأسفل.',
    unverifiedSignInError:
      'بريدك الإلكتروني غير مفعّل بعد. افتح رابط التفعيل في بريدك أو اطلب رابطاً جديداً بالأسفل.',
    freshVerifySentPrefix: 'تم إرسال رابط تفعيل جديد إلى',
    freshVerifySentSuffix: '. راجع البريد الوارد والرسائل غير المرغوب فيها.',
    stillNotVerified:
      'لم يتم التفعيل بعد. افتح رسالة التفعيل في بريدك واضغط على الرابط ثم اضغط هذا الزر مجدداً.',
    unverifiedRemoved: 'تم حذف الحساب غير المفعّل. يمكنك التسجيل مجدداً بالبريد الصحيح.',
    signedOutUnverified: 'تم تسجيل الخروج من الحساب غير المفعّل.',

    // Error Boundary
    errorTitle: 'حدث خطأ غير متوقع',
    errorReload: 'إعادة تحميل الموقع',

    // Admin Workspace
    staffCommandCenter: 'Gen Z Events · مركز إدارة الحفلات',
    backToStorefront: 'العودة للموقع',
    staffNavAria: 'قائمة لوحة الإدارة',
    tabDashboard: 'التحليلات والسجل',
    tabRecentApprovals: 'آخر الاعتمادات',
    tabCheckin: 'مسح QR البوابة',
    tabOffline: 'التذاكر الأوفلاين',
    tabSchedule: 'جدولة حفل جديد',
    tabManage: 'الإدارة والتصدير',
    tabPromos: 'أكواد الخصم',
    tabTeam: 'فريق الإدارة',
    kpiLiveEvents: 'الحفلات النشطة',
    kpiSeatsLeft: 'المقاعد المتبقية',
    kpiTicketsSold: 'التذاكر المباعة',
    kpiCheckedIn: 'تم دخولهم',
    kpiPaidRevenue: 'الإيرادات المؤكدة',

    // Admin Dashboard
    analyticsTitle: 'التحليلات وسجل البوابة',
    analyticsSubtitle: 'إحصائيات الإيرادات المباشرة وآخر عمليات الاعتماد والدخول من الفريق.',
    recentApprovalsGateSubtitle: 'السجل المباشر لعمليات الدفع المعتمدة ودخول البوابة.',
    onlineSalesLabel: 'مبيعات أونلاين (إنستاباي والمحافظ)',
    offlineSalesLabel: 'مبيعات أوفلاين (المنافذ واستيراد الإكسل)',
    paidTickets: 'تذاكر مدفوعة',
    paidRevenueByTier: 'الإيرادات المؤكدة حسب الفئة',
    noConfirmedSalesYet:
      'لا توجد مبيعات مؤكدة بعد. أكّد التحويلات المعلقة من «مسح QR البوابة» لعرض الإحصائيات.',
    revenueWord: 'الإيرادات',
    paidPassesByConcert: 'التذاكر المباعة لكل حفل',
    showsTracked: 'حفلات مسجلة',
    noConcertsInDb: 'لا توجد حفلات في قاعدة البيانات بعد.',
    paidPassesWord: 'التذاكر المدفوعة',
    recentApprovalsTitle: 'آخر عمليات الدفع ودخول البوابة',
    recordsWord: 'سجلات',
    noApprovalsYet: 'ستظهر عمليات تأكيد الدفع ودخول البوابة هنا تلقائياً باسم المسؤول.',
    colCode: 'الكود',
    colGuest: 'العميل',
    colConcert: 'الحفل',
    colApprover: 'المسؤول',
    colMethod: 'الطريقة',
    colGateTime: 'وقت الدخول',
    paidOnly: 'مدفوع فقط',
    verifiedWord: 'تم التأكيد',

    // Admin Check-In
    gateQrTitle: 'التحقق من QR وكود التذكرة على البوابة',
    gateQrSubtitle: 'امسح تذكرة العميل بالكاميرا أو أدخل كود الحجز يدوياً.',
    soundOn: 'الصوت مفعل',
    soundMuted: 'الصوت مكتوم',
    bookingCodeLabel: 'كود الحجز',
    verifyAndAdmit: 'تحقق وأدخل العميل',
    stopCamera: 'إيقاف الكاميرا',
    openCamera: 'تشغيل ماسح الكاميرا',
    scanTicketPng: 'مسح صورة التذكرة PNG',
    confirmPayAndApprove: 'تأكيد الدفع والسماح بالدخول',
    pointCameraHint: 'وجّه الكاميرا نحو رمز QR التذكرة…',
    cameraIdleHint: 'ماسح الكاميرا متوقف. اضغط تشغيل الكاميرا أو ارفع صورة التذكرة.',
    cameraLiveBadge: 'الماسح يعمل مباشرة',
    scanNextBtn: 'مسح تذكرة تالية',
    scannedCodeLabel: 'الرمز الممسوح',
    snapQrCamera: 'التقاط QR بالكاميرا',
    retryCamera: 'إعادة محاولة الكاميرا',
    searchRosterPlaceholder: 'ابحث في قائمة الحضور...',
    searchRosterAria: 'البحث في قائمة الحضور',
    filterAll: 'الكل',
    filterUnpaid: 'غير مدفوع',
    filterPaidReady: 'مدفوع · جاهز',
    filterCheckedIn: 'تم الدخول',
    filterOffline: 'أوفلاين',
    colAttendee: 'الحاضر',
    colConcertTier: 'الحفل والفئة',
    colPaymentRef: 'الدفع / المرجع',
    colActions: 'الإجراءات',
    noBookingsMatch: 'لا توجد حجوزات مطابقة لهذا الفلتر.',
    statusPaid: 'مدفوع',
    statusPending: 'معلّق',
    confirmPay: 'تأكيد الدفع',
    awaitingSuperAdmin: 'بانتظار المشرف العام',
    checkInBtn: 'تسجيل دخول',
    sureBtn: 'تأكيد؟',
    cancelDeleteAria: 'إلغاء الحذف',

    // Admin Offline Tickets
    offlineTitle: 'التذاكر الأوفلاين · مزامنة Google Form وإكسل',
    offlineSubtitle:
      'زامن ردود فورم التذاكر الأوفلاين (Google Form) مباشرةً أو استورد ملفات إكسل الخاصة بالمنافذ لتحديث الحضور والإيرادات لحظياً.',
    importExcelFile: 'استيراد ملف إكسل',
    downloadTemplate: 'تحميل نموذج إكسل',
    hideManualEntry: 'إخفاء الإدخال اليدوي',
    addSingleSale: 'إضافة بيعة يدوية',
    exportExcel: 'تصدير إكسل',
    kpiOfflineOrders: 'طلبات أوفلاين',
    kpiOfflineTickets: 'تذاكر أوفلاين',
    kpiOfflineRevenue: 'إيرادات أوفلاين',
    kpiOfflineCheckedIn: 'دخول أوفلاين',
    scheduleConcertFirstWarn:
      'قم بجدولة حفل واحد على الأقل أولاً حتى يمكن ربط التذاكر الأوفلاين به.',
    excelPreviewTitle: 'معاينة استيراد الإكسل',
    worksheetLabel: 'ورقة العمل',
    reviewParsedHint: 'راجع الصفوف المقروءة بالأسفل قبل حفظها في قاعدة البيانات.',
    assignImportedConcert: 'ربط التذاكر المستوردة بالحفل',
    seatsLeftWord: 'مقعد متبقٍ',
    deductImportedPrefix: 'خصم التذاكر المدفوعة المستوردة',
    deductImportedSuffix: 'من المقاعد المتبقية للحفل',
    validRowsWord: 'صفوف صالحة',
    ticketsLower: 'تذكرة',
    skippedRowsWord: 'صفوف تم تخطيها لوجود أخطاء',
    rowWord: 'صف',
    moreSkippedRows: 'صفوف أخرى تم تخطيها…',
    colBuyer: 'المشتري',
    colCategory: 'الفئة',
    colQty: 'العدد',
    colTotal: 'الإجمالي',
    colOutletRef: 'المنفذ / المرجع',
    showingFirst50Prefix: 'عرض أول ٥٠ صفاً من إجمالي',
    showingFirst50Suffix: 'صفاً جاهزاً. سيتم استيراد جميع الصفوف الصالحة.',
    importingFirestore: 'جارٍ الحفظ في قاعدة البيانات...',
    confirmAndImport: 'تأكيد واستيراد',
    recordWord: 'سجل',
    recordsPlural: 'سجلات',
    logSingleOfflineTitle: 'تسجيل عملية بيع تذكرة أوفلاين',
    ticketCategoryLabel: 'فئة التذكرة',
    totalEgpAuto: 'الإجمالي (ج.م)',
    autoPrefix: 'تلقائي',
    buyerFullName: 'اسم المشتري بالكامل',
    emailOptional: 'البريد الإلكتروني (اختياري)',
    outletSellerReceipt: 'المنفذ / البائع / رقم الإيصال',
    deductFromSeats: 'خصم من المقاعد المتبقية للحفل',
    markAlreadyCheckedIn: 'تسجيل الحضور (تم الدخول) مباشرةً',
    saveOfflineSale: 'حفظ البيعة الأوفلاين',
    searchOfflinePlaceholder: 'ابحث في سجلات الأوفلاين...',
    allConcerts: 'جميع الحفلات',
    colConcertCategory: 'الحفل والفئة',
    colOutletSource: 'المنفذ / المصدر',
    noOfflineRecorded: 'لم يتم تسجيل مبيعات أوفلاين بعد.',
    noOfflineFilterMatch: 'لا توجد سجلات أوفلاين مطابقة لبحثك.',
    offlineEmptyGuide:
      'اضغط «استيراد ملف إكسل» بالأعلى لرفع شيت .xlsx/.csv (الأعمدة: الاسم، الموبايل، الفئة، العدد، الإجمالي، المنفذ) أو سجّل بيعة واحدة يدوياً.',

    // Admin Schedule
    scheduleTitle: 'جدولة حفل جديد في قنا',
    scheduleSubtitle: 'يُنشر الحفل فوراً في واجهة الموقع على جميع الأجهزة.',
    concertTitleLabel: 'اسم الحفل',
    headlinerArtistLabel: 'الفنان / الفرقة الرئيسية',
    venueQenaLabel: 'مكان الحفل في قنا',
    vibeGenreLabel: 'نوع الموسيقى / التصنيف',
    eventDateLabel: 'تاريخ الحفل',
    startTimeLabel: 'وقت البدء',
    totalCapacityLabel: 'السعة الإجمالية',
    customTierPricing: 'تسعير فئات التذاكر (ج.م)',
    autoSuggestFromSilver: 'اقتراح تلقائي من سيلفر',
    concertPosterLabel: 'بوستر الحفل (اختياري — رابط HTTPS أو رفع صورة مضغوطة)',
    compressedPosterReady: 'تم تجهيز البوستر المضغوط',
    removeBtn: 'إزالة',
    uploadImage: 'رفع صورة',
    eventDescriptionLabel: 'وصف الحفل',
    publishingConcert: 'جارٍ نشر الحفل...',
    publishConcertBtn: 'نشر الحفل في الجدول',

    // Tier Color Editor
    customColorsTitle: 'تخصيص ألوان فئات التذاكر',
    customColorsSubtitle:
      'فعّل الخيار لتحديد لون مميز لكل فئة (سيلفر، جولد، VIP، لاونج) بدقة عالية.',
    resetDefaults: 'استعادة الألوان الافتراضية',
    toggleColorsAria: 'تفعيل أو إيقاف تخصيص ألوان فئات التذاكر',
    usingDefaultPalette: 'الألوان الافتراضية قيد الاستخدام:',
    hexCodeLabel: 'كود اللون',
    invalidHexHint: 'أدخل كود لون Hex صحيح مكون من ٦ خانات.',

    // Admin Manage
    manageTitle: 'إدارة الحفلات وقائمة الانتظار',
    manageSubtitle:
      'عدّل جميع تفاصيل أي حفل منشور (الاسم، الفنان، المكان، التصنيف، التاريخ، الوقت، السعة، الأسعار، البوستر، والألوان) وصدّر كشوفات الحضور CSV.',
    exportAttendeesCsv: 'تصدير الحضور CSV',
    colShowVenue: 'الحفل والمكان',
    colSeatsLeft: 'المقاعد المتبقية',
    colTierPrices: 'أسعار الفئات (سيلفر / جولد / VIP / لاونج)',
    noLiveConcertsYet: 'لا توجد حفلات حالياً. قم بجدولة حفل جديد لنشره.',
    customPaletteTag: 'ألوان مخصصة',
    saveBtn: 'حفظ',
    editBtn: 'تعديل',
    editConcertTitle: 'تعديل تفاصيل الحفل المنشور',
    editConcertSubtitle: 'تُحفظ التعديلات وتظهر فوراً في واجهة الموقع على جميع الأجهزة.',
    seatsLeftLabel: 'المقاعد المتبقية',
    saveChangesBtn: 'حفظ التعديلات',
    savingChangesBtn: 'جارٍ حفظ التعديلات...',
    cancelBtn: 'إلغاء',
    bookedSeatsLabel: 'محجوز / مستخدم',
    confirmDeleteBtn: 'تأكيد الحذف',
    waitlistTitle: 'طلبات قائمة الانتظار (الحفلات المكتملة)',
    waitingWord: 'بالانتظار',
    noWaitlistYet: 'لا توجد طلبات انتظار بعد. عندما تنفد مقاعد أي حفل، يظهر المسجلون هنا.',
    colFan: 'المشجع',
    colMobile: 'الموبايل',
    copyBtn: 'نسخ',

    // Admin Promos
    createDiscountTitle: 'إنشاء كود خصم جديد',
    promoCodeLabel: 'كود الخصم',
    promoScopeLabel: 'الفئات المشمولة',
    allPassTiers: 'جميع فئات التذاكر',
    vipLoungeOnly: 'VIP ولاونج فقط',
    discountTypeLabel: 'نوع الخصم',
    percentOffOpt: 'نسبة مئوية (%)',
    flatEgpOffOpt: 'مبلغ ثابت (ج.م)',
    discountValueLabel: 'قيمة الخصم',
    displayLabelField: 'وصف الخصم الظاهر (اختياري)',
    savePromoCodeBtn: 'حفظ كود الخصم',
    liveDiscountCodesTitle: 'أكواد الخصم الحالية',
    totalCountWord: 'إجمالي',
    noPromosLive: 'لا توجد أكواد خصم مفعّلة. أنشئ كوداً جديداً لتقديم خصومات عند الحجز.',
    allTiersWord: 'كل الفئات',
    liveWord: 'مفعّل',
    hiddenWord: 'مخفي',

    // Admin Team
    authorizedTeamTitle: 'فريق الإدارة المصرح له',
    authorizedTeamSubtitle:
      'البريد الإلكتروني المفعّل المدرج هنا يحصل تلقائياً على صلاحية فتح مركز الإدارة.',
    staffNameLabel: 'اسم العضو',
    staffEmailLabel: 'البريد الإلكتروني',
    staffRoleLabel: 'الصلاحية',
    addBtn: 'إضافة',
    leadOrganizerPrimary: 'المنظم الرئيسي',
    activeSessionsTitle: 'الجلسات الإدارية النشطة',
    activeSessionsSubtitle:
      'المزامنة السحابية الفورية نشطة عبر جميع أجهزة المنظمين المفعّلين.',
    currentSessionActive: 'جلستك الحالية نشطة.',
  },
} as const;

export type TranslationKey = keyof typeof translations.en;
export type TranslationDict = Record<TranslationKey, string>;
