import { encode } from 'gpt-tokenizer';

export function estimateTokens(text: string): number {
  if (!text) return 0;
  try {
    return encode(text).length;
  } catch {
    return Math.ceil(text.length / 4);
  }
}

interface MsgPart {
  type?: string;
  text?: string;
}

export function estimatePromptTokens(
  messages: Array<{ role: string; content: unknown }>,
): number {
  let total = 0;
  for (const m of messages) {
    total += 4;
    if (typeof m.content === 'string') {
      total += estimateTokens(m.content);
    } else if (Array.isArray(m.content)) {
      for (const part of m.content as MsgPart[]) {
        if (part?.type === 'text') total += estimateTokens(part.text ?? '');
        if (part?.type === 'image_url') total += 85;
      }
    }
  }
  return total + 2;
}

export function promptToText(messages: Array<{ role: string; content: unknown }>): string {
  return messages
    .map((m) => (typeof m.content === 'string' ? m.content : ''))
    .join('\n');
}