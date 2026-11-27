import type {
  AdminRole,
  AuditAction,
  OnlinePaymentMethodId,
  PaymentConfig,
  PaymentMethodId,
  TierId,
} from '../types';
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

export const AUDIT_ACTION_LABELS: Record<Language, Record<AuditAction, string>> = {
  en: {
    payment_confirmed: 'Payment Confirmed',
    payment_undone: 'Payment Undone',
    payment_confirmed_checkin: 'Paid + Checked In',
    checkin: 'Gate Check-In',
    checkin_undone: 'Check-In Reverted',
    booking_deleted: 'Booking Deleted',
    offline_sale_created: 'Offline Sale',
    offline_import: 'Offline Bulk Import',
    concert_created: 'Concert Created',
    concert_updated: 'Concert Updated',
    concert_deleted: 'Concert Deleted',
    promo_saved: 'Promo Saved',
    promo_toggled: 'Promo Visibility',
    promo_deleted: 'Promo Deleted',
    staff_saved: 'Staff Authorized',
    staff_removed: 'Staff Revoked',
    payment_numbers_updated: 'Payment Numbers Updated',
  },
  ar: {
    payment_confirmed: 'تأكيد دفع',
    payment_undone: 'تراجع عن الدفع',
    payment_confirmed_checkin: 'تأكيد دفع + دخول',
    checkin: 'تسجيل دخول بوابة',
    checkin_undone: 'تراجع عن الدخول',
    booking_deleted: 'حذف حجز',
    offline_sale_created: 'بيع أوفلاين',
    offline_import: 'استيراد أوفلاين جماعي',
    concert_created: 'إنشاء حفل',
    concert_updated: 'تعديل حفل',
    concert_deleted: 'حذف حفل',
    promo_saved: 'حفظ كود خصم',
    promo_toggled: 'تغيير حالة كود خصم',
    promo_deleted: 'حذف كود خصم',
    staff_saved: 'تفويض عضو فريق',
    staff_removed: 'إلغاء صلاحية عضو',
    payment_numbers_updated: 'تحديث أرقام الدفع',
  },
};

export function getAuditActionLabel(action: AuditAction, lang: Language): string {
  return AUDIT_ACTION_LABELS[lang][action] || action;
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
