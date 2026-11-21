import React, { useState } from 'react';
import { ShieldCheck, Trash2, UserPlus, Users } from 'lucide-react';
import { PRIMARY_ADMIN_EMAIL } from '../../data/defaults';
import { adminAddMember, adminRemoveMember } from '../../services/firestoreService';
import { formatFriendlyFirebaseError } from '../../firebase';
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
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<AdminRole>('Gate Staff');
  const [busy, setBusy] = useState(false);

  const handleAddAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim().replace(/\s+/g, ' ');
    const emailCheck = validateEmailAddress(email, { allowDisposable: true });
    if (cleanName.length < 2 || cleanName.length > 100 || !emailCheck.valid) {
      onNotify(emailCheck.error || 'Enter a valid staff name (2–100 chars) and verified email address.');
      return;
    }
    setBusy(true);
    try {
      await adminAddMember(cleanName, emailCheck.normalized, role, currentAdminEmail);
      setName('');
      setEmail('');
      onNotify(`Authorized ${emailCheck.normalized} as ${role}.`);
    } catch (err) {
      onNotify(formatFriendlyFirebaseError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (member: AdminMember) => {
    if (member.email.toLowerCase() === PRIMARY_ADMIN_EMAIL.toLowerCase()) {
      onNotify('Primary organizer account cannot be removed.');
      return;
    }
    try {
      await adminRemoveMember(member.id);
      onNotify(`Revoked staff access for ${member.email}.`);
    } catch (err) {
      onNotify(formatFriendlyFirebaseError(err));
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Authorized Team */}
      <div className="lg:col-span-7 bg-[#101218] border border-white/10 rounded-xl p-5 space-y-5">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <div>
            <h2 className="font-display font-bold text-lg text-white">Authorized Staff Team</h2>
            <p className="text-xs text-slate-400">
              Verified emails listed here automatically unlock the Staff Command Center.
            </p>
          </div>
        </div>

        <form onSubmit={handleAddAdmin} className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
          <input
            type="text"
            required
            maxLength={100}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Staff Name"
            className="sm:col-span-4 px-3 py-2 rounded-lg bg-[#08090C] border border-white/12 text-xs text-white"
          />
          <input
            type="email"
            required
            maxLength={120}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="staff@example.com"
            className="sm:col-span-4 px-3 py-2 rounded-lg bg-[#08090C] border border-white/12 text-xs text-white"
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as AdminRole)}
            className="sm:col-span-2 px-2.5 py-2 rounded-lg bg-[#08090C] border border-white/12 text-xs text-white"
          >
            <option value="Gate Staff">Gate Staff</option>
            <option value="Super Admin">Super Admin</option>
          </select>
          <button
            type="submit"
            disabled={busy}
            className="sm:col-span-2 inline-flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-xs font-semibold text-white"
          >
            <UserPlus className="w-3.5 h-3.5" />
            Add
          </button>
        </form>

        <div className="divide-y divide-white/8 border-t border-white/8">
          <div className="py-3 flex items-center justify-between text-xs">
            <div>
              <p className="font-semibold text-white">Lead Organizer (Primary)</p>
              <p className="text-[11px] font-mono-num text-slate-400">{PRIMARY_ADMIN_EMAIL}</p>
            </div>
            <span className="font-mono-num text-[11px] text-amber-300 font-semibold">Super Admin</span>
          </div>
          {admins
            .filter((a) => a.email.toLowerCase() !== PRIMARY_ADMIN_EMAIL.toLowerCase())
            .map((member) => (
              <div key={member.id} className="py-3 flex items-center justify-between text-xs">
                <div>
                  <p className="font-semibold text-white">{member.name}</p>
                  <p className="text-[11px] font-mono-num text-slate-400">{member.email}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono-num text-[11px] text-slate-300">{member.role}</span>
                  <button
                    type="button"
                    onClick={() => void handleRemove(member)}
                    aria-label={`Remove ${member.email}`}
                    className="p-1 text-slate-400 hover:text-rose-400"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
        </div>
      </div>

      {/* Active Sessions */}
      <div className="lg:col-span-5 bg-[#101218] border border-white/10 rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-cyan-400" />
          <h3 className="font-display font-bold text-lg text-white">Active Staff Sessions</h3>
        </div>
        <p className="text-xs text-slate-400">
          Real-time Firestore Cloud Sync is active across all verified organizer devices.
        </p>
        <div className="divide-y divide-white/8 border-t border-white/8">
          {sessions.length === 0 ? (
            <p className="py-6 text-xs text-slate-500 text-center">Current session active.</p>
          ) : (
            sessions.map((s) => (
              <div key={s.id} className="py-3 flex items-center justify-between gap-2 text-xs">
                <div className="min-w-0">
                  <p className="font-medium text-white truncate">{s.name}</p>
                  <p className="text-[11px] text-slate-400 truncate">{s.email}</p>
                </div>
                <span className="text-[11px] font-mono-num text-emerald-400 shrink-0">{s.role}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
