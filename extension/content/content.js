// Оркестратор на странице Yelp: по команде SCAN находит один непрочитанный
// диалог, спрашивает у мозга решение, по-человечески печатает и отправляет.
window.YA = window.YA || {};

let busy = false;

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.cmd === 'SCAN') {
    scanOne().finally(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg.cmd === 'PING') {
    sendResponse({ ok: true, onInbox: /\/inbox/.test(location.href) });
    return true;
  }
});

async function scanOne() {
  if (busy) return;
  busy = true;
  try {
    if (!/biz\.yelp\.com/.test(location.href)) return;

    const convos = YA.listConversations();
    if (!convos.length) return;

    // приоритет непрочитанным
    const target =
      convos.find((c) => c.unread) ?? convos[0];
    if (!target) return;

    // открыть диалог (SPA-переход по клику)
    target.el.click();
    await YA.sleep(YA.randInt(1500, 3000));

    const conv = YA.readOpenConversation();
    if (!conv) return;

    const last = conv.messages[conv.messages.length - 1];
    if (!last || last.from !== 'customer') return; // ждём слово клиента

    const decision = await chrome.runtime.sendMessage({
      cmd: 'DECIDE',
      conv: { id: target.id, customer: conv.customer, messages: conv.messages, lastKey: conv.lastKey },
    });

    if (!decision || decision.action !== 'send' || !decision.text) return;

    // человеческая пауза «прочитал → подумал → печатает»
    await YA.sleep(decision.delayMs ?? YA.randInt(45000, 120000));

    const ok = await sendReply(decision.text, decision.typingMs ?? 55);

    await chrome.runtime.sendMessage({
      cmd: 'REPORT',
      ok,
      id: target.id,
      customer: conv.customer,
      text: decision.text,
      handoff: decision.handoff,
      key: decision.key,
    });
  } catch (e) {
    console.warn('[Yelp Auto-Reply] scan error', e);
  } finally {
    busy = false;
  }
}

async function sendReply(text, typingMs) {
  const input = YA.firstEl(YA.SEL.replyInput);
  if (!input) {
    console.warn('[Yelp Auto-Reply] поле ввода не найдено');
    return false;
  }
  await YA.humanType(input, text, typingMs);
  await YA.sleep(YA.randInt(600, 1500));

  const btn = YA.findSendButton();
  if (btn && !btn.disabled) {
    btn.click();
    await YA.sleep(2000);
    return true;
  }
  // fallback: Enter (у Yelp часто отправляет)
  input.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }),
  );
  await YA.sleep(1500);
  return true;
}
