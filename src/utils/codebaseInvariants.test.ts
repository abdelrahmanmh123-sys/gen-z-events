import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { localizeKnownMessage } from '../i18n/translations.ts';

const REPO_ROOT = process.cwd();
const SRC_ROOT = path.join(REPO_ROOT, 'src');

function collectSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectSourceFiles(full, out);
    } else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.test.ts')) {
      out.push(full);
    }
  }
  return out;
}

describe('Codebase Structural, RBAC, RTL, Z-Index & i18n Invariants', () => {
  const allSrcFiles = collectSourceFiles(SRC_ROOT);
  const tsxFiles = allSrcFiles.filter((f) => f.endsWith('.tsx'));

  it('forbids XSS sinks, TypeScript escape hatches, and unsafe target=_blank links', () => {
    for (const file of allSrcFiles) {
      const rel = path.relative(REPO_ROOT, file).replace(/\\/g, '/');
      const content = fs.readFileSync(file, 'utf8');

      assert.equal(
        /dangerouslySetInnerHTML|\.innerHTML\s*=/.test(content),
        false,
        `Unsafe HTML injection sink found in ${rel}`,
      );
      assert.equal(
        /\bas\s+any\b|@ts-ignore|@ts-expect-error/.test(content),
        false,
        `TypeScript safety escape hatch found in ${rel}`,
      );

      // Every target="_blank" JSX tag must carry rel="noopener noreferrer"
      const blankMatches = content.match(/<a\b[^>]*target=["']_blank["'][^>]*>/gs) || [];
      for (const tag of blankMatches) {
        assert.ok(
          /rel=["'][^"']*noopener[^"']*noreferrer[^"']*["']/.test(tag),
          `Anchor with target="_blank" is missing rel="noopener noreferrer" in ${rel}: ${tag.slice(0, 120)}`,
        );
      }
    }
  });

  it('enforces RTL-safe logical Tailwind utilities across all TSX components', () => {
    const forbiddenPhysicalClass = /\b(?:ml|mr|pl|pr)-(?:\d|px|auto|\[)|(?:^|[\s"'`])text-(?:left|right)(?:[\s"'`]|$)/;
    for (const file of tsxFiles) {
      const rel = path.relative(REPO_ROOT, file).replace(/\\/g, '/');
      const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
      for (let idx = 0; idx < lines.length; idx++) {
        const line = lines[idx];
        // Ignore pure comments
        if (/^\s*\/\//.test(line)) continue;
        assert.equal(
          forbiddenPhysicalClass.test(line),
          false,
          `Non-logical directional Tailwind class in ${rel}:${idx + 1} — use ms-/me-/ps-/pe-/text-start/text-end instead:\n  ${line.trim()}`,
        );
      }
    }
  });

  it('enforces strict z-index layering hierarchy so toasts always render above modals and Quick Search', () => {
    const appSrc = fs.readFileSync(path.join(SRC_ROOT, 'App.tsx'), 'utf8');
    const quickSearchSrc = fs.readFileSync(
      path.join(SRC_ROOT, 'components', 'admin', 'AdminQuickSearchModal.tsx'),
      'utf8',
    );
    const ticketsSrc = fs.readFileSync(path.join(SRC_ROOT, 'components', 'TicketsModal.tsx'), 'utf8');

    const extractMaxZ = (src: string, pattern: RegExp): number => {
      const nums = Array.from(src.matchAll(pattern)).map((m) => Number(m[1]));
      return nums.length > 0 ? Math.max(...nums) : 0;
    };

    const toastZMatches = Array.from(
      appSrc.matchAll(/role="status"[\s\S]{0,120}?z-\[(\d+)\]/g),
    ).map((m) => Number(m[1]));
    assert.ok(toastZMatches.length >= 2, 'Expected both Admin and Storefront toast containers in App.tsx');

    const quickSearchZ = extractMaxZ(quickSearchSrc, /z-\[(\d+)\]/g);
    const lightboxZ = extractMaxZ(ticketsSrc, /z-\[(\d+)\]/g);
    const skipLinkZ = extractMaxZ(appSrc, /focus:z-\[(\d+)\]/g);

    for (const tz of toastZMatches) {
      assert.ok(
        tz > quickSearchZ,
        `Toast z-[${tz}] must exceed AdminQuickSearchModal z-[${quickSearchZ}]`,
      );
      assert.ok(
        tz > lightboxZ,
        `Toast z-[${tz}] must exceed TicketsModal lightbox z-[${lightboxZ}]`,
      );
      assert.ok(
        skipLinkZ > tz,
        `WCAG skip-link z-[${skipLinkZ}] must remain above toast z-[${tz}]`,
      );
    }
  });

  it('enforces Gate Staff financial RBAC gating in all Gate-Staff-accessible admin components', () => {
    // Every Gate-Staff-accessible UI file that formats EGP totals must accept and check canViewRevenueAnalytics
    const gateAccessibleFiles = [
      'src/components/admin/AdminDashboard.tsx',
      'src/components/admin/AdminCheckin.tsx',
      'src/components/admin/AdminCheckinVerdictCard.tsx',
      'src/components/admin/AdminCheckinRoster.tsx',
      'src/components/admin/AdminOfflineTickets.tsx',
      'src/components/admin/OfflineExcelPreviewPanel.tsx',
      'src/components/admin/OfflineSalesLedger.tsx',
      'src/components/admin/GoogleFormSyncPanel.tsx',
      'src/components/admin/AdminQuickSearchModal.tsx',
    ];

    for (const rel of gateAccessibleFiles) {
      const full = path.join(REPO_ROOT, rel);
      const src = fs.readFileSync(full, 'utf8');
      if (src.includes('formatCurrencyEgp(')) {
        assert.ok(
          src.includes('canViewRevenueAnalytics'),
          `${rel} renders EGP currency via formatCurrencyEgp() without referencing canViewRevenueAnalytics`,
        );
      }
      // Every booking.totalEgp currency display must have canViewRevenueAnalytics nearby in the component
      if (/formatCurrencyEgp\([^)]*\.totalEgp/.test(src)) {
        const lines = src.split(/\r?\n/);
        for (let i = 0; i < lines.length; i++) {
          if (/formatCurrencyEgp\([^)]*\.totalEgp/.test(lines[i])) {
            const windowText = lines.slice(Math.max(0, i - 6), i + 2).join('\n');
            assert.ok(
              /canViewRevenueAnalytics/.test(windowText),
              `Un-gated totalEgp currency display in ${rel}:${i + 1} — wrap with canViewRevenueAnalytics`,
            );
          }
        }
      }
    }

    // Gate Staff offline Excel export must pass includeFinancials: canViewRevenueAnalytics
    const offlineSrc = fs.readFileSync(
      path.join(SRC_ROOT, 'components', 'admin', 'AdminOfflineTickets.tsx'),
      'utf8',
    );
    assert.ok(
      offlineSrc.includes('includeFinancials: canViewRevenueAnalytics'),
      'AdminOfflineTickets must pass { includeFinancials: canViewRevenueAnalytics } to exportOfflineBookingsXlsx',
    );

    // Quick Search pending WhatsApp link (containing totalEgp) must be gated by permissions.canConfirmPayments
    const quickSrc = fs.readFileSync(
      path.join(SRC_ROOT, 'components', 'admin', 'AdminQuickSearchModal.tsx'),
      'utf8',
    );
    assert.ok(
      /isPaid\s*\|\|\s*permissions\.canConfirmPayments/.test(quickSrc),
      'AdminQuickSearchModal must gate pending WhatsApp links with permissions.canConfirmPayments',
    );
  });

  it('guarantees every error returned by formatFriendlyFirebaseError and excelOffline has an Arabic translation', () => {
    const firebaseErrPath = fs.existsSync(path.join(SRC_ROOT, 'utils', 'booking', 'firebaseErrors.ts'))
      ? path.join(SRC_ROOT, 'utils', 'booking', 'firebaseErrors.ts')
      : path.join(SRC_ROOT, 'utils', 'bookingLogic.ts');
    const fbSrc = fs.readFileSync(firebaseErrPath, 'utf8');
    const fnMatch = fbSrc.match(/export function formatFriendlyFirebaseError[\s\S]*?\n\}/);
    assert.ok(fnMatch, 'Could not locate formatFriendlyFirebaseError definition');

    const returnedStrings = Array.from(fnMatch[0].matchAll(/return\s+'([^']+)';/g)).map((m) => m[1]);
    assert.ok(returnedStrings.length >= 15, 'Expected mapped friendly Firebase error messages');

    const excelSrc = fs.readFileSync(path.join(SRC_ROOT, 'utils', 'excelOffline.ts'), 'utf8');
    const thrownStrings = Array.from(excelSrc.matchAll(/throw new Error\('([^']+)'\);/g)).map(
      (m) => m[1],
    );
    assert.ok(thrownStrings.length >= 5, 'Expected spreadsheet validation error messages');

    for (const enMsg of [...returnedStrings, ...thrownStrings]) {
      const arMsg = localizeKnownMessage(enMsg, 'ar');
      assert.notEqual(
        arMsg,
        enMsg,
        `Missing Arabic entry in EN_TO_AR_MESSAGES for error string: "${enMsg}"`,
      );
      assert.ok(/[\u0600-\u06FF]/.test(arMsg), `Expected Arabic script for: "${enMsg}"`);
    }
  });

  it('keeps Firebase named database pinning aligned across firebase.json, firebase-applet-config.json, and src/firebase.ts', () => {
    const expectedDb = 'ai-studio-ebd015a5-12b5-456c-b8c3-447ca302527f';
    const fbJson = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'firebase.json'), 'utf8')) as {
      firestore?: { database?: string; rules?: string };
    };
    const appletCfg = JSON.parse(
      fs.readFileSync(path.join(REPO_ROOT, 'firebase-applet-config.json'), 'utf8'),
    ) as { projectId?: string; firestoreDatabaseId?: string };
    const firebaseTs = fs.readFileSync(path.join(SRC_ROOT, 'firebase.ts'), 'utf8');

    assert.equal(fbJson.firestore?.database, expectedDb);
    assert.equal(fbJson.firestore?.rules, 'firestore.rules');
    assert.equal(appletCfg.projectId, 'gen-z-events');
    assert.equal(appletCfg.firestoreDatabaseId, expectedDb);
    assert.ok(firebaseTs.includes(expectedDb));
  });

  it('keeps all 9 Firestore collections referenced in firestoreService matched in firestore.rules', () => {
    const rulesSrc = fs.readFileSync(path.join(REPO_ROOT, 'firestore.rules'), 'utf8');
    const expectedCollections = [
      'concerts',
      'promos',
      'bookings',
      'users',
      'waitlist',
      'admins',
      'adminSessions',
      'paymentConfig',
      'auditLogs',
    ];
    for (const col of expectedCollections) {
      assert.ok(
        new RegExp(`match\\s+/${col}/\\{[a-zA-Z0-9_]+\\}`).test(rulesSrc),
        `Missing collection rule block in firestore.rules for /${col}`,
      );
    }
  });
});
