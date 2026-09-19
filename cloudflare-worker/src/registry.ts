import { LLMProviderId, ModelCandidate } from './types';

export interface ProviderDefinition {
  id: LLMProviderId;
  name: string;
  workerUrl: string; // Dedicated Cloudflare Worker microservice proxy
  models: string[];
}

export const PROVIDER_REGISTRY: ProviderDefinition[] = [
  {
    id: 'groq',
    name: 'Groq',
    workerUrl: 'https://groq.nclong87.workers.dev/openai/v1',
    models: [
      'openai/gpt-oss-120b',
      'openai/gpt-oss-20b',
      'openai/gpt-oss-safeguard-20b',
      'groq/compound',
      'qwen/qwen3.8-27b'
    ]
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    workerUrl: 'https://gemini.nclong87.workers.dev/v1beta',
    models: [
      'gemini-3.6-flash',
      'gemini-3.8-flash'
    ]
  },
  {
    id: '9flare',
    name: '9Flare',
    workerUrl: 'https://9flare.nclong87.workers.dev/api/v1',
    models: [
      'pro/gpt-5.6-luna',
      'pro/claude-haiku-4-5'
    ]
  },
  {
    id: 'ollama',
    name: 'Ollama',
    workerUrl: 'https://ollama.nclong87.workers.dev/v1',
    models: [
      'gpt-oss:20b',
      'gemma4:31b',
      'nemotron-3-nano:30b-cloud'
    ]
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    workerUrl: 'https://openrouter.nclong87.workers.dev/api/v1',
    models: [
      'meta-llama/llama-3.3-70b-instruct',
      'google/gemini-2.0-flash',
      'cohere/command-r-plus'
    ]
  },
  {
    id: 'cloudflare',
    name: 'Cloudflare Workers AI',
    workerUrl: 'https://cloudflare.nclong87.workers.dev',
    models: [
      '@cf/aisingapore/gemma-sea-lion-v4-27b-it',
      '@cf/meta/llama-3.3-70b-instruct-fp8-fast'
    ]
  }
];

/**
 * Returns an interleaved list of candidates across providers so fair rotation
 * naturally alternates between different providers.
 */
export function getAllRegisteredCandidates(): ModelCandidate[] {
  const candidates: ModelCandidate[] = [];
  const providers = PROVIDER_REGISTRY;
  const maxModels = Math.max(...providers.map(p => p.models.length), 0);

  for (let i = 0; i < maxModels; i++) {
    for (const p of providers) {
      if (p.models[i]) {
        candidates.push({
          provider: p.id,
          model: p.models[i],
          workerUrl: p.workerUrl
        });
      }
    }
  }
  return candidates;
}
