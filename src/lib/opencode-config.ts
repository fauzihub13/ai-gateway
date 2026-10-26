/**
 * Generators for OpenCode provider configuration.
 *
 * Mpruy AI is exposed as an OpenAI-compatible endpoint, so OpenCode can use it
 * as a custom provider. V2 and V1 use different config shapes:
 *
 *   V2 → `providers` (plural) + `package` + `settings`
 *   V1 → `provider`  (singular) + `npm`     + `options`
 *
 * Per-model fields also differ:
 *   V2 → `capabilities` (models.dev v2 shape) + `variants` array (objects with `id`)
 *   V1 → `variants` object keyed by variant name (no `capabilities`)
 *
 * `variants` here are thinking levels (low → max), selected with `#variant`.
 * The generated output is valid JSON (also valid JSONC).
 */

export interface OpenCodeReasoning {
  /** Effort/thinking levels to offer, e.g. `["low", "medium", "high", "max"]`. */
  effort?: string[];
}

export interface OpenCodeModel {
  /** Public model name, e.g. `gpt-4o`. Used as the OpenCode model key. */
  publicName: string;
  /** Human-readable label. */
  displayName: string;
  /** Context window in tokens (optional). */
  contextWindow?: number | null;
  /** Max output tokens (optional). */
  maxOutputTokens?: number | null;
  /** Model accepts image input. Adds `image` to `capabilities.input`. */
  vision?: boolean;
  /** Model supports tool/function calling. */
  tools?: boolean;
  /**
   * Optional thinking-level override. When omitted, the default low → max
   * levels are used.
   */
  reasoning?: OpenCodeReasoning;
}

export interface OpenCodeConfigArgs {
  /** Platform origin, e.g. `https://api.mpruy.my.id` (no trailing slash needed). */
  baseUrl: string;
  /** Models to add to the provider's `models` map. */
  models: OpenCodeModel[];
  /** Public name used as the default `model`. */
  defaultModel: string;
  /**
   * Credential value written into the config. Use a placeholder such as
   * `sk-mpruy-YOUR_KEY`, or `{env:MPRUY_API_KEY}` when `useEnv` is true.
   */
  apiKey: string;
  /** Provider id (also the model reference prefix). Defaults to `mpruy`. */
  providerId?: string;
  /** Env var name used in env mode. Defaults to `MPRUY_API_KEY`. */
  envVar?: string;
  /** Omit the inline key and read it from an environment variable instead. */
  useEnv?: boolean;
  /** Emit thinking-level `variants`. Defaults to true. */
  includeVariants?: boolean;
  /**
   * Sertakan object `limit` (context/output) pada tiap model. Defaults to true.
   * Set `false` untuk config tanpa `limit` sama sekali.
   */
  includeLimit?: boolean;
}

const SCHEMA = 'https://opencode.ai/config.json';
const PACKAGE = '@opencode/ai/providers/openai-compatible';
const PROVIDER_NAME = 'Mpruy AI';

/** Thinking levels offered by default, low → max. */
export const DEFAULT_THINKING_LEVELS = ['low', 'medium', 'high', 'max'];

