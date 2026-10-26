import Anthropic from '@anthropic-ai/sdk';

const client = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

const MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-opus-4-5';

export interface LLMMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function complete(
  messages: LLMMessage[],
  systemPrompt?: string,
  fallback?: string
): Promise<string> {
  if (!client) {
    return fallback ?? '[LLM not configured — set ANTHROPIC_API_KEY]';
  }
  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: systemPrompt,
      messages,
    });
    const block = response.content[0];
    return block.type === 'text' ? block.text : '';
  } catch (err) {
    console.error('[LLM] Error:', err instanceof Error ? err.message : err);
    return fallback ?? '[LLM error]';
  }
}

export async function completeJSON<T>(
  messages: LLMMessage[],
  systemPrompt?: string,
  fallback?: T
): Promise<T> {
  const raw = await complete(messages, systemPrompt, fallback ? JSON.stringify(fallback) : undefined);
  try {
    const match = raw.match(/```json\n?([\s\S]*?)\n?```/) ?? raw.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    return JSON.parse(match ? match[1] : raw) as T;
  } catch {
    if (fallback !== undefined) return fallback;
    throw new Error(`LLM did not return valid JSON: ${raw.slice(0, 200)}`);
  }
}
