import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

describe('Cross-Browser Compatibility & Accessibility Guards', () => {
  it('configures Vite legacy bundles, ES2018 target, and Tailwind v4 CSS downgrade plugin', () => {
    const viteConfig = fs.readFileSync('vite.config.ts', 'utf8');
    assert.match(viteConfig, /@vitejs\/plugin-legacy/);
    assert.match(viteConfig, /@csstools\/postcss-cascade-layers/);
    assert.match(viteConfig, /lightningcss/);
    assert.match(viteConfig, /renderLegacyChunks:\s*true/);
    assert.match(viteConfig, /safari >= 12/);
    assert.match(viteConfig, /ios_saf >= 12/);
    assert.match(viteConfig, /chrome >= 64/);
    assert.match(viteConfig, /es2018/);
  });

  it('hardens index.html with non-blocking fonts, ES5 polyfills, boot shell, and noscript notice', () => {
    const html = fs.readFileSync('index.html', 'utf8');
    assert.match(html, /media="print"/);
    assert.match(html, /Object\.hasOwn/);
    assert.match(html, /Array\.prototype\.at/);
    assert.match(html, /String\.prototype\.replaceAll/);
    assert.match(html, /Promise\.allSettled/);
    assert.match(html, /globalThis/);
    assert.match(html, /<noscript>/);
    assert.match(html, /gz-boot-shell/);
    assert.doesNotMatch(html, /el\.innerHTML\s*=/, 'Boot fallback must use safe DOM textContent');
  });

  it('hardens Firebase Auth persistence fallback and Firestore transport for restricted browsers', () => {
    const fb = fs.readFileSync('src/firebase.ts', 'utf8');
    assert.match(fb, /initializeAuth/);
    assert.match(fb, /inMemoryPersistence/);
    assert.match(fb, /experimentalForceLongPolling:\s*true/);
    assert.match(fb, /useFetchStreams:\s*false/);
    assert.doesNotMatch(fb, /testConnection/, 'Dead /test/connection 403 probe must stay removed');
  });

  it('provides cross-browser CSS fallbacks, accessible focus rings, and WCAG skip link', () => {
    const css = fs.readFileSync('src/index.css', 'utf8');
    assert.match(css, /overflow-x:\s*hidden;\s*overflow-x:\s*clip;/);
    assert.match(css, /:focus-visible/);
    assert.match(css, /color-scheme:\s*dark/);

    const app = fs.readFileSync('src/App.tsx', 'utf8');
    assert.match(app, /href="#main-content"/);
    assert.match(app, /id="main-content"/);
  });

  it('sets non-stale HTML cache headers and asset CORS headers in vercel.json', () => {
    const vercel = fs.readFileSync('vercel.json', 'utf8');
    assert.match(vercel, /"source":\s*"\/index\.html"/);
    assert.match(vercel, /"key":\s*"Access-Control-Allow-Origin"/);
    assert.match(vercel, /"value":\s*"public, max-age=0, must-revalidate"/);
  });
});

describe('Project Base & Git Commit Readiness Guards', () => {
  it('pins firebase-applet-config.json strictly to base project gen-z-events and its Firestore database', () => {
    const cfg = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf8')) as Record<string, string>;
    assert.equal(cfg.projectId, 'gen-z-events');
    assert.equal(cfg.authDomain, 'gen-z-events.firebaseapp.com');
    assert.equal(cfg.firestoreDatabaseId, 'ai-studio-ebd015a5-12b5-456c-b8c3-447ca302527f');
    assert.ok(typeof cfg.apiKey === 'string' && cfg.apiKey.startsWith('AIza'), 'Valid Firebase web apiKey required');
    assert.ok(typeof cfg.appId === 'string' && cfg.appId.length > 10, 'Valid Firebase appId required');
  });

  it('keeps .gitignore clean of secrets, build outputs, and temporary verification artifacts', () => {
    const gitignore = fs.readFileSync('.gitignore', 'utf8');
    assert.match(gitignore, /^node_modules\/$/m);
    assert.match(gitignore, /^dist\/$/m);
    assert.match(gitignore, /^\.env\*$/m);
    assert.match(gitignore, /^!\.env\.example$/m);
    assert.match(gitignore, /^\.playwright-cli\/$/m);
    assert.match(gitignore, /^DRAFT_firestore\.rules$/m);
    assert.equal(fs.existsSync('DRAFT_firestore.rules'), false, 'No scratch DRAFT_firestore.rules file left in repo');
  });
});

