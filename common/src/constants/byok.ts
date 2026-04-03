export const BYOK_OPENROUTER_HEADER = 'x-openrouter-api-key'
export const BYOK_OPENROUTER_ENV_VAR = 'CODEBUFF_BYOK_OPENROUTER'

export const CODEFLUFF_BYOK_KEYS_ENV_VAR = 'CODEFLUFF_BYOK_KEYS'

export type ByokProvider = 'openrouter' | 'anthropic' | 'openai' | 'google'

export type ByokProviderConfig = {
  keys: Partial<Record<ByokProvider, string>>
}

export const BYOK_PROVIDER_ENV_VARS: Record<ByokProvider, string> = {
  openrouter: 'OPENROUTER_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  google: 'GOOGLE_API_KEY',
}

export function getByokEnvVar(provider: ByokProvider): string {
  return BYOK_PROVIDER_ENV_VARS[provider]
}
