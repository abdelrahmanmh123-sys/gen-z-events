import React, { useState } from 'react';
import { MailCheck, Menu, Shield, Ticket, User as UserIcon, X } from 'lucide-react';
import type { User } from 'firebase/auth';
import { isPendingEmailVerification, isVerifiedFanAccount } from '../utils/bookingLogic';
import { BrandLogo } from './BrandLogo';

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
        <a href="#top" className="flex items-center gap-3 shrink-0 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 rounded-lg">
          <BrandLogo size="md" className="group-hover:border-white/40 transition-colors" />
          <span className="font-display font-extrabold text-base tracking-tight text-white whitespace-nowrap">
            GEN Z EVENTS
          </span>
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
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-white/15 bg-white/[0.04] hover:bg-white/[0.1] hover:border-white/25 text-sm font-medium text-white transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          >
            <Ticket className="w-4 h-4 text-neutral-300" />
            <span>My Tickets</span>
            {ticketCount > 0 && (
              <span className="font-mono-num text-xs font-bold text-white">
                ({ticketCount})
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={onOpenAuthProfile}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 ${
              isPendingVerification
                ? 'border border-amber-400/40 bg-amber-400/15 text-amber-200 hover:bg-amber-400/25'
                : 'bg-white hover:bg-neutral-200 text-[#08090C]'
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
            className="relative p-2 rounded-lg border border-white/15 bg-white/[0.04] hover:bg-white/[0.08] text-white"
          >
            <Ticket className="w-4 h-4 text-white" />
            {ticketCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-white text-[#08090C] text-[10px] font-mono-num font-bold flex items-center justify-center">
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
              className={`w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                isPendingVerification
                  ? 'border border-amber-400/40 bg-amber-400/15 text-amber-200'
                  : 'bg-white hover:bg-neutral-200 text-[#08090C]'
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
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-white/15 bg-white/[0.04] hover:bg-white/[0.08] text-sm font-medium text-white"
            >
              <Ticket className="w-4 h-4 text-neutral-300" />
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
