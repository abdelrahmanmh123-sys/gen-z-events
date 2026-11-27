import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const PORT = 4173;
const BASE_URL = `http://127.0.0.1:${PORT}/`;

async function waitForServer(url, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // retry until preview server is listening
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Preview server at ${url} did not respond within ${timeoutMs}ms`);
}

async function runSmoke() {
  const isWin = process.platform === 'win32';
  const viteBin = isWin ? 'node_modules\\.bin\\vite.cmd' : 'node_modules/.bin/vite';
  const server = spawn(viteBin, ['preview', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], {
    stdio: 'pipe',
    shell: isWin,
  });

  let browser;
  try {
    await waitForServer(BASE_URL);
    browser = await chromium.launch({ headless: true });

    const pageErrors = [];
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    page.on('pageerror', (err) => pageErrors.push(err.message));

    // 1. Desktop English load
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await page.waitForFunction(() => Boolean(window.__GENZ_BOOTED__), { timeout: 15000 });
    await page.waitForSelector('header', { timeout: 10000 });
    await page.waitForSelector('main#main-content', { timeout: 10000 });
    await page.waitForSelector('footer', { timeout: 10000 });

    const desktopState = await page.evaluate(() => ({
      dir: document.documentElement.dir,
      lang: document.documentElement.lang,
      overflowX: document.documentElement.scrollWidth - window.innerWidth,
    }));
    assert.equal(desktopState.dir, 'ltr', 'Default direction should be LTR');
    assert.equal(desktopState.lang, 'en', 'Default language should be EN');
    assert.ok(desktopState.overflowX <= 1, `Desktop horizontal overflow detected: ${desktopState.overflowX}px`);

    // 2. Mobile 375px English check
    await page.setViewportSize({ width: 375, height: 812 });
    const mobileEnOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    assert.ok(mobileEnOverflow <= 1, `Mobile EN horizontal overflow detected: ${mobileEnOverflow}px`);

    // 3. Switch to Arabic RTL and verify dir="rtl", lang="ar", and zero mobile overflow
    const langBtn = page.locator('header button', { hasText: 'العربية' }).first();
    await langBtn.click();
    await page.waitForFunction(() => document.documentElement.dir === 'rtl', { timeout: 5000 });

    const mobileArState = await page.evaluate(() => ({
      dir: document.documentElement.dir,
      lang: document.documentElement.lang,
      overflowX: document.documentElement.scrollWidth - window.innerWidth,
    }));
    assert.equal(mobileArState.dir, 'rtl');
    assert.equal(mobileArState.lang, 'ar');
    assert.ok(mobileArState.overflowX <= 1, `Mobile AR RTL horizontal overflow detected: ${mobileArState.overflowX}px`);

    assert.equal(pageErrors.length, 0, `Uncaught browser page errors: ${pageErrors.join(' | ')}`);
    console.log('Browser smoke check PASSED (Desktop EN, Mobile 375px EN, Mobile 375px AR RTL, 0 page errors).');
  } finally {
    if (browser) await browser.close();
    server.kill('SIGTERM');
  }
}

runSmoke().catch((err) => {
  console.error('Browser smoke check FAILED:', err);
  process.exit(1);
});
