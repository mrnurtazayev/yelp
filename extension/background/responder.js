// Вызов LLM из service worker. Поддержка: Anthropic, OpenAI-совместимый, mock.
import { buildSystemPrompt, buildUserPrompt } from './prompt.js';

const REPLY_SCHEMA = {
  type: 'object',
  properties: {
    handoff: { type: 'boolean' },
    reason: { type: 'string' },
    reply: { type: 'string' },
  },
  required: ['handoff', 'reason', 'reply'],
  additionalProperties: false,
};

/** @returns {Promise<{handoff:boolean, reason:string, reply:string}>} */
export async function generateReply(cfg, customer, messages) {
  const system = buildSystemPrompt(cfg);
  const user = buildUserPrompt(customer, messages);
  if (cfg.provider === 'mock') {
    return {
      handoff: false,
      reason: '',
      reply: 'Thanks for reaching out! Could you share a few details so I can help? (test reply)',
    };
  }
  if (cfg.provider === 'openai') return viaOpenAI(cfg, system, user);
  return viaAnthropic(cfg, system, user);
}

async function viaAnthropic(cfg, system, user) {
  if (!cfg.apiKey) throw new Error('Не указан Anthropic API key');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': cfg.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: cfg.model,
      max_tokens: 1024,
      system: [{ type: 'text', text: system }],
      output_config: { format: { type: 'json_schema', schema: REPLY_SCHEMA } },
      messages: [{ role: 'user', content: user }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  if (data.stop_reason === 'refusal') return { handoff: true, reason: 'model refusal', reply: '' };
  const text = (data.content || []).find((b) => b.type === 'text')?.text ?? '';
  return parseReply(text);
}

async function viaOpenAI(cfg, system, user) {
  if (!cfg.openaiKey) throw new Error('Не указан API key');
  const base = (cfg.openaiBaseUrl || '').replace(/\/$/, '');
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${cfg.openaiKey}`,
    },
    body: JSON.stringify({
      model: cfg.openaiModel,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 1024,
    }),
  });
  if (!res.ok) throw new Error(`LLM HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return parseReply(data.choices?.[0]?.message?.content ?? '');
}

function parseReply(text) {
  try {
    const jsonText = text.replace(/^```(json)?/im, '').replace(/```\s*$/m, '').trim();
    const p = JSON.parse(jsonText);
    return {
      handoff: Boolean(p.handoff),
      reason: String(p.reason ?? ''),
      reply: String(p.reply ?? '').trim(),
    };
  } catch {
    return { handoff: true, reason: 'unparseable LLM output', reply: '' };
  }
}
