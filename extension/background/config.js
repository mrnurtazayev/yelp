// Конфиг и рантайм-состояние живут в chrome.storage.local.
// Два ключа: 'config' (что настроил пользователь) и 'state' (что бот сделал).

export const DEFAULT_CONFIG = {
  setupDone: false,
  enabled: false,

  provider: 'anthropic', // 'anthropic' | 'openai' | 'mock'
  // Anthropic
  apiKey: '',
  model: 'claude-opus-4-8',
  // OpenAI-совместимый сервер
  openaiBaseUrl: 'https://api.openai.com/v1',
  openaiKey: '',
  openaiModel: 'gpt-4o',

  business: {
    name: '',
    category: '',
    city: '',
    phone: '',
    language: 'English',
  },
  persona: {
    name: '',
    tone: 'Friendly, brief, and professional. Writes like a real busy business owner texting from a phone: short sentences, no corporate fluff. Always asks a clarifying question to move the deal forward.',
  },
  facts: [],
  rules: [
    'Never promise an exact final price — only starting rates and a free estimate.',
    'Never say you are an AI or an assistant.',
  ],
  handoffTriggers: [
    'customer is angry or threatens a bad review / legal action',
    'refund or damage claim',
    'complex custom job that does not fit standard pricing',
  ],
  handoffReply:
    "Thanks for reaching out! Let me check the details and get back to you shortly.",

  behavior: {
    activeFrom: '08:00',
    activeTo: '21:00',
    delayMinSec: 45,
    delayMaxSec: 240,
    typingMsPerChar: 55,
    maxRepliesPerDay: 60,
    pollMinutes: 2,
    cooldownSec: 300,
  },
};

const DEFAULT_STATE = {
  repliesByDay: {}, // 'YYYY-MM-DD' -> count
  conversations: {}, // id -> { lastRepliedKey, lastReplyAt, needsHuman, handoffReason, customer }
  activity: [], // [{ts,type,customer,text}]
};

export async function getConfig() {
  const { config } = await chrome.storage.local.get('config');
  return deepMerge(structuredCloneSafe(DEFAULT_CONFIG), config ?? {});
}

export async function setConfig(patch) {
  const cur = await getConfig();
  const next = deepMerge(cur, patch);
  await chrome.storage.local.set({ config: next });
  return next;
}

export async function getState() {
  const { state } = await chrome.storage.local.get('state');
  return deepMerge(structuredCloneSafe(DEFAULT_STATE), state ?? {});
}

export async function setState(mutator) {
  const cur = await getState();
  mutator(cur);
  await chrome.storage.local.set({ state: cur });
  return cur;
}

export function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function structuredCloneSafe(o) {
  return JSON.parse(JSON.stringify(o));
}

function deepMerge(base, patch) {
  if (Array.isArray(patch)) return patch.slice();
  if (patch && typeof patch === 'object') {
    const out = Array.isArray(base) ? {} : { ...base };
    for (const k of Object.keys(patch)) {
      out[k] =
        base && typeof base[k] === 'object' && !Array.isArray(base[k])
          ? deepMerge(base[k] ?? {}, patch[k])
          : deepMerge(base?.[k], patch[k]);
    }
    return out;
  }
  return patch === undefined ? base : patch;
}
