import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Download,
  History,
  Search,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import type { AuditAction, AuditLogEntry } from '../../types';
import {
  buildAuditLogCsv,
  filterAuditLogs,
  getAuditTimestampMs,
  isSensitiveAuditAction,
  listAuditActors,
  type AuditCategory,
} from '../../utils/auditLog';
import { triggerFileDownload } from '../../utils/passExport';
import { useLanguage } from '../../i18n/LanguageContext';
import {
  formatCurrencyEgp,
  getAdminRoleLabel,
  getAuditActionLabel,
} from '../../i18n/translations';

interface AdminAuditLogProps {
  logs: AuditLogEntry[];
  loadError: boolean;
  canLoadMore: boolean;
  onLoadMore: () => void;
  onNotify: (msg: string) => void;
}

type AuditFilterTab = 'all' | 'sensitive' | AuditCategory;

function getActionBadgeStyle(action: AuditAction): string {
  switch (action) {
    case 'payment_confirmed':
    case 'payment_confirmed_checkin':
      return 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300';
    case 'payment_undone':
    case 'booking_deleted':
    case 'concert_deleted':
    case 'promo_deleted':
    case 'staff_removed':
      return 'border-rose-500/45 bg-rose-500/15 text-rose-300';
    case 'checkin':
      return 'border-cyan-500/40 bg-cyan-500/15 text-cyan-300';
    case 'checkin_undone':
      return 'border-amber-500/45 bg-amber-500/15 text-amber-300';
    case 'offline_sale_created':
    case 'offline_import':
      return 'border-violet-500/40 bg-violet-500/15 text-violet-300';
    default:
      return 'border-white/15 bg-white/[0.06] text-slate-200';
  }
}

