/**
 * Селекторы biz.yelp.com. Yelp периодически меняет верстку — все точки
 * взаимодействия собраны здесь, каждая с несколькими кандидатами.
 * Если ни один кандидат не сработал, runner переключается на UI-TARS
 * GUI-агент (визуальное управление), так что ломаться "насмерть" нечему.
 */

export const SEL = {
  /** Элементы списка диалогов во входящих */
  conversationItems: [
    '[data-testid="conversation-list"] a[href*="/inbox/"]',
    'a[href^="/inbox/"][role="listitem"]',
    'div[class*="conversation-list"] a[href*="/inbox/"]',
    'a[href*="/biz_inbox/"]',
  ],
  /** Маркер непрочитанности внутри элемента списка */
  unreadMarker: [
    '[data-testid="unread-indicator"]',
    '[class*="unread"]',
    'span[aria-label*="unread" i]',
  ],
  /** Имя клиента в элементе списка / шапке диалога */
  customerName: [
    '[data-testid="conversation-header"] h2',
    '[data-testid="customer-name"]',
    'h2[class*="heading"]',
  ],
  /** Сообщения внутри открытого диалога */
  messageBubbles: [
    '[data-testid="message-bubble"]',
    '[data-testid*="message"] p',
    'div[class*="message-bubble"]',
    'div[class*="messageBubble"]',
  ],
  /** Поле ввода ответа */
  replyInput: [
    'textarea[placeholder*="reply" i]',
    'textarea[placeholder*="message" i]',
    '[data-testid="reply-textarea"]',
    'div[contenteditable="true"][role="textbox"]',
    'textarea',
  ],
  /** Кнопка отправки */
  sendButton: [
    'button[type="submit"]:has-text("Send")',
    'button:has-text("Send")',
    '[data-testid="send-button"]',
    'button[aria-label*="send" i]',
  ],
} as const;

export type SelectorKey = keyof typeof SEL;
