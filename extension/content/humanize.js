// Человекоподобные задержки и набор текста. Плоский скрипт, кладёт всё в
// глобальный namespace window.YA (content-скрипты делят один scope).
window.YA = window.YA || {};

YA.sleep = (ms) => new Promise((r) => setTimeout(r, ms));
YA.randInt = (min, max) => Math.floor(min + Math.random() * (max - min + 1));

YA.typingDelay = (ch, msPerChar) => {
  let base = msPerChar;
  if (ch === ' ') base *= 1.3;
  if ('.!?,'.includes(ch)) base *= 2.2;
  return Math.max(15, base * (0.6 + Math.random() * 0.9));
};

// Печать по-человечески в поле ввода (textarea или contenteditable),
// с корректными input-событиями, чтобы React/Yelp «увидел» текст.
YA.humanType = async (el, text, msPerChar) => {
  el.focus();
  await YA.sleep(YA.randInt(300, 900));
  const isEditable = el.getAttribute('contenteditable') === 'true';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (isEditable) {
      document.execCommand('insertText', false, ch);
    } else {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        'value',
      ).set;
      setter.call(el, (el.value || '') + ch);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
    await YA.sleep(YA.typingDelay(ch, msPerChar));
    if (i > 0 && i % YA.randInt(35, 60) === 0) await YA.sleep(YA.randInt(500, 1800));
  }
  el.dispatchEvent(new Event('change', { bubbles: true }));
};
