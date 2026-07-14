// Мозг расширения: планирует проверки, принимает решения, зовёт LLM,
// хранит состояние. Общается с content-скриптом на biz.yelp.com.
import { getConfig, setConfig, getState, setState, todayKey } from './config.js';
import { generateReply } from './responder.js';

const ALARM = 'yelp-poll';

// ---- установка ----
chrome.runtime.onInstalled.addListener(async (details) => {
  await rescheduleAlarm();
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('welcome/welcome.html') });
  }
});
chrome.runtime.onStartup.addListener(rescheduleAlarm);

async function rescheduleAlarm() {
  const cfg = await getConfig();
  const minutes = Math.max(1, Number(cfg.behavior.pollMinutes) || 2);
  await chrome.alarms.clear(ALARM);
  await chrome.alarms.create(ALARM, { periodInMinutes: minutes });
}

// ---- планировщик ----
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM) return;
  try {
    await tick();
  } catch (e) {
    await logActivity('error', { text: String(e?.message ?? e) });
  }
});

async function tick() {
  const cfg = await getConfig();
  if (!cfg.setupDone || !cfg.enabled) return;
  if (!withinActiveHours(cfg)) return;
  const state = await getState();
  if ((state.repliesByDay[todayKey()] ?? 0) >= cfg.behavior.maxRepliesPerDay) return;

  const tab = await findYelpTab();
  if (!tab) {
    await logActivity('info', { text: 'Нет открытой вкладки Yelp inbox — пропускаю' });
    return;
  }
  // просим content-скрипт просканировать один диалог
  try {
    await chrome.tabs.sendMessage(tab.id, { cmd: 'SCAN' });
  } catch {
    await logActivity('info', { text: 'Вкладка Yelp есть, но скрипт ещё не загрузился' });
  }
}

async function findYelpTab() {
  const tabs = await chrome.tabs.query({ url: 'https://biz.yelp.com/*' });
  return tabs[0] ?? null;
}

// ---- обмен сообщениями ----
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handleMessage(msg, sender).then(sendResponse).catch((e) =>
    sendResponse({ ok: false, error: String(e?.message ?? e) }),
  );
  return true; // async
});

async function handleMessage(msg, sender) {
  switch (msg.cmd) {
    case 'GET_STATE':
      return getPopupState();

    case 'SET_ENABLED': {
      const cfg = await setConfig({ enabled: Boolean(msg.value) });
      await rescheduleAlarm();
      if (cfg.enabled) tick(); // сразу попробовать
      return { ok: true };
    }

    case 'OPEN_YELP':
      await chrome.tabs.create({ url: 'https://biz.yelp.com/inbox' });
      return { ok: true };

    case 'OPEN_OPTIONS':
      await chrome.runtime.openOptionsPage();
      return { ok: true };

    case 'CLEAR_HANDOFF': {
      await setState((s) => {
        if (s.conversations[msg.id]) s.conversations[msg.id].needsHuman = false;
      });
      return { ok: true };
    }

    case 'TEST_LLM': {
      const cfg = await getConfig();
      const r = await generateReply(cfg, 'Test Customer', [
        { from: 'customer', text: 'Hi, are you available this Saturday for a small job?' },
      ]);
      return { ok: true, reply: r.reply || r.reason };
    }

    case 'DECIDE':
      return decide(msg.conv);

    case 'REPORT':
      return report(msg);

    default:
      return { ok: false, error: 'unknown cmd' };
  }
}