/** Normalize the platform origin to the OpenAI-compatible `/v1` base. */
export function apiBase(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/v1`;
}

function limitOf(m: OpenCodeModel, includeLimit: boolean): Record<string, number> | undefined {
  if (!includeLimit) return undefined;
  const limit: Record<string, number> = {};
  if (m.contextWindow) limit.context = m.contextWindow;
  if (m.maxOutputTokens) limit.output = m.maxOutputTokens;
  return Object.keys(limit).length ? limit : undefined;
}

/** models.dev v2 capabilities shape. */
function capabilitiesOf(m: OpenCodeModel): Record<string, unknown> {
  return {
    tools: m.tools === true,
    input: m.vision ? ['text', 'image'] : ['text'],
    output: ['text'],
  };
}

/** Thinking levels for a model: its override, or the low → max defaults. */
function thinkingLevels(m: OpenCodeModel): string[] {
  const effort = m.reasoning?.effort;
  return effort && effort.length ? effort : DEFAULT_THINKING_LEVELS;
}

/** V2 `variants`: array of objects with an `id` + `settings`. */
function v2Variants(m: OpenCodeModel): Array<Record<string, unknown>> {
  return thinkingLevels(m).map((id) => ({ id, settings: { reasoningEffort: id } }));
}

/** V1 `variants`: object keyed by variant name. */
function v1Variants(m: OpenCodeModel): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const id of thinkingLevels(m)) out[id] = { reasoningEffort: id };
  return out;
}

function v2Entry(
  m: OpenCodeModel,
  includeVariants: boolean,
  includeLimit: boolean,
): Record<string, unknown> {
  const limit = limitOf(m, includeLimit);
  return {
    name: m.displayName,
    capabilities: capabilitiesOf(m),
    ...(limit ? { limit } : {}),
    ...(includeVariants ? { variants: v2Variants(m) } : {}),
  };
}

function v1Entry(
  m: OpenCodeModel,
  includeVariants: boolean,
  includeLimit: boolean,
): Record<string, unknown> {
  const limit = limitOf(m, includeLimit);
  return {
    name: m.displayName,
    ...(limit ? { limit } : {}),
    ...(includeVariants ? { variants: v1Variants(m) } : {}),
  };
}

function modelsMap(
  models: OpenCodeModel[],
  includeVariants: boolean,
  includeLimit: boolean,
  entry: (
    m: OpenCodeModel,
    includeVariants: boolean,
    includeLimit: boolean,
  ) => Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const m of models) out[m.publicName] = entry(m, includeVariants, includeLimit);
  return out;
}

function fallbackModels(models: OpenCodeModel[], defaultModel: string): OpenCodeModel[] {
  return models.length ? models : [{ publicName: defaultModel, displayName: defaultModel }];
}

/** Config V2 sebagai object — dipakai untuk render JSON tree interaktif. */
export function buildOpenCodeV2Object(args: OpenCodeConfigArgs): Record<string, unknown> {
  const providerId = args.providerId ?? 'mpruy';
  const envVar = args.envVar ?? 'MPRUY_API_KEY';
  const includeVariants = args.includeVariants ?? true;
  const includeLimit = args.includeLimit ?? true;
  const models = fallbackModels(args.models, args.defaultModel);

  const settings: Record<string, unknown> = { baseURL: apiBase(args.baseUrl) };
  settings.apiKey = args.useEnv ? `{env:${envVar}}` : args.apiKey;

  const provider: Record<string, unknown> = {
    name: PROVIDER_NAME,
    ...(args.useEnv ? { env: [envVar] } : {}),
    package: PACKAGE,
    settings,
    models: modelsMap(models, includeVariants, includeLimit, v2Entry),
  };

  return {
    $schema: SCHEMA,
    model: `${providerId}/${args.defaultModel}`,
    providers: { [providerId]: provider },
  };
}

/** Config V1 sebagai object — dipakai untuk render JSON tree interaktif. */
export function buildOpenCodeV1Object(args: OpenCodeConfigArgs): Record<string, unknown> {
  const providerId = args.providerId ?? 'mpruy';
  const envVar = args.envVar ?? 'MPRUY_API_KEY';
  const includeVariants = args.includeVariants ?? true;
  const includeLimit = args.includeLimit ?? true;
  const models = fallbackModels(args.models, args.defaultModel);

  const options: Record<string, unknown> = { baseURL: apiBase(args.baseUrl) };
  options.apiKey = args.useEnv ? `{env:${envVar}}` : args.apiKey;

  return {
    $schema: SCHEMA,
    model: `${providerId}/${args.defaultModel}`,
    provider: {
      [providerId]: {
        npm: PACKAGE,
        name: PROVIDER_NAME,
        options,
        models: modelsMap(models, includeVariants, includeLimit, v1Entry),
      },
    },
  };
}

export function buildOpenCodeV2(args: OpenCodeConfigArgs): string {
  return JSON.stringify(buildOpenCodeV2Object(args), null, 2);
}

export function buildOpenCodeV1(args: OpenCodeConfigArgs): string {
  return JSON.stringify(buildOpenCodeV1Object(args), null, 2);
}

/** Path hint shown to the user, per OpenCode docs. */
export const OPENCODE_GLOBAL_CONFIG_PATH = '~/.config/opencode/opencode.jsonc';