import React, { useState } from 'react';
import { ShieldCheck, Trash2, UserPlus, Users, X } from 'lucide-react';
import { PRIMARY_ADMIN_EMAIL } from '../../data/defaults';
import { adminAddMember, adminRemoveMember } from '../../services/firestoreService';
import { formatFriendlyFirebaseError } from '../../firebase';
import { useLanguage } from '../../i18n/LanguageContext';
import { getAdminRoleLabel, localizeKnownMessage } from '../../i18n/translations';
import { validateEmailAddress } from '../../utils/bookingLogic';
import type { AdminMember, AdminRole, AdminSession } from '../../types';

interface AdminTeamProps {
  admins: AdminMember[];
  sessions: AdminSession[];
  currentAdminEmail: string;
  onNotify: (msg: string) => void;
}

export const AdminTeam: React.FC<AdminTeamProps> = ({
  admins,
  sessions,
  currentAdminEmail,
  onNotify,
}) => {
  const { lang, t } = useLanguage();
  const isAr = lang === 'ar';

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<AdminRole>('Gate Staff');
  const [busy, setBusy] = useState(false);
  const [busyMemberId, setBusyMemberId] = useState<string | null>(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);

  const handleAddAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const cleanName = name.trim().replace(/\s+/g, ' ');
    const emailCheck = validateEmailAddress(email, { allowDisposable: true });
    if (cleanName.length < 2 || cleanName.length > 100 || !emailCheck.valid) {
      onNotify(
        emailCheck.error
          ? localizeKnownMessage(emailCheck.error, lang)
          : isAr
            ? 'أدخل اسماً صحيحاً للعضو (٢–١٠٠ حرف) وبريداً إلكترونياً مفعّلاً.'
            : 'Enter a valid staff name (2–100 chars) and verified email address.',
      );
      return;
    }
    setBusy(true);
    try {
      await adminAddMember(cleanName, emailCheck.normalized, role, currentAdminEmail);
      setName('');
      setEmail('');
      onNotify(
        isAr
          ? `تم تفويض ${emailCheck.normalized} بصلاحية ${getAdminRoleLabel(role, lang)}.`
          : `Authorized ${emailCheck.normalized} as ${role}.`,
      );
    } catch (err) {
      onNotify(localizeKnownMessage(formatFriendlyFirebaseError(err), lang));
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (member: AdminMember) => {
    if (busyMemberId === member.id) return;
    if (member.email.toLowerCase() === PRIMARY_ADMIN_EMAIL.toLowerCase()) {
      onNotify(
        isAr
          ? 'لا يمكن إزالة حساب المنظم الرئيسي.'
          : 'Primary organizer account cannot be removed.',
      );
      return;
    }
    if (member.email.toLowerCase() === currentAdminEmail.trim().toLowerCase()) {
      onNotify(
        isAr
          ? 'لا يمكنك إزالة حسابك النشط حالياً.'
          : 'You cannot revoke your own currently active admin account.',
      );
      return;
    }
    setBusyMemberId(member.id);
    try {
      await adminRemoveMember(member.id);
      setConfirmRemoveId(null);
      onNotify(
        isAr
          ? `تم إلغاء صلاحية الفريق لحساب ${member.email}.`
          : `Revoked staff access for ${member.email}.`,
      );
    } catch (err) {
      onNotify(localizeKnownMessage(formatFriendlyFirebaseError(err), lang));
    } finally {
      setBusyMemberId(null);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Authorized Team */}
      <div className="lg:col-span-7 bg-[#101218] border border-white/10 rounded-xl p-5 space-y-5">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <div>
            <h2 className="font-display font-bold text-lg text-white">{t.authorizedTeamTitle}</h2>
            <p className="text-xs text-slate-400">{t.authorizedTeamSubtitle}</p>
          </div>
        </div>

        <form onSubmit={handleAddAdmin} className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
          <div className="sm:col-span-4">
            <label htmlFor="team-name" className="block text-[11px] font-medium text-slate-300 mb-1">
              {t.staffNameLabel}
            </label>
            <input
              id="team-name"
              type="text"
              required
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[#08090C] border border-white/12 text-xs text-white focus:outline-none focus:border-white/50"
            />
          </div>
          <div className="sm:col-span-4">
            <label htmlFor="team-email" className="block text-[11px] font-medium text-slate-300 mb-1">
              {t.staffEmailLabel}
            </label>
            <input
              id="team-email"
              type="email"
              dir="ltr"
              required
              maxLength={120}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[#08090C] border border-white/12 text-xs text-white focus:outline-none focus:border-white/50"
            />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="team-role" className="block text-[11px] font-medium text-slate-300 mb-1">
              {t.staffRoleLabel}
            </label>
            <select
              id="team-role"
              value={role}
              onChange={(e) => setRole(e.target.value as AdminRole)}
              className="w-full px-2.5 py-2 rounded-lg bg-[#08090C] border border-white/12 text-xs text-white focus:outline-none focus:border-white/50"
            >
              <option value="Gate Staff">{getAdminRoleLabel('Gate Staff', lang)}</option>
              <option value="Super Admin">{getAdminRoleLabel('Super Admin', lang)}</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={busy}
            className="sm:col-span-2 inline-flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-white hover:bg-neutral-200 disabled:opacity-60 text-xs font-semibold text-[#08090C] transition-colors"
          >
            <UserPlus className="w-3.5 h-3.5" />
            {t.addBtn}
          </button>
        </form>

        <div className="divide-y divide-white/8 border-t border-white/8">
          <div className="py-3 flex items-center justify-between text-xs">
            <div>
              <p className="font-semibold text-white">{t.leadOrganizerPrimary}</p>
              <p dir="ltr" className="text-[11px] font-mono-num text-slate-400 inline-block">
                {PRIMARY_ADMIN_EMAIL}
              </p>
            </div>
            <span className="font-mono-num text-[11px] text-amber-300 font-semibold">
              {getAdminRoleLabel('Super Admin', lang)}
            </span>
          </div>
          {admins
            .filter((a) => a.email.toLowerCase() !== PRIMARY_ADMIN_EMAIL.toLowerCase())
            .map((member) => (
              <div key={member.id} className="py-3 flex items-center justify-between text-xs">
                <div>
                  <p className="font-semibold text-white">{member.name}</p>
                  <p dir="ltr" className="text-[11px] font-mono-num text-slate-400 inline-block">
                    {member.email}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono-num text-[11px] text-slate-300">
                    {getAdminRoleLabel(member.role, lang)}
                  </span>
                  {confirmRemoveId === member.id ? (
                    <span className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        disabled={busyMemberId === member.id}
                        onClick={() => void handleRemove(member)}
                        className="px-2 py-1 rounded bg-rose-600 text-white text-[11px] font-semibold disabled:opacity-50"
                      >
                        {t.sureBtn}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmRemoveId(null)}
                        aria-label={t.cancelDeleteAria}
                        className="p-1 text-slate-400 hover:text-white"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={busyMemberId === member.id}
                      onClick={() => setConfirmRemoveId(member.id)}
                      aria-label={isAr ? `إزالة ${member.email}` : `Remove ${member.email}`}
                      className="p-1 text-slate-400 hover:text-rose-400 disabled:opacity-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
        </div>
      </div>

      {/* Active Sessions */}
      <div className="lg:col-span-5 bg-[#101218] border border-white/10 rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-cyan-400" />
          <h3 className="font-display font-bold text-lg text-white">{t.activeSessionsTitle}</h3>
        </div>
        <p className="text-xs text-slate-400">{t.activeSessionsSubtitle}</p>
        <div className="divide-y divide-white/8 border-t border-white/8">
          {sessions.length === 0 ? (
            <p className="py-6 text-xs text-slate-500 text-center">{t.currentSessionActive}</p>
          ) : (
            sessions.map((s) => (
              <div key={s.id} className="py-3 flex items-center justify-between gap-2 text-xs">
                <div className="min-w-0">
                  <p className="font-medium text-white truncate">{s.name}</p>
                  <p dir="ltr" className="text-[11px] text-slate-400 truncate">
                    {s.email}
                  </p>
                </div>
                <span className="text-[11px] font-mono-num text-emerald-400 shrink-0">
                  {getAdminRoleLabel(s.role, lang)}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