// Принять решение по одному диалогу (вызывается из content-скрипта).
async function decide(conv) {
  const cfg = await getConfig();
  if (!cfg.enabled || !cfg.setupDone) return { action: 'skip' };
  if (!withinActiveHours(cfg)) return { action: 'skip' };

  const state = await getState();
  const cs = state.conversations[conv.id] ?? {};
  if (cs.needsHuman) return { action: 'skip' };
  if ((state.repliesByDay[todayKey()] ?? 0) >= cfg.behavior.maxRepliesPerDay)
    return { action: 'skip' };
  if (cs.lastReplyAt && Date.now() - Date.parse(cs.lastReplyAt) < cfg.behavior.cooldownSec * 1000)
    return { action: 'skip' };
  if (cs.lastRepliedKey && cs.lastRepliedKey === conv.lastKey) return { action: 'skip' };

  let gen;
  try {
    gen = await generateReply(cfg, conv.customer, conv.messages);
  } catch (e) {
    await logActivity('error', { customer: conv.customer, text: String(e?.message ?? e) });
    return { action: 'skip' };
  }

  if (gen.handoff) {
    await setState((s) => {
      s.conversations[conv.id] = {
        ...(s.conversations[conv.id] ?? {}),
        needsHuman: true,
        handoffReason: gen.reason,
        customer: conv.customer,
        lastRepliedKey: conv.lastKey,
      };
    });
    await logActivity('handoff', { conversationId: conv.id, customer: conv.customer, text: gen.reason });
    return {
      action: cfg.handoffReply ? 'send' : 'skip',
      handoff: true,
      text: cfg.handoffReply || '',
      typingMs: cfg.behavior.typingMsPerChar,
      delayMs: randDelay(cfg),
      key: conv.lastKey,
    };
  }

  if (!gen.reply) return { action: 'skip' };

  // оптимистично помечаем, чтобы параллельные проверки не дублировали ответ
  await setState((s) => {
    s.conversations[conv.id] = {
      ...(s.conversations[conv.id] ?? {}),
      lastRepliedKey: conv.lastKey,
      lastReplyAt: new Date().toISOString(),
      customer: conv.customer,
    };
    s.repliesByDay[todayKey()] = (s.repliesByDay[todayKey()] ?? 0) + 1;
  });

  return {
    action: 'send',
    text: gen.reply,
    typingMs: cfg.behavior.typingMsPerChar,
    delayMs: randDelay(cfg),
    key: conv.lastKey,
  };
}

// Content-скрипт сообщает результат отправки.
async function report(msg) {
  if (msg.ok) {
    await logActivity(msg.handoff ? 'handoff' : 'reply_sent', {
      conversationId: msg.id,
      customer: msg.customer,
      text: msg.text,
    });
  } else {
    // откат оптимистичной пометки, чтобы повторить в следующий раз
    await setState((s) => {
      const c = s.conversations[msg.id];
      if (c && c.lastRepliedKey === msg.key) {
        c.lastRepliedKey = undefined;
        c.lastReplyAt = undefined;
      }
      const d = todayKey();
      if (s.repliesByDay[d]) s.repliesByDay[d] -= 1;
    });
    await logActivity('error', {
      conversationId: msg.id,
      customer: msg.customer,
      text: 'Не удалось отправить ответ на странице',
    });
  }
  return { ok: true };
}

// ---- утилиты ----
function withinActiveHours(cfg, now = new Date()) {
  const [fh, fm] = cfg.behavior.activeFrom.split(':').map(Number);
  const [th, tm] = cfg.behavior.activeTo.split(':').map(Number);
  const cur = now.getHours() * 60 + now.getMinutes();
  return cur >= fh * 60 + fm && cur <= th * 60 + tm;
}
function randDelay(cfg) {
  const min = cfg.behavior.delayMinSec * 1000;
  const max = cfg.behavior.delayMaxSec * 1000;
  return Math.floor(min + Math.random() * (max - min));
}
async function logActivity(type, data) {
  await setState((s) => {
    s.activity.push({ ts: new Date().toISOString(), type, ...data });
    if (s.activity.length > 200) s.activity = s.activity.slice(-200);
  });
}
async function getPopupState() {
  const cfg = await getConfig();
  const state = await getState();
  const tab = await findYelpTab();
  return {
    ok: true,
    setupDone: cfg.setupDone,
    enabled: cfg.enabled,
    provider: cfg.provider,
    hasYelpTab: Boolean(tab),
    repliesToday: state.repliesByDay[todayKey()] ?? 0,
    maxPerDay: cfg.behavior.maxRepliesPerDay,
    needsHuman: Object.entries(state.conversations)
      .filter(([, c]) => c.needsHuman)
      .map(([id, c]) => ({ id, customer: c.customer, reason: c.handoffReason })),
    activity: [...state.activity].reverse().slice(0, 40),
  };
}

// изменение poll-интервала в настройках → пересобрать alarm
chrome.storage.onChanged.addListener((changes) => {
  if (changes.config) rescheduleAlarm();
});
