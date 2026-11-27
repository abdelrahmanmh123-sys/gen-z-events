import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  AUDIT_ACTIONS,
  AUDIT_TARGET_TYPES,
  buildAuditLogCsv,
  buildAuditLogRecord,
  canRoleRecordAuditAction,
  describeBookingForAudit,
  describeEntryProgress,
  filterAuditLogs,
  GATE_STAFF_AUDIT_ACTIONS,
  generateAuditLogId,
  isSensitiveAuditAction,
  listAuditActors,
  sortAuditLogsNewestFirst,
} from './auditLog';
import type { AuditLogEntry } from '../types';

const rulesText = fs.readFileSync('firestore.rules', 'utf8');

describe('Staff Action Audit Log — Pure Logic & Rules Parity Suite', () => {
  it('stays 1:1 aligned with firestore.rules action, Gate Staff, and targetType allowlists', () => {
    for (const action of AUDIT_ACTIONS) {
      assert.ok(
        rulesText.includes(`'${action}'`),
        `firestore.rules isValidAuditLog is missing action '${action}'`,
      );
    }
    for (const targetType of AUDIT_TARGET_TYPES) {
      assert.ok(
        rulesText.includes(`'${targetType}'`),
        `firestore.rules isValidAuditLog is missing targetType '${targetType}'`,
      );
    }
    const gateMatch = rulesText.match(
      /isGateStaff\(\)\s*&&\s*incoming\(\)\.actorRole\s*==\s*'Gate Staff'\s*&&\s*incoming\(\)\.action\s+in\s+\[([^\]]+)\]/,
    );
    assert.ok(gateMatch, 'Missing Gate Staff audit action allowlist in firestore.rules');
    const ruleGateActions = Array.from(gateMatch[1].matchAll(/'([^']+)'/g)).map((m) => m[1]);
    assert.deepEqual([...ruleGateActions].sort(), [...GATE_STAFF_AUDIT_ACTIONS].sort());
  });

  it('enforces role-scoped audit recording permissions for Super Admin vs Gate Staff', () => {
    for (const action of AUDIT_ACTIONS) {
      assert.equal(canRoleRecordAuditAction('Super Admin', action), true);
      assert.equal(canRoleRecordAuditAction(null, action), false);
    }
    assert.equal(canRoleRecordAuditAction('Gate Staff', 'checkin'), true);
    assert.equal(canRoleRecordAuditAction('Gate Staff', 'checkin_undone'), true);
    assert.equal(canRoleRecordAuditAction('Gate Staff', 'offline_sale_created'), true);
    assert.equal(canRoleRecordAuditAction('Gate Staff', 'offline_import'), true);
    assert.equal(canRoleRecordAuditAction('Gate Staff', 'payment_confirmed'), false);
    assert.equal(canRoleRecordAuditAction('Gate Staff', 'payment_undone'), false);
    assert.equal(canRoleRecordAuditAction('Gate Staff', 'booking_deleted'), false);
    assert.equal(canRoleRecordAuditAction('Gate Staff', 'staff_removed'), false);
  });

  it('generates unique Firestore-safe audit IDs and builds sanitized rule-compliant records', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const id = generateAuditLogId(1764100000000 + i);
      assert.match(id, /^[a-zA-Z0-9_-]+$/);
      assert.ok(id.length >= 8 && id.length <= 64, `Invalid audit ID length: ${id}`);
      ids.add(id);
    }
    assert.equal(ids.size, 100);

    const record = buildAuditLogRecord({
      action: 'payment_undone',
      actor: { name: '  Lead\nOrganizer  ', role: 'Super Admin' },
      actorUid: 'uid-admin-1',
      actorEmail: '  WeenTamalak@Gmail.com ',
      targetType: 'booking',
      targetId: 'GZ-ABC123',
      targetLabel: '  Ahmed\tHassan  ',
      details: 'Qena Live · 2× VIP · Prev approver: Sara',
      amountEgp: 900.4,
    });

    assert.equal(record.actorName, 'Lead Organizer');
    assert.equal(record.actorEmail, 'weentamalak@gmail.com');
    assert.equal(record.targetLabel, 'Ahmed Hassan');
    assert.equal(record.amountEgp, 900);
    assert.equal(Object.keys(record).length, 11);

    const clamped = buildAuditLogRecord({
      action: 'booking_deleted',
      actor: { name: '', role: 'Super Admin' },
      actorUid: 'uid-1',
      actorEmail: 'admin@test.com',
      targetType: 'booking',
      targetId: 'GZ-NEG',
      targetLabel: 'Guest',
      details: 'x'.repeat(500),
      amountEgp: -250,
    });
    assert.equal(clamped.actorName, 'Staff');
    assert.equal(clamped.amountEgp, 0);
    assert.equal(clamped.details.length, 300);
  });

  it('formats booking summaries, sorts newest-first, filters by category/actor/Arabic digits, and neutralizes CSV formulas', () => {
    const summary = describeBookingForAudit(
      {
        concertTitle: 'Houda x Qena',
        quantity: 3,
        tier: 'VIP',
        paymentMethod: 'InstaPay',
        transferRef: '01099887766',
        paymentStatus: 'Paid',
      },
      ['Prev approver: Mona', false, null],
    );
    assert.equal(summary, 'Houda x Qena · 3× VIP · InstaPay · Ref 01099887766 · Prev approver: Mona');
    assert.equal(describeEntryProgress({ quantity: 4, checkedIn: false, checkedInCount: 2 }), 'Entries 2/4');

    const logs: AuditLogEntry[] = [
      {
        id: 'log-1',
        action: 'payment_confirmed',
        actorUid: 'u1',
        actorName: 'Mona',
        actorEmail: 'mona@genz.eg',
        actorRole: 'Super Admin',
        targetType: 'booking',
        targetId: 'GZ-111111',
        targetLabel: 'Omar Ali',
        details: 'Houda x Qena · 2× Gold · Ref 01055512345',
        amountEgp: 640,
        createdAt: { seconds: 1000 },
      },
      {
        id: 'log-2',
        action: 'payment_undone',
        actorUid: 'u2',
        actorName: 'Abdelrahman',
        actorEmail: 'weentamalak@gmail.com',
        actorRole: 'Super Admin',
        targetType: 'booking',
        targetId: 'GZ-111111',
        targetLabel: '=CMD|calc',
        details: 'Prev approver: Mona',
        amountEgp: 640,
        createdAt: { seconds: 2000 },
      },
      {
        id: 'log-3',
        action: 'checkin',
        actorUid: 'u3',
        actorName: 'Youssef Gate',
        actorEmail: 'gate@genz.eg',
        actorRole: 'Gate Staff',
        targetType: 'booking',
        targetId: 'GZ-222222',
        targetLabel: 'Salma',
        details: 'Entries 1/1',
        amountEgp: 0,
        createdAt: null,
      },
    ];

    const sorted = sortAuditLogsNewestFirst(logs);
    assert.deepEqual(
      sorted.map((l) => l.id),
      ['log-3', 'log-2', 'log-1'],
    );
    assert.equal(isSensitiveAuditAction('payment_undone'), true);
    assert.equal(isSensitiveAuditAction('booking_deleted'), true);
    assert.equal(isSensitiveAuditAction('payment_confirmed'), false);

    assert.equal(
      filterAuditLogs(sorted, { category: 'payments', actorEmail: '', search: '' }).length,
      2,
    );
    assert.equal(
      filterAuditLogs(sorted, { category: 'all', actorEmail: 'gate@genz.eg', search: '' }).length,
      1,
    );
    // Arabic-Indic digit search matches ASCII booking codes and transfer refs
    const arabicSearch = filterAuditLogs(sorted, {
      category: 'all',
      actorEmail: '',
      search: '٠١٠٥٥٥١٢٣٤٥',
    });
    assert.deepEqual(
      arabicSearch.map((l) => l.id),
      ['log-1'],
    );

    assert.deepEqual(
      listAuditActors(sorted).map((a) => a.name),
      ['Abdelrahman', 'Mona', 'Youssef Gate'],
    );

    const csv = buildAuditLogCsv([logs[1]], (a) => (a === 'payment_undone' ? 'Payment Undone' : a));
    assert.ok(csv.includes('Payment Undone'));
    assert.ok(csv.includes("'=CMD|calc"), 'CSV export must neutralize formula injection');
  });
});
