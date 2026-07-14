#!/usr/bin/env node
import { loadConfig } from './config.js';
import { createLogger } from './logger.js';
import { Store } from './store.js';
import { openBrowser, getPage, isLoggedIn, YELP_INBOX_URL } from './browser/session.js';
import { run } from './runner.js';

const log = createLogger('cli');

const HELP = `yelp-autoresponder

Команды:
  login            Открыть браузер для ручного входа в biz.yelp.com (один раз)
  run              Запустить автоответчик (цикл)
    --dry-run      Генерировать ответы, но НЕ отправлять
    --once         Один проход по входящим и выход
  status           Показать состояние (ответы за сегодня, handoff-диалоги)

Перед запуском: cp .env.example .env && cp config/business.example.yaml config/business.yaml
`;

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);

  switch (cmd) {
    case 'login': {
      const cfg = loadConfig();
      const context = await openBrowser(cfg.dataDir, false); // логин всегда с окном
      const page = await getPage(context);
      await page.goto(YELP_INBOX_URL, { waitUntil: 'domcontentloaded' });
      log.info('Войдите в Yelp в открывшемся окне. Когда увидите входящие — закройте окно или нажмите Ctrl+C.');
      // ждем, пока пользователь залогинится, и подтверждаем
      // (окно закроют — context закроется сам)
      await new Promise<void>((resolve) => {
        context.on('close', () => resolve());
        const timer = setInterval(async () => {
          try {
            if (!/\/login|\/signup/.test(page.url()) && page.url().includes('biz.yelp.com')) {
              log.info('Похоже, вы вошли. Сессия сохранена в data/browser-profile. Можно закрывать окно.');
              clearInterval(timer);
            }
          } catch {
            clearInterval(timer);
            resolve();
          }
        }, 3000);
      });
      break;
    }

    case 'run': {
      const cfg = loadConfig();
      await run(cfg, {
        dryRun: rest.includes('--dry-run'),
        once: rest.includes('--once'),
      });
      break;
    }

    case 'status': {
      const cfg = loadConfig();
      const store = new Store(cfg.dataDir);
      log.info(`Ответов сегодня: ${store.repliesToday()}`);
      log.info(`Пауза: ${store.paused}`);
      const nh = store.needsHumanConversations;
      if (nh.length) {
        log.warn(`Диалоги, требующие человека (${nh.length}):`);
        for (const c of nh) log.warn(`  ${c.id}: ${c.state.handoffReason ?? ''}`);
      } else {
        log.info('Диалогов, требующих человека, нет');
      }
      log.info('Последние события:');
      for (const ev of store.activity.slice(-10)) {
        log.info(`  ${ev.ts} ${ev.type} ${ev.customer ?? ''} ${ev.text ?? ''}`);
      }
      break;
    }

    default:
      console.log(HELP);
      process.exit(cmd ? 1 : 0);
  }
}

main().catch((e) => {
  log.error(e instanceof Error ? e.stack ?? e.message : String(e));
  process.exit(1);
});
