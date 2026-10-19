import { estimateTokens } from './tokens';

export interface Usage {
  prompt_tokens: number;
  completion_tokens: number;
  cachedPromptTokens?: number;
  total_tokens: number;
}

/**
 * Ambil jumlah token cache-hit dari payload usage upstream.
 * 9Router OpenAI-compatible biasanya kirim `prompt_tokens_details.cached_tokens`;
 * sebagian provider (Anthropic dkk lewat gateway) pakai `cache_read_input_tokens`.
 */
export function extractCachedTokens(usage: Record<string, unknown> | undefined): number {
  if (!usage) return 0;
  const details = usage.prompt_tokens_details as { cached_tokens?: number } | undefined;
  if (typeof details?.cached_tokens === 'number') return Math.max(0, details.cached_tokens);
  if (typeof usage.cached_tokens === 'number') return Math.max(0, usage.cached_tokens);
  if (typeof usage.cache_read_input_tokens === 'number') return Math.max(0, usage.cache_read_input_tokens);
  return 0;
}

export interface StreamState {
  publicModel: string;
  internalModel: string;
  contentBuffer: string[];
  usage?: Usage;
  finishReason: string | null;
  sawDone: boolean;
  receivedFirstChunk: boolean;
  aborted: boolean;
  errorCode?: string;
}

export type SettleFn = (state: StreamState) => Promise<void>;

export function createNormalizer(
  publicModel: string,
  internalModel: string,
  promptText: string,
  onSettle: SettleFn,
): TransformStream<Uint8Array, Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  const state: StreamState = {
    publicModel,
    internalModel,
    contentBuffer: [],
    usage: undefined,
    finishReason: null,
    sawDone: false,
    receivedFirstChunk: false,
    aborted: false,
  };

  let buffer = '';

  return new TransformStream({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true });

      let idx: number;
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const rawEvent = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);

        const dataLines = rawEvent
          .split('\n')
          .filter((l) => l.startsWith('data:'))
          .map((l) => l.slice(5).trim());
        if (dataLines.length === 0) continue;
        const dataPayload = dataLines.join('\n');

        if (dataPayload === '[DONE]') {
          state.sawDone = true;
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          continue;
        }

        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(dataPayload);
        } catch {
          controller.enqueue(encoder.encode(`data: ${dataPayload}\n\n`));
          continue;
        }

        state.receivedFirstChunk = true;

        if (typeof parsed.model === 'string') parsed.model = publicModel;

        const usage = parsed.usage as Usage | undefined;
        if (usage) {
          state.usage = {
            prompt_tokens: usage.prompt_tokens ?? 0,
            completion_tokens: usage.completion_tokens ?? 0,
            cachedPromptTokens: extractCachedTokens(parsed.usage as Record<string, unknown> | undefined),
            total_tokens:
              usage.total_tokens ?? (usage.prompt_tokens ?? 0) + (usage.completion_tokens ?? 0),
          };
        }

        const choices = parsed.choices as Array<{ delta?: { content?: string }; finish_reason?: string | null }> | undefined;
        const choice = choices?.[0];
        if (choice?.delta?.content) state.contentBuffer.push(choice.delta.content);
        if (choice?.finish_reason) state.finishReason = choice.finish_reason;

        controller.enqueue(encoder.encode(`data: ${JSON.stringify(parsed)}\n\n`));
      }
    },

    async flush(controller) {
      if (!state.sawDone) {
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      }

      if (!state.usage) {
        const completion = estimateTokens(state.contentBuffer.join(''));
        const prompt = estimateTokens(promptText);
        state.usage = {
          prompt_tokens: prompt,
          completion_tokens: completion,
          cachedPromptTokens: 0,
          total_tokens: prompt + completion,
        };
      }

      await onSettle(state);
    },
  });
}

export function streamErrorChunk(controller: TransformStreamDefaultController<Uint8Array>, code: string): void {
  const enc = new TextEncoder();
  controller.enqueue(
    enc.encode(
      `data: ${JSON.stringify({ error: { message: 'Upstream error.', type: 'api_error', code } })}\n\n`,
    ),
  );
  controller.enqueue(enc.encode('data: [DONE]\n\n'));
}