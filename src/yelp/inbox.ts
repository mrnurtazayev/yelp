import type { Locator, Page } from 'playwright';
import { createLogger } from '../logger.js';
import { YELP_INBOX_URL } from '../browser/session.js';
import { SEL } from './selectors.js';

const log = createLogger('inbox');

export interface ChatMessage {
  from: 'customer' | 'business';
  text: string;
}

export interface Conversation {
  id: string;
  url: string;
  customer: string;
  unread: boolean;
  messages: ChatMessage[];
  /** ключ последнего входящего сообщения (для дедупликации ответов) */
  lastCustomerMessageKey: string;
}

/** Первый сработавший локатор из списка кандидатов */
async function firstMatching(page: Page, candidates: readonly string[]): Promise<Locator | null> {
  for (const sel of candidates) {
    const loc = page.locator(sel);
    try {
      if ((await loc.count()) > 0) return loc;
    } catch {
      /* невалидный селектор для этой верстки — пробуем следующий */
    }
  }
  return null;
}

export async function listConversations(page: Page): Promise<Array<{ id: string; url: string; unread: boolean }>> {
  await page.goto(YELP_INBOX_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForTimeout(3000);

  const items = await firstMatching(page, SEL.conversationItems);
  if (!items) {
    log.warn('Не нашел список диалогов ни одним селектором');
    return [];
  }

  const result: Array<{ id: string; url: string; unread: boolean }> = [];
  const count = Math.min(await items.count(), 30);
  for (let i = 0; i < count; i++) {
    const item = items.nth(i);
    const href = await item.getAttribute('href');
    if (!href) continue;
    const url = new URL(href, 'https://biz.yelp.com').toString();
    const id = href.replace(/[^a-zA-Z0-9_-]/g, '_');

    let unread = false;
    for (const marker of SEL.unreadMarker) {
      try {
        if ((await item.locator(marker).count()) > 0) {
          unread = true;
          break;
        }
      } catch {
        /* ignore */
      }
    }
    // Fallback: жирный текст в элементе часто означает непрочитанное
    if (!unread) {
      try {
        const fw = await item.evaluate((el) => {
          const bold = el.querySelector('b, strong, [style*="font-weight"], [class*="bold"]');
          return Boolean(bold);
        });
        unread = fw;
      } catch {
        /* ignore */
      }
    }
    result.push({ id, url, unread });
  }
  log.info(`Диалогов в списке: ${result.length}, непрочитанных: ${result.filter((r) => r.unread).length}`);
  return result;
}

export async function readConversation(page: Page, url: string, id: string): Promise<Conversation | null> {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForTimeout(2500);

  let customer = 'Customer';
  const nameLoc = await firstMatching(page, SEL.customerName);
  if (nameLoc) {
    const t = (await nameLoc.first().textContent())?.trim();
    if (t) customer = t;
  }

  const bubbles = await firstMatching(page, SEL.messageBubbles);
  if (!bubbles) {
    log.warn(`Не нашел сообщения в диалоге ${id}`);
    return null;
  }

  const messages: ChatMessage[] = [];
  const count = await bubbles.count();
  for (let i = 0; i < count; i++) {
    const bubble = bubbles.nth(i);
    const text = (await bubble.textContent())?.trim();
    if (!text) continue;
    // Эвристика "своё/чужое": свои сообщения обычно выровнены вправо
    // или помечены классом outgoing/self/business.
    const isOurs = await bubble.evaluate((el) => {
      const cls = `${el.className} ${(el.parentElement?.className ?? '')}`.toLowerCase();
      if (/outgoing|self|business|owner|sent/.test(cls)) return true;
      if (/incoming|customer|received/.test(cls)) return false;
      const style = window.getComputedStyle(el.parentElement ?? el);
      return style.justifyContent === 'flex-end' || style.textAlign === 'right';
    });
    messages.push({ from: isOurs ? 'business' : 'customer', text });
  }

  if (messages.length === 0) return null;

  const lastCustomer = [...messages].reverse().find((m) => m.from === 'customer');
  const lastCustomerMessageKey = lastCustomer
    ? `${messages.length}:${hash(lastCustomer.text)}`
    : '';

  return { id, url, customer, unread: false, messages, lastCustomerMessageKey };
}

function hash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}
