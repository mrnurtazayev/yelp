import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import YAML from 'yaml';
import { z } from 'zod';

dotenv.config();

const timeRange = z.object({ from: z.string(), to: z.string() });
const numRange = z.object({ min: z.number(), max: z.number() });

const businessConfigSchema = z.object({
  business: z.object({
    name: z.string(),
    category: z.string().default(''),
    city: z.string().default(''),
    phone: z.string().default(''),
    languages: z.array(z.string()).default(['English']),
  }),
  persona: z.object({
    name: z.string(),
    role: z.string().default('owner'),
    tone: z.string(),
  }),
  facts: z.array(z.string()).default([]),
  rules: z.array(z.string()).default([]),
  handoff_triggers: z.array(z.string()).default([]),
  handoff_reply: z.string().default(''),
  behavior: z.object({
    active_hours: timeRange.default({ from: '08:00', to: '21:00' }),
    reply_delay_seconds: numRange.default({ min: 45, max: 240 }),
    typing_ms_per_char: z.number().default(55),
    max_replies_per_day: z.number().default(60),
    poll_interval_seconds: z.number().default(90),
    per_conversation_cooldown_seconds: z.number().default(300),
  }),
});

export type BusinessConfig = z.infer<typeof businessConfigSchema>;

export interface AppConfig {
  llmProvider: 'anthropic' | 'openai-compatible' | 'mock';
  anthropic: { apiKey: string; model: string };
  openai: { baseUrl: string; apiKey: string; model: string };
  uitars: { baseUrl: string; apiKey: string; model: string };
  dataDir: string;
  dashboardPort: number;
  headless: boolean;
  business: BusinessConfig;
}

export function loadConfig(): AppConfig {
  const businessPath = process.env.BUSINESS_CONFIG ?? './config/business.yaml';
  const resolved = path.resolve(businessPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(
      `Business config not found: ${resolved}\n` +
        `Скопируйте config/business.example.yaml в config/business.yaml и заполните.`,
    );
  }
  const business = businessConfigSchema.parse(YAML.parse(fs.readFileSync(resolved, 'utf8')));

  const dataDir = path.resolve(process.env.DATA_DIR ?? './data');
  fs.mkdirSync(dataDir, { recursive: true });

  return {
    llmProvider: (process.env.LLM_PROVIDER as AppConfig['llmProvider']) ?? 'anthropic',
    anthropic: {
      apiKey: process.env.ANTHROPIC_API_KEY ?? '',
      model: process.env.ANTHROPIC_MODEL ?? 'claude-opus-4-8',
    },
    openai: {
      baseUrl: process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1',
      apiKey: process.env.OPENAI_API_KEY ?? '',
      model: process.env.OPENAI_MODEL ?? 'gpt-4o',
    },
    uitars: {
      baseUrl: process.env.UITARS_BASE_URL ?? '',
      apiKey: process.env.UITARS_API_KEY ?? '',
      model: process.env.UITARS_MODEL ?? '',
    },
    dataDir,
    dashboardPort: Number(process.env.DASHBOARD_PORT ?? 8377),
    headless: (process.env.HEADLESS ?? 'false') === 'true',
    business,
  };
}
