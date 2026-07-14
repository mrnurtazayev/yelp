import path from 'node:path';
import fs from 'node:fs';
import { chromium, type BrowserContext, type Page } from 'playwright';
import { createLogger } from '../logger.js';

const log = createLogger('browser');

export const YELP_INBOX_URL = 'https://biz.yelp.com/inbox';

/**
 * Ищем бинарь Chromium: сначала тот, что скачал Playwright, затем
 * переопределение через CHROMIUM_EXECUTABLE, затем системные пути.
 */
function resolveChromium(): string | undefined {
  const candidates = [
    process.env.CHROMIUM_EXECUTABLE,
    safeExecutablePath(),
    '/opt/pw-browsers/chromium',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
  ].filter((p): p is string => Boolean(p));
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {
      /* ignore */
    }
  }
  return undefined;
}

function safeExecutablePath(): string | undefined {
  try {
    const p = chromium.executablePath();
    return fs.existsSync(p) ? p : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Постоянный профиль Chromium: логин в Yelp сохраняется между запусками.
 * Анти-детект здесь умеренный: обычный (не headless-shell) Chromium,
 * реальный user agent, отключенные автоматизационные флаги.
 */
export async function openBrowser(dataDir: string, headless: boolean): Promise<BrowserContext> {
  const profileDir = path.join(dataDir, 'browser-profile');
  const executablePath = resolveChromium();
  const context = await chromium.launchPersistentContext(profileDir, {
    headless,
    executablePath,
    viewport: { width: 1440, height: 900 },
    locale: 'en-US',
    timezoneId: Intl.DateTimeFormat().resolvedOptions().timeZone,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-default-browser-check',
      '--no-first-run',
    ],
  });
  log.info(`Browser profile: ${profileDir}, headless=${headless}`);
  return context;
}

export async function getPage(context: BrowserContext): Promise<Page> {
  return context.pages()[0] ?? (await context.newPage());
}

export async function isLoggedIn(page: Page): Promise<boolean> {
  await page.goto(YELP_INBOX_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForTimeout(2500);
  const url = page.url();
  // Незалогиненных Yelp уводит на /login
  return !/\/login|\/signup/.test(url);
}
