import type { Page } from 'playwright';
import type { AppConfig } from './config.js';
import { createLogger } from './logger.js';
import { Store } from './store.js';
import { openBrowser, getPage, isLoggedIn } from './browser/session.js';
import { listConversations, readConversation } from './yelp/inbox.js';
import { sendReplyViaDom } from './yelp/composer.js';
import { runGuiTask, buildSendInstruction, uiTarsConfigured } from './agent/guiAgent.js';
import { generateReply } from './brain/responder.js';
import { sleep, randInt, replyDelayMs, withinActiveHours } from './humanize.js';
import { startDashboard } from './dashboard/server.js';

const log = createLogger('runner');

export interface RunOptions {
  dryRun: boolean;
  once: boolean;
}

export async function run(cfg: AppConfig, opts: RunOptions): Promise<void> {
  const store = new Store(cfg.dataDir);
  startDashboard(store, cfg.dashboardPort);

  const context = await openBrowser(cfg.dataDir, cfg.headless);
  const page = await getPage(context);

  if (!(await isLoggedIn(page))) {
    log.error(
      'Сессия Yelp не активна. Запустите `npm run login` и войдите в biz.yelp.com вручную (один раз).',
    );
    await context.close();
    process.exit(1);
  }
  log.info(`Залогинен в Yelp. Режим: ${opts.dryRun ? 'DRY-RUN (без отправки)' : 'боевой'}.`);
  if (!uiTarsConfigured(cfg)) {
    log.warn('UI-TARS не настроен — работаю только в DOM-режиме (это ок, но без визуального fallback).');
  }

  // основной цикл
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await tick(cfg, store, page, opts);
    } catch (e) {
      log.error('Ошибка цикла:', (e as Error).message);
      store.logActivity({ type: 'error', text: (e as Error).message });
    }
    if (opts.once) break;
    const wait = cfg.business.behavior.poll_interval_seconds * 1000;
    await sleep(wait + randInt(0, wait / 2)); // джиттер, чтобы не поллить метрономом
  }

  await context.close();
}

async function tick(cfg: AppConfig, store: Store, page: Page, opts: RunOptions): Promise<void> {
  if (store.paused) {
    log.info('Пауза (через дашборд) — пропускаю проверку');
    return;
  }
  if (!withinActiveHours(cfg.business)) {
    log.info('Вне рабочих часов автоответчика — пропускаю');
    return;
  }
  if (store.repliesToday() >= cfg.business.behavior.max_replies_per_day) {
    log.warn('Достигнут дневной лимит ответов');
    return;
  }

  store.logActivity({ type: 'poll' });
  const items = await listConversations(page);

  for (const item of items) {
    const convState = store.conversation(item.id);

    // читаем только непрочитанные ИЛИ диалоги, где мы могли что-то пропустить
    if (!item.unread && convState.lastRepliedMessageKey) continue;
    if (convState.needsHuman) continue;

    // cooldown per conversation
    if (convState.lastReplyAt) {
      const elapsed = Date.now() - Date.parse(convState.lastReplyAt);
      if (elapsed < cfg.business.behavior.per_conversation_cooldown_seconds * 1000) continue;
    }

    const conv = await readConversation(page, item.url, item.id);
    if (!conv) continue;

    const lastMsg = conv.messages[conv.messages.length - 1];
    if (!lastMsg || lastMsg.from !== 'customer') continue; // последнее слово за нами — ждём
    if (conv.lastCustomerMessageKey === convState.lastRepliedMessageKey) continue; // уже отвечали

    log.info(`Новое сообщение от "${conv.customer}": ${lastMsg.text.slice(0, 120)}`);

    const generated = await generateReply(cfg, conv.customer, conv.messages);

    if (generated.handoff) {
      log.warn(`Handoff (${generated.reason}) — диалог ${conv.id} помечен для человека`);
      store.setConversation(conv.id, {
        needsHuman: true,
        handoffReason: generated.reason,
        lastRepliedMessageKey: conv.lastCustomerMessageKey,
      });
      store.logActivity({
        type: 'handoff',
        conversationId: conv.id,
        customer: conv.customer,
        text: generated.reason,
      });
      // опциональная заглушка
      if (cfg.business.handoff_reply && !opts.dryRun) {
        await humanPause(cfg);
        await sendWithFallback(cfg, page, cfg.business.handoff_reply);
      }
      continue;
    }

    if (!generated.reply) continue;

    if (opts.dryRun) {
      log.info(`[DRY-RUN] Ответ для "${conv.customer}": ${generated.reply}`);
      store.logActivity({
        type: 'reply_generated_dry_run',
        conversationId: conv.id,
        customer: conv.customer,
        text: generated.reply,
      });
      store.setConversation(conv.id, { lastRepliedMessageKey: conv.lastCustomerMessageKey });
      continue;
    }

    // человеческая пауза: "прочитал, подумал, печатает"
    await humanPause(cfg);

    const sent = await sendWithFallback(cfg, page, generated.reply);
    if (sent) {
      store.bumpRepliesToday();
      store.setConversation(conv.id, {
        lastRepliedMessageKey: conv.lastCustomerMessageKey,
        lastReplyAt: new Date().toISOString(),
      });
      store.logActivity({
        type: 'reply_sent',
        conversationId: conv.id,
        customer: conv.customer,
        text: generated.reply,
      });
    } else {
      store.logActivity({
        type: 'error',
        conversationId: conv.id,
        customer: conv.customer,
        text: 'Не удалось отправить ответ (DOM и UI-TARS не сработали)',
      });
    }

    // пауза между обработкой разных диалогов
    await sleep(randInt(4000, 15000));
  }
}

async function humanPause(cfg: AppConfig) {
  const ms = replyDelayMs(cfg.business);
  log.info(`Человеческая пауза перед ответом: ${Math.round(ms / 1000)}с`);
  await sleep(ms);
}

/** Сначала быстрый DOM-путь, при неудаче — визуальный GUI-агент UI-TARS */
async function sendWithFallback(cfg: AppConfig, page: Page, text: string): Promise<boolean> {
  const viaDom = await sendReplyViaDom(page, text, cfg.business.behavior.typing_ms_per_char);
  if (viaDom) return true;

  log.warn('DOM-режим не сработал, переключаюсь на UI-TARS GUI-агент');
  return runGuiTask(cfg, page, buildSendInstruction(text));
}
