import Anthropic from '@anthropic-ai/sdk';
import { createLogger } from '../logger.js';
import type { AppConfig } from '../config.js';
import type { ChatMessage } from '../yelp/inbox.js';
import { buildSystemPrompt, buildUserPrompt } from './prompt.js';

const log = createLogger('brain');

export interface GeneratedReply {
  handoff: boolean;
  reason: string;
  reply: string;
}

const REPLY_SCHEMA = {
  type: 'object',
  properties: {
    handoff: { type: 'boolean' },
    reason: { type: 'string' },
    reply: { type: 'string' },
  },
  required: ['handoff', 'reason', 'reply'],
  additionalProperties: false,
} as const;

export async function generateReply(
  cfg: AppConfig,
  customer: string,
  messages: ChatMessage[],
): Promise<GeneratedReply> {
  const system = buildSystemPrompt(cfg.business);
  const user = buildUserPrompt(customer, messages);

  switch (cfg.llmProvider) {
    case 'anthropic':
      return viaAnthropic(cfg, system, user);
    case 'openai-compatible':
      return viaOpenAiCompatible(cfg, system, user);
    case 'mock':
      return {
        handoff: false,
        reason: '',
        reply: `Thanks for reaching out! Could you share a few more details so I can help? (mock reply)`,
      };
  }
}

async function viaAnthropic(cfg: AppConfig, system: string, user: string): Promise<GeneratedReply> {
  const client = new Anthropic({ apiKey: cfg.anthropic.apiKey });
  const response = await client.messages.create({
    model: cfg.anthropic.model,
    max_tokens: 1024,
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    output_config: { format: { type: 'json_schema', schema: REPLY_SCHEMA } },
    messages: [{ role: 'user', content: user }],
  });
  if (response.stop_reason === 'refusal') {
    log.warn('Model refused; handing off to human');
    return { handoff: true, reason: 'model refusal', reply: '' };
  }
  const text = response.content.find((b) => b.type === 'text')?.text ?? '';
  return parseReply(text);
}

async function viaOpenAiCompatible(
  cfg: AppConfig,
  system: string,
  user: string,
): Promise<GeneratedReply> {
  const res = await fetch(`${cfg.openai.baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${cfg.openai.apiKey}`,
    },
    body: JSON.stringify({
      model: cfg.openai.model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 1024,
    }),
  });
  if (!res.ok) {
    throw new Error(`LLM HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return parseReply(data.choices?.[0]?.message?.content ?? '');
}

function parseReply(text: string): GeneratedReply {
  try {
    // на случай, если модель обернула JSON в ```-блок
    const jsonText = text.replace(/^```(json)?/m, '').replace(/```\s*$/m, '').trim();
    const parsed = JSON.parse(jsonText) as Partial<GeneratedReply>;
    return {
      handoff: Boolean(parsed.handoff),
      reason: String(parsed.reason ?? ''),
      reply: String(parsed.reply ?? '').trim(),
    };
  } catch {
    log.warn('Не удалось распарсить JSON от LLM, отдаю на человека. Ответ был:', text.slice(0, 200));
    return { handoff: true, reason: 'unparseable LLM output', reply: '' };
  }
}
