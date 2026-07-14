// Селекторы biz.yelp.com. Yelp меняет верстку — на каждую точку несколько
// кандидатов. Всё в одном месте, чтобы чинить было легко.
window.YA = window.YA || {};

YA.SEL = {
  conversationItems: [
    '[data-testid="conversation-list"] a[href*="/inbox/"]',
    'a[href^="/inbox/"]',
    'div[class*="conversation-list"] a[href*="/inbox/"]',
    'a[href*="/biz_inbox/"]',
  ],
  unreadMarker: [
    '[data-testid="unread-indicator"]',
    '[class*="unread"]',
    'span[aria-label*="unread" i]',
  ],
  customerName: [
    '[data-testid="conversation-header"] h2',
    '[data-testid="customer-name"]',
    'h2[class*="heading"]',
  ],
  messageBubbles: [
    '[data-testid="message-bubble"]',
    '[data-testid*="message"] p',
    'div[class*="message-bubble"]',
    'div[class*="messageBubble"]',
  ],
  replyInput: [
    'textarea[placeholder*="reply" i]',
    'textarea[placeholder*="message" i]',
    '[data-testid="reply-textarea"]',
    'div[contenteditable="true"][role="textbox"]',
    'textarea',
  ],
  sendButton: [
    'button[type="submit"]',
    '[data-testid="send-button"]',
    'button[aria-label*="send" i]',
  ],
};

YA.firstEl = (candidates, root = document) => {
  for (const sel of candidates) {
    try {
      const el = root.querySelector(sel);
      if (el) return el;
    } catch {
      /* невалидный для этой верстки — дальше */
    }
  }
  return null;
};

YA.allEls = (candidates, root = document) => {
  for (const sel of candidates) {
    try {
      const els = root.querySelectorAll(sel);
      if (els.length) return [...els];
    } catch {
      /* дальше */
    }
  }
  return [];
};

// Кнопка Send по тексту (Yelp часто без стабильных атрибутов)
YA.findSendButton = () => {
  const byText = [...document.querySelectorAll('button')].find((b) =>
    /^\s*send\s*$/i.test(b.textContent || ''),
  );
  if (byText) return byText;
  return YA.firstEl(YA.SEL.sendButton);
};
