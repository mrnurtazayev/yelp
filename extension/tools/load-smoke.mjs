// Реальная загрузка распакованного расширения в Chromium: проверяем, что
// манифест валиден и service worker поднимается без ошибок.
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

const ext = join(dirname(fileURLToPath(import.meta.url)), '..');
const exe = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const userDataDir = mkdtempSync(join(tmpdir(), 'ya-ext-'));

const context = await chromium.launchPersistentContext(userDataDir, {
  headless: false,
  executablePath: exe,
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
});

// дождаться регистрации service worker
let sw = context.serviceWorkers()[0];
if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 10000 }).catch(() => null);

if (!sw) {
  console.error('❌ Service worker не зарегистрировался — вероятно, ошибка в манифесте/фоне');
  await context.close();
  process.exit(1);
}

const swUrl = sw.url();
const extId = swUrl.split('/')[2];
console.log('✅ Extension ID:', extId);
console.log('✅ Service worker:', swUrl.split('/').slice(3).join('/'));

// открыть options-страницу расширения (chrome-extension://ID/...) и словить ошибки
const page = await context.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
await page.goto(`chrome-extension://${extId}/options/options.html`);
await page.waitForTimeout(800);
const h1 = await page.locator('.step.active h1').textContent().catch(() => null);
console.log('✅ Options открылась, заголовок шага:', h1?.trim());

await context.close();
if (errs.length) {
  console.error('❌ Ошибки на странице:\n' + errs.join('\n'));
  process.exit(1);
}
console.log('LOAD SMOKE OK — расширение загружается, SW работает, options рендерится');
