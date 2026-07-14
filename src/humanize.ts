import type { BusinessConfig } from './config.js';

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function randInt(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min + 1));
}

/** Случайная человеческая задержка перед ответом */
export function replyDelayMs(cfg: BusinessConfig): number {
  const { min, max } = cfg.behavior.reply_delay_seconds;
  return randInt(min * 1000, max * 1000);
}

/** Проверка рабочего окна автоответчика (локальное время) */
export function withinActiveHours(cfg: BusinessConfig, now = new Date()): boolean {
  const [fromH, fromM] = cfg.behavior.active_hours.from.split(':').map(Number);
  const [toH, toM] = cfg.behavior.active_hours.to.split(':').map(Number);
  const minutes = now.getHours() * 60 + now.getMinutes();
  return minutes >= fromH * 60 + fromM && minutes <= toH * 60 + toM;
}

/** Задержки между нажатиями клавиш при "печати" */
export function* typingDelays(text: string, msPerChar: number): Generator<number> {
  for (const ch of text) {
    // пунктуация и пробелы — небольшие паузы, как у человека
    let base = msPerChar;
    if (ch === ' ') base *= 1.3;
    if ('.!?,'.includes(ch)) base *= 2.2;
    yield Math.max(15, base * (0.6 + Math.random() * 0.9));
  }
}
