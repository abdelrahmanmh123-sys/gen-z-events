import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  BarChart3,
  CalendarPlus,
  ClipboardList,
  Globe,
  QrCode,
  Settings2,
  Store,
  Tag,
  Users,
} from 'lucide-react';
import { BrandLogo } from '../BrandLogo';
import type {
  AdminMember,
  AdminRole,
  AdminSession,
  Booking,
  Concert,
  Promo,
  WaitlistEntry,
} from '../../types';
import {
  computeAdminKpis,
  getStaffPermissions,
  type AdminTab,
} from '../../utils/bookingLogic';
import { useLanguage } from '../../i18n/LanguageContext';
import { formatCurrencyEgp, getAdminRoleLabel } from '../../i18n/translations';
import { AdminDashboard } from './AdminDashboard';
import { AdminCheckin } from './AdminCheckin';
import { AdminOfflineTickets } from './AdminOfflineTickets';
import { AdminSchedule } from './AdminSchedule';
import { AdminManage } from './AdminManage';
import { AdminContentPromos } from './AdminContentPromos';
import { AdminTeam } from './AdminTeam';

interface AdminWorkspaceProps {
  concerts: Concert[];
  bookings: Booking[];
  promos: Promo[];
  waitlist: WaitlistEntry[];
  admins: AdminMember[];
  sessions: AdminSession[];
  adminName: string;
  adminEmail: string;
  adminRole: AdminRole;
  isVerifiedStaff: boolean;
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
  adminRole,
  isVerifiedStaff,
  onExit,
  onNotify,
}) => {
  const { lang, toggleLang, t } = useLanguage();
  const permissions = useMemo(() => getStaffPermissions(adminRole), [adminRole]);
  const [activeTab, setActiveTab] = useState<AdminTab>(() => permissions.defaultTab);

  // Enforce strict RBAC tab clamping if staff role changes dynamically
  useEffect(() => {
    if (!permissions.allowedTabs.includes(activeTab)) {
      setActiveTab(permissions.defaultTab);
    }
  }, [permissions, activeTab]);

  const effectiveTab: AdminTab = permissions.allowedTabs.includes(activeTab)
    ? activeTab
    : permissions.defaultTab;

  const kpis = useMemo(() => computeAdminKpis(concerts, bookings), [concerts, bookings]);
  const offlineCount = useMemo(
    () => bookings.filter((b) => b.paymentMethod === 'Offline').length,
    [bookings],
  );

  const navItems = useMemo(() => {
    const allItems: {
      id: AdminTab;
      label: string;
      icon: React.ComponentType<{ className?: string }>;
      badge?: number;
    }[] = permissions.isSuperAdmin
      ? [
          { id: 'dashboard', label: t.tabDashboard, icon: BarChart3 },
          { id: 'checkin', label: t.tabCheckin, icon: QrCode },
          {
            id: 'offline',
            label: t.tabOffline,
            icon: Store,
            badge: offlineCount > 0 ? offlineCount : undefined,
          },
          { id: 'schedule', label: t.tabSchedule, icon: CalendarPlus },
          { id: 'manage', label: t.tabManage, icon: Settings2 },
          { id: 'promos', label: t.tabPromos, icon: Tag },
          { id: 'team', label: t.tabTeam, icon: Users },
        ]
      : [
          { id: 'checkin', label: t.tabCheckin, icon: QrCode },
          {
            id: 'offline',
            label: t.tabOffline,
            icon: Store,
            badge: offlineCount > 0 ? offlineCount : undefined,
          },
          { id: 'dashboard', label: t.tabRecentApprovals, icon: ClipboardList },
        ];
    return allItems.filter((item) => permissions.allowedTabs.includes(item.id));
  }, [permissions, t, offlineCount]);

  const visibleKpis = useMemo(() => {
    const base: Array<{ label: string; value: string; tone: string; isPrice?: boolean }> = [
      { label: t.kpiLiveEvents, value: kpis.liveEvents.toString(), tone: 'text-white' },
      { label: t.kpiSeatsLeft, value: kpis.seatsRemaining.toLocaleString(), tone: 'text-white' },
      { label: t.kpiTicketsSold, value: kpis.ticketsSold.toLocaleString(), tone: 'text-amber-300' },
      { label: t.kpiCheckedIn, value: kpis.checkedIn.toLocaleString(), tone: 'text-emerald-400' },
    ];
    if (permissions.canViewRevenueAnalytics) {
      base.push({
        label: t.kpiPaidRevenue,
        value: formatCurrencyEgp(kpis.totalRevenueEgp, lang),
        tone: 'text-white',
        isPrice: true,
      });
    }
    return base;
  }, [kpis, lang, permissions.canViewRevenueAnalytics, t]);

  return (
    <div className="min-h-screen bg-[#08090C] text-[#F5F6F8] flex flex-col">
      {/* Top Bar */}
      <header className="sticky top-0 z-30 h-16 border-b border-white/10 bg-[#0B0D12]/95 backdrop-blur-md px-4 sm:px-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <BrandLogo size="sm" />
          <div className="min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <p className="font-display font-bold text-sm sm:text-base text-white truncate">
                {t.staffCommandCenter}
              </p>
              <span
                className={`hidden sm:inline-block shrink-0 font-mono-num text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${
                  permissions.isSuperAdmin
                    ? 'border-amber-400/40 bg-amber-400/10 text-amber-300'
                    : 'border-cyan-400/40 bg-cyan-400/10 text-cyan-300'
                }`}
              >
                {getAdminRoleLabel(adminRole, lang)}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 truncate">
              {adminName} · <span dir="ltr">{adminEmail}</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={toggleLang}
            aria-label={t.switchLangAria}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-white/15 bg-white/[0.04] hover:bg-white/[0.1] text-xs font-semibold text-white whitespace-nowrap transition-colors"
          >
            <Globe className="w-3.5 h-3.5 text-neutral-300" />
            <span>{t.switchLangLabel}</span>
          </button>
          <button
            type="button"
            onClick={onExit}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-white/15 bg-white/[0.04] hover:bg-white/[0.08] text-xs font-semibold text-white whitespace-nowrap shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5 rtl:rotate-180" />
            {t.backToStorefront}
          </button>
        </div>
      </header>

      <div className="flex-1 flex flex-col lg:flex-row max-w-[1600px] w-full mx-auto">
        {/* Sidebar Navigation */}
        <aside className="lg:w-60 shrink-0 border-b lg:border-b-0 lg:border-e border-white/10 bg-[#0B0D12] p-3 lg:p-4">
          <nav
            aria-label={t.staffNavAria}
            className="flex lg:flex-col gap-1.5 overflow-x-auto lg:overflow-visible pb-1 lg:pb-0"
          >
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = effectiveTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`inline-flex items-center justify-between gap-2.5 px-3.5 py-2.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-white text-[#08090C]'
                      : 'text-slate-400 hover:text-white hover:bg-white/[0.05]'
                  }`}
                >
                  <span className="inline-flex items-center gap-2.5">
                    <Icon className="w-4 h-4 shrink-0" />
                    {item.label}
                  </span>
                  {item.badge !== undefined && (
                    <span
                      className={`font-mono-num text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        active ? 'bg-[#08090C]/15 text-[#08090C]' : 'bg-white/10 text-slate-200'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 space-y-6 min-w-0">
          {/* Global KPI Strip */}
          <div
            className={`grid grid-cols-2 sm:grid-cols-3 ${
              visibleKpis.length >= 5 ? 'lg:grid-cols-5' : 'lg:grid-cols-4'
            } gap-3`}
          >
            {visibleKpis.map((stat) => (
              <div
                key={stat.label}
                className="bg-[#101218] border border-white/10 rounded-xl px-4 py-3.5"
              >
                <p className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
                  {stat.label}
                </p>
                <p
                  className={`${
                    stat.isPrice
                      ? 'font-modern-price tracking-tight rtl:tracking-normal'
                      : 'font-mono-num'
                  } text-lg sm:text-xl font-bold mt-1 ${stat.tone}`}
                >
                  {stat.value}
                </p>
              </div>
            ))}
          </div>

          {/* Active Workspace Panel (strictly gated by StaffPermissions) */}
          {effectiveTab === 'dashboard' && permissions.canViewRecentApprovals && (
            <AdminDashboard
              concerts={concerts}
              bookings={bookings}
              canViewRevenueAnalytics={permissions.canViewRevenueAnalytics}
            />
          )}
          {effectiveTab === 'checkin' && permissions.canGateCheckIn && (
            <AdminCheckin
              bookings={bookings}
              adminName={adminName}
              isVerifiedStaff={isVerifiedStaff}
              canConfirmPayments={permissions.canConfirmPayments}
              canDeleteBookings={permissions.canDeleteBookings}
              onNotify={onNotify}
            />
          )}
          {effectiveTab === 'offline' && permissions.canAccessOfflineTickets && (
            <AdminOfflineTickets
              concerts={concerts}
              bookings={bookings}
              adminName={adminName}
              adminEmail={adminEmail}
              canDeleteBookings={permissions.canDeleteBookings}
              canViewRevenueAnalytics={permissions.canViewRevenueAnalytics}
              onNotify={onNotify}
            />
          )}
          {effectiveTab === 'schedule' && permissions.canManageConcerts && (
            <AdminSchedule
              onNotify={onNotify}
              onCreated={() => setActiveTab('manage')}
            />
          )}
          {effectiveTab === 'manage' && permissions.canManageConcerts && (
            <AdminManage
              concerts={concerts}
              bookings={bookings}
              waitlist={waitlist}
              onNotify={onNotify}
            />
          )}
          {effectiveTab === 'promos' && permissions.canManagePromos && (
            <AdminContentPromos
              promos={promos}
              onNotify={onNotify}
            />
          )}
          {effectiveTab === 'team' && permissions.canManageTeam && (
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
