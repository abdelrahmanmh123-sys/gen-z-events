import React, { useMemo } from 'react';
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { TICKET_TIERS } from '../../data/defaults';
import type { Booking, Concert } from '../../types';
import {
  formatCheckInProgress,
  getBookingCheckedInCount,
  getTierColorHex,
} from '../../utils/bookingLogic';
import { useLanguage } from '../../i18n/LanguageContext';
import { formatCurrencyEgp, getTierCopy } from '../../i18n/translations';

interface AdminDashboardProps {
  concerts: Concert[];
  bookings: Booking[];
  canViewRevenueAnalytics: boolean;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  concerts,
  bookings,
  canViewRevenueAnalytics,
}) => {
  const { lang, t } = useLanguage();

  const revenueByTier = useMemo(() => {
    if (!canViewRevenueAnalytics) return [];
    const paid = bookings.filter((b) => b.paymentStatus === 'Paid');
    const singleConcert = concerts.length === 1 ? concerts[0] : null;
    return TICKET_TIERS.map((tier) => ({
      name: getTierCopy(tier.id, lang).name,
      color: singleConcert?.tierColors
        ? getTierColorHex(singleConcert, tier.id)
        : tier.colorHex,
      value: paid
        .filter((b) => b.tier === tier.id)
        .reduce((sum, b) => sum + b.totalEgp, 0),
    }));
  }, [bookings, concerts, lang, canViewRevenueAnalytics]);

  const channelBreakdown = useMemo(() => {
    if (!canViewRevenueAnalytics) {
      return { onlineTickets: 0, onlineRevenue: 0, offlineTickets: 0, offlineRevenue: 0 };
    }
    const paid = bookings.filter((b) => b.paymentStatus === 'Paid');
    const online = paid.filter((b) => b.paymentMethod !== 'Offline');
    const offline = paid.filter((b) => b.paymentMethod === 'Offline');
    return {
      onlineTickets: online.reduce((s, b) => s + b.quantity, 0),
      onlineRevenue: online.reduce((s, b) => s + b.totalEgp, 0),
      offlineTickets: offline.reduce((s, b) => s + b.quantity, 0),
      offlineRevenue: offline.reduce((s, b) => s + b.totalEgp, 0),
    };
  }, [bookings, canViewRevenueAnalytics]);

  const ticketsByConcert = useMemo(() => {
    if (!canViewRevenueAnalytics) return [];
    const paid = bookings.filter((b) => b.paymentStatus === 'Paid');
    return concerts.map((c) => ({
      name: c.title.length > 16 ? `${c.title.slice(0, 15)}…` : c.title,
      sold: paid
        .filter((b) => b.concertId === c.id)
        .reduce((sum, b) => sum + b.quantity, 0),
    }));
  }, [concerts, bookings, canViewRevenueAnalytics]);

  const recentApprovals = useMemo(() => {
    return bookings
      .filter((b) => b.approvedBy || getBookingCheckedInCount(b) > 0)
      .slice(0, 12);
  }, [bookings]);

  const totalTierRevenue = revenueByTier.reduce((s, item) => s + item.value, 0);

  return (
    <div className="space-y-6">
      {/* Section Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display font-bold text-xl text-white">
            {canViewRevenueAnalytics ? t.analyticsTitle : t.recentApprovalsTitle}
          </h2>
          <p className="text-xs text-slate-400">
            {canViewRevenueAnalytics ? t.analyticsSubtitle : t.recentApprovalsGateSubtitle}
          </p>
        </div>
      </div>

      {canViewRevenueAnalytics && (
        <>
          {/* Sales Channel Breakdown (Online vs. Offline) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-[#101218] border border-white/10 rounded-xl p-4 flex items-center justify-between gap-4">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
                  {t.onlineSalesLabel}
                </p>
                <p className="font-modern-price text-lg font-bold tracking-tight rtl:tracking-normal text-white mt-1">
                  {formatCurrencyEgp(channelBreakdown.onlineRevenue, lang)}
                </p>
              </div>
              <div className="text-end">
                <p className="text-[11px] text-slate-500">{t.paidTickets}</p>
                <p className="font-mono-num text-base font-bold text-emerald-400">
                  {channelBreakdown.onlineTickets.toLocaleString()}
                </p>
              </div>
            </div>
            <div className="bg-[#101218] border border-white/10 rounded-xl p-4 flex items-center justify-between gap-4">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
                  {t.offlineSalesLabel}
                </p>
                <p className="font-modern-price text-lg font-bold tracking-tight rtl:tracking-normal text-white mt-1">
                  {formatCurrencyEgp(channelBreakdown.offlineRevenue, lang)}
                </p>
              </div>
              <div className="text-end">
                <p className="text-[11px] text-slate-500">{t.paidTickets}</p>
                <p className="font-mono-num text-base font-bold text-amber-300">
                  {channelBreakdown.offlineTickets.toLocaleString()}
                </p>
              </div>
            </div>
          </div>

          {/* Charts Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Revenue by Tier */}
            <div className="lg:col-span-5 bg-[#101218] border border-white/10 rounded-xl p-5 flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-white">{t.paidRevenueByTier}</h3>
                <span className="font-modern-price text-xs font-semibold text-slate-400">
                  {formatCurrencyEgp(totalTierRevenue, lang)}
                </span>
              </div>
          {totalTierRevenue === 0 ? (
            <div className="flex-1 min-h-[220px] flex items-center justify-center text-xs text-slate-500 text-center px-4">
              {t.noConfirmedSalesYet}
            </div>
          ) : (
            <div dir="ltr" className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={revenueByTier.filter((d) => d.value > 0)}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={56}
                    outerRadius={86}
                    paddingAngle={3}
                  >
                    {revenueByTier
                      .filter((d) => d.value > 0)
                      .map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#08090C',
                      border: '1px solid rgba(255,255,255,0.16)',
                      borderRadius: '8px',
                      fontSize: '12px',
                      color: '#F5F6F8',
                    }}
                    itemStyle={{ color: '#F5F6F8' }}
                    labelStyle={{ color: '#94A3B8' }}
                    formatter={(val) => [formatCurrencyEgp(Number(val), lang), t.revenueWord]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2 pt-3 border-t border-white/8 text-xs">
            {revenueByTier.map((item) => (
              <div key={item.name} className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-slate-300">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                  {item.name}
                </span>
                <span className="font-modern-price font-semibold text-white">{item.value.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Tickets Sold by Concert */}
        <div className="lg:col-span-7 bg-[#101218] border border-white/10 rounded-xl p-5 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white">{t.paidPassesByConcert}</h3>
            <span className="text-xs text-slate-400">
              {concerts.length} {t.showsTracked}
            </span>
          </div>
          {ticketsByConcert.length === 0 ? (
            <div className="flex-1 min-h-[250px] flex items-center justify-center text-xs text-slate-500">
              {t.noConcertsInDb}
            </div>
          ) : (
            <div dir="ltr" className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={ticketsByConcert} margin={{ top: 8, right: 8, left: -16, bottom: 20 }}>
                  <XAxis
                    dataKey="name"
                    tick={{ fill: '#9CA3AF', fontSize: 11 }}
                    axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                    tickLine={false}
                    interval={0}
                    angle={-18}
                    textAnchor="end"
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fill: '#9CA3AF', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#08090C',
                      border: '1px solid rgba(255,255,255,0.16)',
                      borderRadius: '8px',
                      fontSize: '12px',
                      color: '#F5F6F8',
                    }}
                    itemStyle={{ color: '#F5F6F8' }}
                    labelStyle={{ color: '#94A3B8' }}
                  />
                  <Bar dataKey="sold" name={t.paidPassesWord} fill="#F5F6F8" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
            </div>
          </div>
        </>
      )}

      {/* Recent Gate Approvals & Audit Trail */}
      <div className="bg-[#101218] border border-white/10 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-white/10 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">{t.recentApprovalsTitle}</h3>
          <span className="font-mono-num text-xs text-slate-400">
            {recentApprovals.length} {t.recordsWord}
          </span>
        </div>
        {recentApprovals.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">{t.noApprovalsYet}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-start text-xs">
              <thead className="bg-[#0B0D12] text-slate-400 uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="px-4 py-3 text-start">{t.colCode}</th>
                  <th className="px-4 py-3 text-start">{t.colGuest}</th>
                  <th className="px-4 py-3 text-start">{t.colConcert}</th>
                  <th className="px-4 py-3 text-start">{t.colApprover}</th>
                  <th className="px-4 py-3 text-start">{t.colMethod}</th>
                  <th className="px-4 py-3 text-end">{t.colGateTime}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/8">
                {recentApprovals.map((b) => (
                  <tr key={b.bookingCode} className="hover:bg-white/[0.02]">
                    <td className="px-4 py-3 font-mono-num font-bold text-white" dir="ltr">
                      {b.bookingCode}
                    </td>
                    <td className="px-4 py-3 text-slate-200">
                      {b.customerName} ({b.quantity}x {getTierCopy(b.tier, lang).name})
                    </td>
                    <td className="px-4 py-3 text-slate-400">{b.concertTitle}</td>
                    <td className="px-4 py-3 text-slate-200">{b.approvedBy || '—'}</td>
                    <td className="px-4 py-3 text-emerald-400">{b.approvalMethod || t.verifiedWord}</td>
                    <td className="px-4 py-3 text-end font-mono-num text-slate-400">
                      {(() => {
                        const total = Math.max(1, Math.floor(b.quantity || 1));
                        const count = getBookingCheckedInCount(b);
                        const progress = total > 1 && count > 0 ? ` ${formatCheckInProgress(count, total)}` : '';
                        return (
                          <>
                            {b.checkedInAt || t.paidOnly}
                            {progress && (
                              <span className="text-emerald-300 font-semibold" dir="ltr">
                                {progress}
                              </span>
                            )}
                          </>
                        );
                      })()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
