import type { Page } from 'playwright';
import { createLogger } from '../logger.js';
import { typingDelays, sleep, randInt } from '../humanize.js';
import { SEL } from './selectors.js';

const log = createLogger('composer');

/**
 * Быстрый путь отправки: находим поле ввода по селекторам, "печатаем"
 * по-человечески и жмем Send. Возвращает false, если верстка не распознана —
 * тогда runner отдаст задачу UI-TARS GUI-агенту.
 */
export async function sendReplyViaDom(
  page: Page,
  text: string,
  msPerChar: number,
): Promise<boolean> {
  let input = null;
  for (const sel of SEL.replyInput) {
    const loc = page.locator(sel).first();
    try {
      if ((await loc.count()) > 0 && (await loc.isVisible())) {
        input = loc;
        break;
      }
    } catch {
      /* пробуем следующий селектор */
    }
  }
  if (!input) {
    log.warn('Поле ввода не найдено ни одним селектором');
    return false;
  }

  await input.click();
  await sleep(randInt(400, 1200));

  // Человеческий набор: посимвольно с переменными задержками
  for (const [i, ch] of [...text].entries()) {
    await page.keyboard.type(ch);
    const delay = [...typingDelays(ch, msPerChar)][0] ?? msPerChar;
    await sleep(delay);
    // изредка пауза "на подумать"
    if (i > 0 && i % randInt(35, 60) === 0) await sleep(randInt(500, 1800));
  }

  await sleep(randInt(600, 1500));

  for (const sel of SEL.sendButton) {
    const btn = page.locator(sel).first();
    try {
      if ((await btn.count()) > 0 && (await btn.isVisible()) && (await btn.isEnabled())) {
        await btn.click();
        await sleep(2000);
        log.info('Ответ отправлен (DOM-режим)');
        return true;
      }
    } catch {
      /* пробуем следующий */
    }
  }

  log.warn('Кнопка Send не найдена');
  return false;
}
