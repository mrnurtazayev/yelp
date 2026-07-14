// Чтение входящих и переписки из живого DOM Yelp.
window.YA = window.YA || {};

YA.hash = (s) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
};

// Список диалогов на странице входящих.
YA.listConversations = () => {
  const items = YA.allEls(YA.SEL.conversationItems).slice(0, 30);
  return items.map((el) => {
    const href = el.getAttribute('href') || '';
    const id = href.replace(/[^a-zA-Z0-9_-]/g, '_') || YA.hash(el.textContent || '');
    let unread = false;
    for (const m of YA.SEL.unreadMarker) {
      try {
        if (el.querySelector(m)) { unread = true; break; }
      } catch { /* дальше */ }
    }
    if (!unread) {
      // жирный текст в элементе часто = непрочитано
      unread = Boolean(el.querySelector('b, strong, [class*="bold"]'));
    }
    return { id, el, href, unread };
  });
};

// Прочитать открытый диалог: имя клиента + сообщения.
YA.readOpenConversation = () => {
  let customer = 'Customer';
  const nameEl = YA.firstEl(YA.SEL.customerName);
  if (nameEl && nameEl.textContent.trim()) customer = nameEl.textContent.trim();

  const bubbles = YA.allEls(YA.SEL.messageBubbles);
  const messages = [];
  for (const b of bubbles) {
    const text = (b.textContent || '').trim();
    if (!text) continue;
    const cls = `${b.className} ${b.parentElement?.className || ''}`.toLowerCase();
    let ours;
    if (/outgoing|self|business|owner|sent/.test(cls)) ours = true;
    else if (/incoming|customer|received/.test(cls)) ours = false;
    else {
      const st = getComputedStyle(b.parentElement || b);
      ours = st.justifyContent === 'flex-end' || st.textAlign === 'right';
    }
    messages.push({ from: ours ? 'business' : 'customer', text });
  }
  if (!messages.length) return null;

  const lastCustomer = [...messages].reverse().find((m) => m.from === 'customer');
  const lastKey = lastCustomer ? `${messages.length}:${YA.hash(lastCustomer.text)}` : '';
  return { customer, messages, lastKey };
};
