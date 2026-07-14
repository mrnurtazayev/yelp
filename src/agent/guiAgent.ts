import type { Page } from 'playwright';
import { GUIAgent, StatusEnum } from '@ui-tars/sdk';
import { PlaywrightOperator } from './playwrightOperator.js';
import { createLogger } from '../logger.js';
import type { AppConfig } from '../config.js';

const log = createLogger('gui-agent');

export function uiTarsConfigured(cfg: AppConfig): boolean {
  return Boolean(cfg.uitars.baseUrl && cfg.uitars.model);
}

/**
 * Fallback-канал: когда DOM-селекторы Yelp сломались (новая верстка,
 * капча, всплывающее окно), задачу исполняет визуальный GUI-агент UI-TARS —
 * он смотрит на скриншоты и кликает как человек.
 */
export async function runGuiTask(cfg: AppConfig, page: Page, instruction: string): Promise<boolean> {
  if (!uiTarsConfigured(cfg)) {
    log.warn('UI-TARS не сконфигурирован (UITARS_BASE_URL/UITARS_MODEL) — fallback недоступен');
    return false;
  }

  let finished = false;
  const agent = new GUIAgent({
    model: {
      baseURL: cfg.uitars.baseUrl,
      apiKey: cfg.uitars.apiKey,
      model: cfg.uitars.model,
    },
    operator: new PlaywrightOperator(page, cfg.business.behavior.typing_ms_per_char),
    maxLoopCount: 25,
    loopIntervalInMs: 800,
    logger: createLogger('ui-tars'),
    onData: ({ data }) => {
      if (data.status === StatusEnum.END) finished = true;
    },
    onError: ({ error }) => {
      log.error('GUIAgent error:', error?.message ?? String(error));
    },
  });

  try {
    await agent.run(instruction);
  } catch (e) {
    log.error('GUIAgent run failed:', (e as Error).message);
    return false;
  }
  return finished;
}

export function buildSendInstruction(replyText: string): string {
  // Инструкция для GUI-агента — на английском, так UI-TARS работает стабильнее
  return [
    'You are on a Yelp for Business inbox conversation page.',
    'Click on the message reply text box at the bottom of the conversation,',
    `type the following reply exactly as written, and then click the Send button:`,
    `"${replyText.replace(/"/g, "'")}"`,
    'After the message appears in the conversation thread, the task is finished.',
  ].join(' ');
}
