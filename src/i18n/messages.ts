import type { TierId } from '../types';
import { getTierCopy, type Language } from './catalogCopy';
import { enTranslations } from './en';
import { arTranslations } from './ar';

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
  'Your browser blocked the sign-in popup. Please allow popups for this site or sign in with Email & Password.':
    'قام المتصفح بحظر نافذة تسجيل الدخول المنبثقة. اسمح بالنوافذ المنبثقة لهذا الموقع أو سجّل الدخول بالبريد وكلمة المرور.',
  'Network error while connecting to authentication service. Check your internet connection and try again.':
    'خطأ في الشبكة أثناء الاتصال بخدمة تسجيل الدخول. تأكد من اتصالك بالإنترنت وحاول مرة أخرى.',
  'This account has been disabled. Please contact Gen Z Events support.':
    'تم تعطيل هذا الحساب. يرجى التواصل مع دعم Gen Z Events.',
  'Too many attempts. Please wait a moment and try again.':
    'محاولات كثيرة متتالية. يرجى الانتظار قليلاً ثم المحاولة مرة أخرى.',
  'Daily Firestore free-tier quota exceeded. Quota resets tomorrow.':
    'تم الوصول للحد اليومي لقاعدة البيانات. يتم التصفير تلقائياً غداً.',
  'Permission denied. Make sure your account is signed in and verified.':
    'ليست لديك صلاحية تنفيذ هذه العملية. تأكد من تسجيل الدخول وتفعيل بريدك الإلكتروني.',
  'This booking no longer exists or was already deleted.':
    'هذا الحجز لم يعد موجوداً أو تم حذفه مسبقاً.',
  'Booking code already exists. Please try again.':
    'كود الحجز موجود بالفعل. يرجى المحاولة مرة أخرى.',
  'This ticket has not been confirmed as paid yet.':
    'لم يتم تأكيد دفع هذه التذكرة بعد.',
  'This ticket is already fully checked in.':
    'تم استخدام هذه التذكرة وتسجيل دخول جميع أفرادها بالفعل.',
  'Unable to reach the server. Check your internet connection and try again.':
    'تعذر الاتصال بالخادم. تأكد من اتصالك بالإنترنت وحاول مرة أخرى.',
  'Request timed out. Please check your connection and try again.':
    'انتهت مهلة الطلب. يرجى التحقق من اتصال الإنترنت والمحاولة مرة أخرى.',
  'This record was just updated on another device. Please try again.':
    'تم تحديث هذا السجل للتو من جهاز آخر. يرجى المحاولة مرة أخرى.',
  'Spreadsheet file is too large (max 10 MB).':
    'حجم ملف الإكسل كبير جداً (الحد الأقصى ١٠ ميجابايت).',
  'Please upload an Excel (.xlsx / .xls) or CSV (.csv) spreadsheet.':
    'يرجى رفع ملف إكسل (.xlsx / .xls) أو ملف CSV (.csv).',
  'The uploaded spreadsheet has no worksheets.':
    'الملف المرفوع لا يحتوي على أي أوراق عمل.',
  'No data rows found in the first worksheet.':
    'لم يتم العثور على صفوف بيانات في ورقة العمل الأولى.',
  'Please split spreadsheets larger than 2,000 rows into smaller batches.':
    'يرجى تقسيم الملفات التي تزيد عن ٢٬٠٠٠ صف إلى دفعات أصغر.',
};

const VALID_TIER_IDS: readonly TierId[] = ['Silver', 'Gold', 'VIP', 'Lounge'];

function formatLocalizedTierList(tiers: readonly TierId[], lang: Language): string {
  const names = tiers.map((tierId) => getTierCopy(tierId, lang).name);
  if (names.length <= 1) return names[0] ?? '';
  if (lang === 'ar') {
    if (names.length === 2) return `${names[0]} و ${names[1]}`;
    return `${names.slice(0, -1).join('، ')} و ${names[names.length - 1]}`;
  }
  if (names.length === 2) return `${names[0]} & ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`;
}

export function formatPromoTiersSummary(tiers: readonly TierId[], lang: Language): string {
  const unique = VALID_TIER_IDS.filter((tierId) => tiers.includes(tierId));
  if (unique.length === 0 || unique.length === VALID_TIER_IDS.length) {
    return (lang === 'ar' ? arTranslations.allTiersWord : enTranslations.allTiersWord);
  }
  if (unique.length === 1) {
    return `${getTierCopy(unique[0], lang).name} ${(lang === 'ar' ? arTranslations.promoOnlySuffix : enTranslations.promoOnlySuffix)}`;
  }
  return formatLocalizedTierList(unique, lang);
}

export function localizeKnownMessage(msg: string, lang: Language): string {
  if (!msg) return msg;
  const appliesOnly = /^([A-Z0-9_-]+) applies only to (.+) passes\.$/.exec(msg);
  if (appliesOnly) {
    const rawParts = appliesOnly[2]
      .split(/\s*(?:,|&)\s*/)
      .map((part) => part.trim())
      .filter(Boolean);
    const matchedTiers = rawParts.filter((part): part is TierId =>
      (VALID_TIER_IDS as readonly string[]).includes(part),
    );
    const localizedList =
      matchedTiers.length === rawParts.length && matchedTiers.length > 0
        ? formatLocalizedTierList(matchedTiers, lang)
        : appliesOnly[2];
    if (lang === 'en') {
      return `${appliesOnly[1]} applies only to ${localizedList} passes.`;
    }
    const tierWord = matchedTiers.length === 1 ? 'فئة' : 'فئات';
    return `الكود ${appliesOnly[1]} ينطبق فقط على ${tierWord} ${localizedList}.`;
  }
  if (lang === 'en') return msg;
  if (EN_TO_AR_MESSAGES[msg]) return EN_TO_AR_MESSAGES[msg];
  if (msg.startsWith('Quantity must be between 1 and ')) {
    const max = msg.replace('Quantity must be between 1 and ', '').replace('.', '');
    return `يجب أن يكون عدد التذاكر بين ١ و ${max}.`;
  }
  const promoApplied = /^(.+) applied \(-(.+) EGP\)$/.exec(msg);
  if (promoApplied) {
    return `تم تطبيق الخصم: ${promoApplied[1]} (-${promoApplied[2]} ج.م)`;
  }
  return msg;
}
