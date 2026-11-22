import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  BarChart3,
  CalendarPlus,
  QrCode,
  Settings2,
  Tag,
  Users,
} from 'lucide-react';
import { BrandLogo } from '../BrandLogo';
import type {
  AdminMember,
  AdminSession,
  Booking,
  Concert,
  Promo,
  WaitlistEntry,
} from '../../types';
import { computeAdminKpis } from '../../utils/bookingLogic';
import { AdminDashboard } from './AdminDashboard';
import { AdminCheckin } from './AdminCheckin';
import { AdminSchedule } from './AdminSchedule';
import { AdminManage } from './AdminManage';
import { AdminContentPromos } from './AdminContentPromos';
import { AdminTeam } from './AdminTeam';

type AdminTab = 'dashboard' | 'checkin' | 'schedule' | 'manage' | 'promos' | 'team';

interface AdminWorkspaceProps {
  concerts: Concert[];
  bookings: Booking[];
  promos: Promo[];
  waitlist: WaitlistEntry[];
  admins: AdminMember[];
  sessions: AdminSession[];
  adminName: string;
  adminEmail: string;
  onExit: () => void;
  onNotify: (msg: string) => void;
}

export const AdminWorkspace: React.FC<AdminWorkspaceProps> = ({
  concerts,
  bookings,
  promos,
  waitlist,
  admins,
  sessions,
  adminName,
  adminEmail,
  onExit,
  onNotify,
}) => {
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');
  const kpis = useMemo(() => computeAdminKpis(concerts, bookings), [concerts, bookings]);

  const navItems: { id: AdminTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'dashboard', label: 'Analytics & Logs', icon: BarChart3 },
    { id: 'checkin', label: 'Gate QR Check-In', icon: QrCode },
    { id: 'schedule', label: 'Schedule Concert', icon: CalendarPlus },
    { id: 'manage', label: 'Manage & CSV', icon: Settings2 },
    { id: 'promos', label: 'Promo Codes', icon: Tag },
    { id: 'team', label: 'Admin Team', icon: Users },
  ];

  return (
    <div className="min-h-screen bg-[#08090C] text-[#F5F6F8] flex flex-col">
      {/* Top Bar */}
      <header className="sticky top-0 z-30 h-16 border-b border-white/10 bg-[#0B0D12]/95 backdrop-blur-md px-4 sm:px-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <BrandLogo size="sm" />
          <div className="min-w-0">
            <p className="font-display font-bold text-sm sm:text-base text-white truncate">
              Gen Z Events · Staff Command Center
            </p>
            <p className="text-[11px] text-slate-400 truncate">
              {adminName} · {adminEmail}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onExit}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-white/15 bg-white/[0.04] hover:bg-white/[0.08] text-xs font-semibold text-white whitespace-nowrap shrink-0"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Storefront
        </button>
      </header>

      <div className="flex-1 flex flex-col lg:flex-row max-w-[1600px] w-full mx-auto">
        {/* Sidebar Navigation */}
        <aside className="lg:w-60 shrink-0 border-b lg:border-b-0 lg:border-r border-white/10 bg-[#0B0D12] p-3 lg:p-4">
          <nav
            aria-label="Staff portal navigation"
            className="flex lg:flex-col gap-1.5 overflow-x-auto lg:overflow-visible pb-1 lg:pb-0"
          >
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`inline-flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-white text-[#08090C]'
                      : 'text-slate-400 hover:text-white hover:bg-white/[0.05]'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  {item.label}
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 space-y-6 min-w-0">
          {/* Global KPI Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {[
              { label: 'Live Events', value: kpis.liveEvents.toString(), tone: 'text-white' },
              { label: 'Seats Left', value: kpis.seatsRemaining.toLocaleString(), tone: 'text-white' },
              { label: 'Tickets Sold', value: kpis.ticketsSold.toLocaleString(), tone: 'text-amber-300' },
              { label: 'Checked In', value: kpis.checkedIn.toLocaleString(), tone: 'text-emerald-400' },
              {
                label: 'Paid Revenue',
                value: `${kpis.totalRevenueEgp.toLocaleString()} EGP`,
                tone: 'text-white',
              },
            ].map((stat) => (
              <div
                key={stat.label}
                className="bg-[#101218] border border-white/10 rounded-xl px-4 py-3.5"
              >
                <p className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
                  {stat.label}
                </p>
                <p className={`font-mono-num text-lg sm:text-xl font-bold mt-1 ${stat.tone}`}>
                  {stat.value}
                </p>
              </div>
            ))}
          </div>

          {/* Active Workspace Panel */}
          {activeTab === 'dashboard' && (
            <AdminDashboard
              concerts={concerts}
              bookings={bookings}
              adminEmail={adminEmail}
              onNotify={onNotify}
            />
          )}
          {activeTab === 'checkin' && (
            <AdminCheckin
              bookings={bookings}
              adminName={adminName}
              onNotify={onNotify}
            />
          )}
          {activeTab === 'schedule' && (
            <AdminSchedule
              onNotify={onNotify}
              onCreated={() => setActiveTab('manage')}
            />
          )}
          {activeTab === 'manage' && (
            <AdminManage
              concerts={concerts}
              bookings={bookings}
              waitlist={waitlist}
              onNotify={onNotify}
            />
          )}
          {activeTab === 'promos' && (
            <AdminContentPromos
              promos={promos}
              onNotify={onNotify}
            />
          )}
          {activeTab === 'team' && (
            <AdminTeam
              admins={admins}
              sessions={sessions}
              currentAdminEmail={adminEmail}
              onNotify={onNotify}
            />
          )}
        </main>
      </div>
    </div>
  );
};