export const AdminAuditLog: React.FC<AdminAuditLogProps> = ({
  logs,
  loadError,
  canLoadMore,
  onLoadMore,
  onNotify,
}) => {
  const { lang, isAr, t } = useLanguage();
  const [filterTab, setFilterTab] = useState<AuditFilterTab>('all');
  const [actorFilter, setActorFilter] = useState<string>('');
  const [search, setSearch] = useState('');

  const actors = useMemo(() => listAuditActors(logs), [logs]);

  const stats = useMemo(() => {
    let confirmedCount = 0;
    let confirmedEgp = 0;
    let sensitiveCount = 0;
    let checkInCount = 0;
    for (const log of logs) {
      if (log.action === 'payment_confirmed' || log.action === 'payment_confirmed_checkin') {
        confirmedCount += 1;
        confirmedEgp += log.amountEgp;
      }
      if (isSensitiveAuditAction(log.action)) {
        sensitiveCount += 1;
      }
      if (log.action === 'checkin' || log.action === 'payment_confirmed_checkin') {
        checkInCount += 1;
      }
    }
    return {
      total: logs.length,
      confirmedCount,
      confirmedEgp,
      sensitiveCount,
      checkInCount,
    };
  }, [logs]);

  const filteredLogs = useMemo(() => {
    const baseCategory: AuditCategory | 'all' =
      filterTab === 'sensitive' ? 'all' : filterTab;
    const base = filterAuditLogs(logs, {
      category: baseCategory,
      actorEmail: actorFilter,
      search,
    });
    if (filterTab === 'sensitive') {
      return base.filter((log) => isSensitiveAuditAction(log.action));
    }
    return base;
  }, [logs, filterTab, actorFilter, search]);

  const handleExportCsv = () => {
    if (filteredLogs.length === 0) return;
    const csv = buildAuditLogCsv(filteredLogs, (action) => getAuditActionLabel(action, lang));
    triggerFileDownload(
      `genz-events-audit-log-${new Date().toISOString().slice(0, 10)}.csv`,
      `\uFEFF${csv}`,
      'text/csv;charset=utf-8',
    );
    onNotify(
      isAr
        ? `تم تصدير ${filteredLogs.length} سجل نشاط إلى ملف CSV.`
        : `Exported ${filteredLogs.length} audit log entries to CSV.`,
    );
  };

  const formatLogDateTime = (ts: unknown): { date: string; time: string } => {
    const ms = getAuditTimestampMs(ts);
    if (!ms) return { date: '—', time: '' };
    const dt = new Date(ms);
    const locale = isAr ? 'ar-EG' : 'en-US';
    return {
      date: dt.toLocaleDateString(locale, { month: 'short', day: 'numeric' }),
      time: dt.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit', second: '2-digit' }),
    };
  };

  const filterChips: Array<{ id: AuditFilterTab; label: string }> = [
    { id: 'all', label: t.auditFilterAll },
    { id: 'sensitive', label: t.auditFilterSensitive },
    { id: 'payments', label: t.auditFilterPayments },
    { id: 'checkins', label: t.auditFilterCheckins },
    { id: 'offline', label: t.auditFilterOffline },
    { id: 'deletions', label: t.auditFilterDeletions },
    { id: 'settings', label: t.auditFilterSettings },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-white" />
            <h1 className="font-display font-bold text-xl sm:text-2xl text-white">
              {t.auditLogTitle}
            </h1>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-emerald-500/35 bg-emerald-500/10 text-[10px] font-semibold text-emerald-300">
              <ShieldCheck className="w-3 h-3" />
              {t.auditImmutableBadge}
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-400">{t.auditLogSubtitle}</p>
        </div>

        <button
          type="button"
          disabled={filteredLogs.length === 0}
          onClick={handleExportCsv}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-white/15 bg-white/[0.04] hover:bg-white/[0.1] disabled:opacity-40 text-xs font-semibold text-white transition-colors shrink-0"
        >
          <Download className="w-3.5 h-3.5" />
          {t.auditExportCsv} ({filteredLogs.length})
        </button>
      </div>

      {/* Firestore Rules Deploy Warning (only if /auditLogs read was denied) */}
      {loadError && (
        <div className="rounded-xl border border-amber-400/40 bg-amber-500/10 p-4 flex items-start gap-3 text-xs text-amber-100">
          <AlertTriangle className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold text-amber-200">{t.auditRulesNotDeployedTitle}</p>
            <p className="text-amber-100/90 leading-relaxed">{t.auditRulesNotDeployedBody}</p>
            <code
              dir="ltr"
              className="inline-block mt-1 px-2.5 py-1 rounded bg-[#08090C] border border-white/15 font-mono-num text-[11px] text-white"
            >
              npx firebase-tools@latest deploy --only firestore:rules --project gen-z-events
            </code>
          </div>
        </div>
      )}

      {/* Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-[#101218] border border-white/10 rounded-xl px-4 py-3.5">
          <p className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
            {t.auditKpiTotal}
          </p>
          <p className="font-mono-num text-lg font-bold text-white mt-1">
            {stats.total.toLocaleString()}
          </p>
        </div>
        <div className="bg-[#101218] border border-white/10 rounded-xl px-4 py-3.5">
          <p className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
            {t.auditKpiConfirmed}
          </p>
          <p className="font-mono-num text-lg font-bold text-emerald-400 mt-1">
            {stats.confirmedCount.toLocaleString()}
          </p>
          <p className="text-[11px] text-slate-400 font-mono-num">
            {formatCurrencyEgp(stats.confirmedEgp, lang)}
          </p>
        </div>
        <div className="bg-[#101218] border border-white/10 rounded-xl px-4 py-3.5">
          <p className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
            {t.auditKpiSensitive}
          </p>
          <p
            className={`font-mono-num text-lg font-bold mt-1 ${
              stats.sensitiveCount > 0 ? 'text-rose-400' : 'text-slate-300'
            }`}
          >
            {stats.sensitiveCount.toLocaleString()}
          </p>
        </div>
        <div className="bg-[#101218] border border-white/10 rounded-xl px-4 py-3.5">
          <p className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
            {t.auditKpiCheckins}
          </p>
          <p className="font-mono-num text-lg font-bold text-cyan-300 mt-1">
            {stats.checkInCount.toLocaleString()}
          </p>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="bg-[#101218] border border-white/10 rounded-xl p-4 space-y-3">
        <div className="flex flex-col sm:flex-row gap-2.5">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t.auditSearchPlaceholder}
              aria-label={t.auditSearchPlaceholder}
              className="w-full ps-9 pe-3 py-2 rounded-lg bg-[#08090C] border border-white/12 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-white/45"
            />
          </div>
          <select
            value={actorFilter}
            onChange={(e) => setActorFilter(e.target.value)}
            aria-label={t.auditStaffFilterAria}
            className="sm:w-56 px-3 py-2 rounded-lg bg-[#08090C] border border-white/12 text-xs text-white focus:outline-none focus:border-white/45"
          >
            <option value="">{t.auditAllStaffOpt}</option>
            {actors.map((actor) => (
              <option key={actor.email} value={actor.email}>
                {actor.name} ({actor.email})
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {filterChips.map((chip) => {
            const active = filterTab === chip.id;
            return (
              <button
                key={chip.id}
                type="button"
                onClick={() => setFilterTab(chip.id)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors ${
                  active
                    ? chip.id === 'sensitive'
                      ? 'border-rose-400/70 bg-rose-500/20 text-rose-200'
                      : 'border-white bg-white text-[#08090C]'
                    : 'border-white/12 bg-[#08090C] text-slate-300 hover:border-white/30 hover:text-white'
                }`}
              >
                {chip.id === 'sensitive' && <ShieldAlert className="w-3 h-3" />}
                {chip.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Audit Entries Table */}
      <div className="bg-[#101218] border border-white/10 rounded-xl overflow-hidden">
        {filteredLogs.length === 0 ? (
          <div className="p-10 text-center space-y-1.5">
            <p className="text-sm font-semibold text-slate-300">
              {logs.length === 0 ? t.auditEmptyTitle : t.auditNoMatchesTitle}
            </p>
            <p className="text-xs text-slate-500">
              {logs.length === 0 ? t.auditEmptyBody : t.auditNoMatchesBody}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-start text-xs">
              <thead>
                <tr className="border-b border-white/10 bg-[#0B0D12] text-[11px] uppercase tracking-wider text-slate-400">
                  <th className="py-3 px-4 font-semibold text-start">{t.auditColTime}</th>
                  <th className="py-3 px-4 font-semibold text-start">{t.auditColAction}</th>
                  <th className="py-3 px-4 font-semibold text-start">{t.auditColStaff}</th>
                  <th className="py-3 px-4 font-semibold text-start">{t.auditColTarget}</th>
                  <th className="py-3 px-4 font-semibold text-start">{t.auditColDetails}</th>
                  <th className="py-3 px-4 font-semibold text-end">{t.auditColAmount}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/8">
                {filteredLogs.map((log) => {
                  const when = formatLogDateTime(log.createdAt);
                  const sensitive = isSensitiveAuditAction(log.action);
                  return (
                    <tr
                      key={log.id}
                      className={`transition-colors ${
                        sensitive
                          ? 'bg-rose-500/[0.04] hover:bg-rose-500/[0.08]'
                          : 'hover:bg-white/[0.02]'
                      }`}
                    >
                      <td className="py-3 px-4 whitespace-nowrap align-top">
                        <p className="font-mono-num text-white font-medium">{when.date}</p>
                        <p dir="ltr" className="font-mono-num text-[11px] text-slate-400">
                          {when.time}
                        </p>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap align-top">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded border text-[11px] font-semibold ${getActionBadgeStyle(
                            log.action,
                          )}`}
                        >
                          {getAuditActionLabel(log.action, lang)}
                        </span>
                      </td>
                      <td className="py-3 px-4 align-top">
                        <p className="font-semibold text-white">{log.actorName}</p>
                        <p dir="ltr" className="text-[11px] text-slate-400 truncate max-w-[180px]">
                          {log.actorEmail}
                        </p>
                        <span
                          className={`inline-block mt-0.5 text-[10px] font-semibold px-1.5 py-0.2 rounded border ${
                            log.actorRole === 'Super Admin'
                              ? 'border-amber-400/35 bg-amber-400/10 text-amber-300'
                              : 'border-cyan-400/35 bg-cyan-400/10 text-cyan-300'
                          }`}
                        >
                          {getAdminRoleLabel(log.actorRole, lang)}
                        </span>
                      </td>
                      <td className="py-3 px-4 align-top">
                        {log.targetId && (
                          <p dir="ltr" className="font-mono-num font-bold text-white">
                            {log.targetId}
                          </p>
                        )}
                        <p className="text-[11px] text-slate-300 truncate max-w-[180px]">
                          {log.targetLabel || '—'}
                        </p>
                      </td>
                      <td className="py-3 px-4 align-top max-w-xs">
                        <p className="text-[11px] text-slate-300 leading-relaxed break-words">
                          {log.details || '—'}
                        </p>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap text-end align-top">
                        {log.amountEgp > 0 ? (
                          <span
                            className={`font-mono-num font-bold ${
                              log.action === 'payment_undone' || log.action === 'booking_deleted'
                                ? 'text-rose-300'
                                : 'text-emerald-300'
                            }`}
                          >
                            {formatCurrencyEgp(log.amountEgp, lang)}
                          </span>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {canLoadMore && (
          <div className="p-3 border-t border-white/10 text-center bg-[#0B0D12]">
            <button
              type="button"
              onClick={onLoadMore}
              className="px-4 py-1.5 rounded-lg border border-white/15 bg-white/[0.04] hover:bg-white/[0.1] text-xs font-semibold text-white transition-colors"
            >
              {t.auditLoadMoreBtn}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
