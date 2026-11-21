import React, { useState } from 'react';
import { MailCheck, Menu, Shield, Ticket, User as UserIcon, X } from 'lucide-react';
import type { User } from 'firebase/auth';
import { isPendingEmailVerification, isVerifiedFanAccount } from '../utils/bookingLogic';

interface HeaderProps {
  user: User | null;
  displayName: string;
  ticketCount: number;
  isAdmin: boolean;
  onOpenTickets: () => void;
  onOpenAuthProfile: () => void;
  onOpenAdmin: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  user,
  displayName,
  ticketCount,
  isAdmin,
  onOpenTickets,
  onOpenAuthProfile,
  onOpenAdmin,
}) => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const isVerifiedUser = isVerifiedFanAccount(user);
  const isPendingVerification = isPendingEmailVerification(user);

  const navLinks = [
    { href: '#lineup', label: 'Lineup' },
    { href: '#passes', label: 'Pass Tiers' },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[#08090C]/85 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Zone 1: Brand */}
        <a href="#top" className="flex items-center gap-3 shrink-0 group">
          <span className="w-9 h-9 rounded-lg bg-rose-600 flex items-center justify-center font-display font-extrabold text-white text-sm tracking-tight group-hover:bg-rose-500 transition-colors">
            GZ
          </span>
          <div className="flex flex-col leading-none">
            <span className="font-display font-extrabold text-base tracking-tight text-white">
              GEN Z EVENTS
            </span>
            <span className="text-[11px] uppercase tracking-[0.18em] text-slate-400 mt-0.5">
              Qena · Live
            </span>
          </div>
        </a>

        {/* Zone 2: Desktop Navigation */}
        <nav aria-label="Primary navigation" className="hidden md:flex items-center gap-8">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-slate-300 hover:text-white transition-colors whitespace-nowrap"
            >
              {link.label}
            </a>
          ))}
        </nav>

        {/* Zone 3: Actions */}
        <div className="hidden md:flex items-center gap-2.5 shrink-0">
          {isAdmin && (
            <button
              type="button"
              onClick={onOpenAdmin}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-amber-400/30 bg-amber-400/10 text-amber-300 hover:bg-amber-400/20 text-xs font-semibold transition-colors whitespace-nowrap"
            >
              <Shield className="w-3.5 h-3.5" />
              Staff Portal
            </button>
          )}
          <button
            type="button"
            onClick={onOpenTickets}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-white/12 bg-white/[0.04] hover:bg-white/[0.08] text-sm font-medium text-white transition-colors whitespace-nowrap"
          >
            <Ticket className="w-4 h-4 text-rose-400" />
            <span>My Tickets</span>
            {ticketCount > 0 && (
              <span className="font-mono-num text-xs font-bold text-rose-300">
                ({ticketCount})
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={onOpenAuthProfile}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap ${
              isPendingVerification
                ? 'border border-amber-400/40 bg-amber-400/15 text-amber-200 hover:bg-amber-400/25'
                : 'bg-rose-600 hover:bg-rose-500 text-white'
            }`}
          >
            {isPendingVerification ? <MailCheck className="w-4 h-4" /> : <UserIcon className="w-4 h-4" />}
            <span className="max-w-[130px] truncate">
              {isVerifiedUser ? displayName || 'Account' : isPendingVerification ? 'Verify Email' : 'Sign In'}
            </span>
          </button>
        </div>

        {/* Mobile Actions */}
        <div className="flex md:hidden items-center gap-2">
          <button
            type="button"
            onClick={onOpenTickets}
            aria-label="My Tickets"
            className="relative p-2 rounded-lg border border-white/12 bg-white/[0.04] text-white"
          >
            <Ticket className="w-4 h-4 text-rose-400" />
            {ticketCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-[10px] font-mono-num font-bold flex items-center justify-center">
                {ticketCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setMobileOpen((prev) => !prev)}
            aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={mobileOpen}
            className="p-2 rounded-lg border border-white/12 bg-white/[0.04] text-white"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="md:hidden border-t border-white/10 bg-[#0C0E14] px-4 py-4 space-y-3">
          <div className="flex flex-col space-y-1">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className="px-3 py-2.5 rounded-lg text-sm font-medium text-slate-200 hover:bg-white/[0.05] hover:text-white"
              >
                {link.label}
              </a>
            ))}
          </div>
          <div className="pt-3 border-t border-white/10 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => {
                setMobileOpen(false);
                onOpenAuthProfile();
              }}
              className={`w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold ${
                isPendingVerification
                  ? 'border border-amber-400/40 bg-amber-400/15 text-amber-200'
                  : 'bg-rose-600 hover:bg-rose-500 text-white'
              }`}
            >
              {isPendingVerification ? <MailCheck className="w-4 h-4" /> : <UserIcon className="w-4 h-4" />}
              {isVerifiedUser
                ? `Profile · ${displayName || 'Account'}`
                : isPendingVerification
                  ? 'Verify Your Email'
                  : 'Sign In / Sign Up'}
            </button>
            <button
              type="button"
              onClick={() => {
                setMobileOpen(false);
                onOpenTickets();
              }}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-white/12 bg-white/[0.04] text-sm font-medium text-white"
            >
              <Ticket className="w-4 h-4 text-rose-400" />
              My Tickets {ticketCount > 0 ? `(${ticketCount})` : ''}
            </button>
            {isAdmin && (
              <button
                type="button"
                onClick={() => {
                  setMobileOpen(false);
                  onOpenAdmin();
                }}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-amber-400/30 bg-amber-400/10 text-amber-300 text-sm font-semibold"
              >
                <Shield className="w-4 h-4" />
                Open Staff Portal
              </button>
            )}
          </div>
        </div>
      )}
    </header>
  );
};
