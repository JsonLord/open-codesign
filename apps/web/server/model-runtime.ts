import { complete } from '@open-codesign/providers';
import type { ChatMessage, ModelRef, WireApi } from '@open-codesign/shared';

export interface WebModelConfig {
  provider: string;
  model: string;
  apiKey: string;
  baseUrl?: string;
  wire?: WireApi;
}

export interface RuntimeStatus {
  ready: boolean;
  storageRoot: string;
  model?: { provider: string; model: string };
  message?: string;
}

const WIRES = new Set<WireApi>([
  'anthropic',
  'openai-chat',
  'openai-responses',
  'openai-codex-responses',
]);

export function readModelConfig(env: NodeJS.ProcessEnv = process.env): WebModelConfig | null {
  const provider = env['CODESIGN_PROVIDER']?.trim();
  const model = env['CODESIGN_MODEL']?.trim();
  const apiKey = env['CODESIGN_API_KEY']?.trim();
  if (!provider || !model || !apiKey) return null;
  const wireValue = env['CODESIGN_WIRE']?.trim() as WireApi | undefined;
  if (wireValue && !WIRES.has(wireValue))
    throw new Error(`Unsupported CODESIGN_WIRE: ${wireValue}`);
  return {
    provider,
    model,
    apiKey,
    ...(env['CODESIGN_BASE_URL']?.trim() ? { baseUrl: env['CODESIGN_BASE_URL']?.trim() } : {}),
    ...(wireValue ? { wire: wireValue } : {}),
  };
}

export function runtimeStatus(storageRoot: string, config: WebModelConfig | null): RuntimeStatus {
  if (!config) {
    return {
      ready: false,
      storageRoot,
      message: 'Set CODESIGN_PROVIDER, CODESIGN_MODEL, and CODESIGN_API_KEY to enable generation.',
    };
  }
  return { ready: true, storageRoot, model: { provider: config.provider, model: config.model } };
}

export function extractJsx(content: string): string {
  const fenced = content.match(/```(?:jsx|tsx|javascript|js)?\s*\n([\s\S]*?)```/i)?.[1];
  const source = (fenced ?? content).trim();
  if (!source.includes('export default')) {
    throw new Error('The model response did not contain a default-exported React component');
  }
  return `${source}\n`;
}

export async function generateSource(
  config: WebModelConfig,
  prompt: string,
  previousSource: string,
): Promise<string> {
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content:
        'You are Open CoDesign. Return only one complete App.jsx file as a default-exported React component. Use inline styles or CSS-in-JS; do not use imports, external packages, network assets, or markdown commentary.',
    },
    {
      role: 'user',
      content: `Design request:\n${prompt}\n\nCurrent App.jsx (improve or replace it):\n${previousSource}`,
    },
  ];
  const result = await complete(
    { provider: config.provider, modelId: config.model } as ModelRef,
    messages,
    {
      apiKey: config.apiKey,
      ...(config.baseUrl ? { baseUrl: config.baseUrl } : {}),
      ...(config.wire ? { wire: config.wire } : {}),
    },
  );
  return extractJsx(result.content);
}
