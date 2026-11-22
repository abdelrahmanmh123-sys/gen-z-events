import React, { useMemo, useState } from 'react';
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
import { Database } from 'lucide-react';
import { TICKET_TIERS } from '../../data/defaults';
import { seedInitialDatabase } from '../../services/firestoreService';
import { formatFriendlyFirebaseError } from '../../firebase';
import type { Booking, Concert } from '../../types';

interface AdminDashboardProps {
  concerts: Concert[];
  bookings: Booking[];
  adminEmail: string;
  onNotify: (msg: string) => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  concerts,
  bookings,
  adminEmail,
  onNotify,
}) => {
  const [busySeed, setBusySeed] = useState(false);

  const revenueByTier = useMemo(() => {
    const paid = bookings.filter((b) => b.paymentStatus === 'Paid');
    return TICKET_TIERS.map((tier) => ({
      name: tier.name,
      color: tier.colorHex,
      value: paid
        .filter((b) => b.tier === tier.id)
        .reduce((sum, b) => sum + b.totalEgp, 0),
    }));
  }, [bookings]);

  const ticketsByConcert = useMemo(() => {
    const paid = bookings.filter((b) => b.paymentStatus === 'Paid');
    return concerts.map((c) => ({
      name: c.title.length > 16 ? `${c.title.slice(0, 15)}…` : c.title,
      sold: paid
        .filter((b) => b.concertId === c.id)
        .reduce((sum, b) => sum + b.quantity, 0),
    }));
  }, [concerts, bookings]);

  const recentApprovals = useMemo(() => {
    return bookings
      .filter((b) => b.approvedBy || b.checkedIn)
      .slice(0, 12);
  }, [bookings]);

  const totalTierRevenue = revenueByTier.reduce((s, t) => s + t.value, 0);

  const handleSeedLineup = async () => {
    setBusySeed(true);
    try {
      await seedInitialDatabase(adminEmail);
      onNotify('Default Qena concerts and promo codes published to Firestore.');
    } catch (err) {
      onNotify(formatFriendlyFirebaseError(err));
    } finally {
      setBusySeed(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Quick Actions Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display font-bold text-xl text-white">Analytics &amp; Gate Audit</h2>
          <p className="text-xs text-slate-400">Live Firestore revenue breakdown and recent staff verification logs.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busySeed}
            onClick={() => void handleSeedLineup()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-white/12 bg-white/[0.04] hover:bg-white/[0.08] text-xs font-semibold text-white disabled:opacity-50"
          >
            <Database className="w-3.5 h-3.5 text-amber-300" />
            {busySeed ? 'Seeding...' : 'Seed Default Lineup'}
          </button>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Revenue by Tier */}
        <div className="lg:col-span-5 bg-[#101218] border border-white/10 rounded-xl p-5 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white">Paid Revenue by Pass Tier</h3>
            <span className="font-mono-num text-xs text-slate-400">
              {totalTierRevenue.toLocaleString()} EGP
            </span>
          </div>
          {totalTierRevenue === 0 ? (
            <div className="flex-1 min-h-[220px] flex items-center justify-center text-xs text-slate-500 text-center px-4">
              No confirmed paid sales yet. Confirm pending transfers in Gate QR Check-In to see revenue metrics.
            </div>
          ) : (
            <div className="h-[220px]">
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
                      border: '1px solid rgba(255,255,255,0.12)',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                    formatter={(val) => [`${Number(val).toLocaleString()} EGP`, 'Revenue']}
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
                <span className="font-mono-num text-white">{item.value.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Tickets Sold by Concert */}
        <div className="lg:col-span-7 bg-[#101218] border border-white/10 rounded-xl p-5 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white">Paid Passes Sold by Concert</h3>
            <span className="text-xs text-slate-400">{concerts.length} shows tracked</span>
          </div>
          {ticketsByConcert.length === 0 ? (
            <div className="flex-1 min-h-[250px] flex items-center justify-center text-xs text-slate-500">
              No concerts in database yet.
            </div>
          ) : (
            <div className="h-[260px]">
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
                      border: '1px solid rgba(255,255,255,0.12)',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                  />
                  <Bar dataKey="sold" name="Paid Passes" fill="#F5F6F8" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* Recent Gate Approvals & Audit Trail */}
      <div className="bg-[#101218] border border-white/10 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-white/10 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">Recent Payment &amp; Gate Approvals</h3>
          <span className="font-mono-num text-xs text-slate-400">{recentApprovals.length} records</span>
        </div>
        {recentApprovals.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            Approvals and gate check-ins will log here automatically with staff attribution.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#0B0D12] text-slate-400 uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Guest</th>
                  <th className="px-4 py-3">Concert</th>
                  <th className="px-4 py-3">Approver</th>
                  <th className="px-4 py-3">Method</th>
                  <th className="px-4 py-3 text-right">Gate Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/8">
                {recentApprovals.map((b) => (
                  <tr key={b.bookingCode} className="hover:bg-white/[0.02]">
                    <td className="px-4 py-3 font-mono-num font-bold text-white">{b.bookingCode}</td>
                    <td className="px-4 py-3 text-slate-200">
                      {b.customerName} ({b.quantity}x {b.tier})
                    </td>
                    <td className="px-4 py-3 text-slate-400">{b.concertTitle}</td>
                    <td className="px-4 py-3 text-slate-200">{b.approvedBy || '—'}</td>
                    <td className="px-4 py-3 text-emerald-400">{b.approvalMethod || 'Verified'}</td>
                    <td className="px-4 py-3 text-right font-mono-num text-slate-400">
                      {b.checkedInAt || 'Paid Only'}
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
