// Прогон UI мастера настройки и попапа со стабом chrome.* — ловим ошибки JS
// и проверяем базовую навигацию по шагам. Запуск через xvfb-run (см. ниже).
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ext = join(dirname(fileURLToPath(import.meta.url)), '..');
const exe = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const CHROME_STUB = `
  window.__store = { config: {} };
  window.chrome = {
    runtime: {
      sendMessage: async (m) => {
        if (m.cmd === 'GET_STATE') return { ok:true, setupDone:false };
        if (m.cmd === 'TEST_LLM') return { ok:true, reply:'Sure, what time works for you?' };
        return { ok:true };
      },
      openOptionsPage: () => {},
      getURL: (p) => p,
      onMessage: { addListener: () => {} },
      onInstalled: { addListener: () => {} },
      onStartup: { addListener: () => {} },
    },
    storage: {
      local: {
        get: async (k) => ({ [k]: window.__store[k] }),
        set: async (o) => Object.assign(window.__store, o),
      },
      onChanged: { addListener: () => {} },
    },
    tabs: { create: () => {}, query: async () => [] },
    alarms: { create: () => {}, clear: async () => {}, onAlarm: { addListener: () => {} } },
  };
`;

const errors = [];
const browser = await chromium.launch({ executablePath: exe });
const page = await browser.newPage();
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.addInitScript(CHROME_STUB);

// ---- options wizard ----
await page.goto('file://' + join(ext, 'options/options.html'));
await page.waitForTimeout(300);

console.log('старт: активен шаг', await page.locator('.step.active').getAttribute('data-step'));

// шаг 0 → 1 (ИИ)
await page.click('#nextBtn');
await page.waitForTimeout(120);

// провайдер → OpenAI показывает свои поля (уже на активном шаге)
await page.check('input[value="openai"]');
if (!(await page.locator('#openaiFields').isVisible())) throw new Error('OpenAI-поля не показались');
await page.check('input[value="anthropic"]');
await page.fill('#apiKey', 'sk-ant-test');

// проходим шаги 1..7
for (let i = 1; i <= 6; i++) {
  if (i === 2) await page.fill('#bizName', 'Test Biz'); // на шаге бизнеса
  if (i === 3) await page.fill('#personaName', 'Alex'); // на шаге стиля
  if (i === 3) {
    await page.click('.chip[data-tone="pro"]');
    const toneVal = await page.locator('#tone').inputValue();
    if (!/Professional/.test(toneVal)) throw new Error('Чип тона не применился');
  }
  await page.click('#nextBtn');
  await page.waitForTimeout(120);
}
const activeStep = await page.locator('.step.active').getAttribute('data-step');
console.log('дошли до шага (data-step):', activeStep);
if (activeStep !== '7') throw new Error('Мастер не дошёл до финального шага, застрял на ' + activeStep);

// ---- popup ----
await page.goto('file://' + join(ext, 'popup/popup.html'));
await page.waitForTimeout(200);
if (!(await page.locator('#setupScreen').isVisible()))
  throw new Error('Попап не показал экран настройки при setupDone=false');

await browser.close();

if (errors.length) {
  console.error('ОШИБКИ JS:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('UI SMOKE OK — ошибок нет, навигация и логика работают');
