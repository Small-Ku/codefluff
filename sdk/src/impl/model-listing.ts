/**
 * Model listing functionality for codefluff providers
 * Lists available models from each configured provider
 */

import { loadCodefluffConfig, type ProviderKeyConfig } from '@codebuff/common/config/codefluff-config'

export interface ModelInfo {
  id: string
  name?: string
  description?: string
  contextWindow?: number
}

export interface ProviderModels {
  provider: string
  models: ModelInfo[]
  error?: string
}

// Default base URLs for known providers
const PROVIDER_BASE_URLS: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
  google: 'https://generativelanguage.googleapis.com/v1beta',
  deepseek: 'https://api.deepseek.com/v1',
  xai: 'https://api.x.ai/v1',
  'nvidia-nim': 'https://integrate.api.nvidia.com/v1',
  openrouter: 'https://openrouter.ai/api/v1',
}

// Known models for providers that don't support listing
const KNOWN_MODELS: Record<string, ModelInfo[]> = {
  anthropic: [
    { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5' },
    { id: 'claude-sonnet-4', name: 'Claude Sonnet 4' },
    { id: 'claude-opus-4', name: 'Claude Opus 4' },
    { id: 'claude-3-5-sonnet', name: 'Claude 3.5 Sonnet' },
    { id: 'claude-3-5-haiku', name: 'Claude 3.5 Haiku' },
  ],
  google: [
    { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
    { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash' },
    { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' },
    { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash' },
  ],
}

/**
 * Get base URL for a provider
 */
function getBaseURL(provider: string, config?: ProviderKeyConfig): string {
  if (typeof config === 'object' && config?.baseURL) {
    return config.baseURL
  }
  return PROVIDER_BASE_URLS[provider] || ''
}

/**
 * Get API key for a provider
 */
function getAPIKey(config?: ProviderKeyConfig): string {
  if (typeof config === 'string') return config
  if (typeof config === 'object' && config?.key) return config.key
  return ''
}

/**
 * Get headers for a provider request
 */
function getHeaders(provider: string, config?: ProviderKeyConfig): Record<string, string> {
  const apiKey = getAPIKey(config)
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  // Add custom headers from config
  if (typeof config === 'object' && config?.headers) {
    Object.assign(headers, config.headers)
  }

  // Add authorization header
  if (apiKey) {
    if (provider === 'anthropic') {
      headers['x-api-key'] = apiKey
      headers['anthropic-version'] = '2023-06-01'
    } else if (provider === 'google') {
      // Google uses query param for key
    } else {
      headers['Authorization'] = `Bearer ${apiKey}`
    }
  }

  return headers
}

/**
 * List models from OpenAI-compatible API
 */
async function listOpenAICompatibleModels(
  baseURL: string,
  apiKey: string,
  headers?: Record<string, string>,
): Promise<ModelInfo[]> {
  const url = `${baseURL}/models`
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...headers,
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to list models: ${response.status} ${response.statusText}`)
  }

  const data = (await response.json()) as { data?: Array<{ id: string }> }
  return (
    data.data?.map((model) => ({
      id: model.id,
    })) || []
  )
}

/**
 * List models from Google Gemini API
 */
async function listGoogleModels(apiKey: string, baseURL?: string): Promise<ModelInfo[]> {
  const resolvedBaseURL = baseURL || 'https://generativelanguage.googleapis.com/v1beta'
  const url = `${resolvedBaseURL}/models?key=${apiKey}`
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to list models: ${response.status} ${response.statusText}`)
  }

  const data = (await response.json()) as {
    models?: Array<{ name: string; description?: string }>
  }
  return (
    data.models?.map((model) => ({
      id: model.name.replace('models/', ''),
      description: model.description,
    })) || []
  )
}

/**
 * List models from a specific provider
 */
export async function listModelsForProvider(provider: string): Promise<ProviderModels> {
  const config = loadCodefluffConfig()
  const keys = config.keys ?? {}
  const providerConfig = keys[provider]

  if (!providerConfig) {
    return {
      provider,
      models: [],
      error: `No configuration found for provider: ${provider}`,
    }
  }

  const apiKey = getAPIKey(providerConfig)
  if (!apiKey) {
    return {
      provider,
      models: [],
      error: `No API key configured for provider: ${provider}`,
    }
  }

  try {
    let models: ModelInfo[]

    switch (provider) {
      case 'anthropic':
        // Anthropic doesn't have a public models endpoint yet
        models = KNOWN_MODELS.anthropic || []
        break

      case 'google': {
        const googleBaseURL = getBaseURL(provider, providerConfig)
        models = await listGoogleModels(apiKey, googleBaseURL)
        break
      }

      case 'openai':
      case 'deepseek':
      case 'xai':
      case 'nvidia-nim':
      case 'openrouter':
      case 'new-api':
      default: {
        const configBaseURL = getBaseURL(provider, providerConfig)
        // Fall back to PROVIDER_BASE_URLS defaults for known providers (same as model-provider.ts)
        const baseURL = configBaseURL || PROVIDER_BASE_URLS[provider]
        
        // Only throw error for new-api which truly requires custom baseURL
        if (!baseURL) {
          throw new Error(
            `Provider "${provider}" requires a baseURL to be configured. ` +
              `Add "baseURL" to the provider configuration in ~/.config/codefluff/config.json`
          )
        }
        
        const headers =
          typeof providerConfig === 'object' ? providerConfig.headers : undefined
        models = await listOpenAICompatibleModels(baseURL, apiKey, headers)
        break
      }
    }

    return { provider, models }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)

    // Fallback to known models if available
    if (KNOWN_MODELS[provider]) {
      return {
        provider,
        models: KNOWN_MODELS[provider],
      }
    }

    return {
      provider,
      models: [],
      error: message,
    }
  }
}

/**
 * List models from all configured providers
 */
export async function listAllModels(): Promise<ProviderModels[]> {
  const config = loadCodefluffConfig()
  const keys = config.keys ?? {}
  const providers = Object.keys(keys)

  const results: ProviderModels[] = []

  for (const provider of providers) {
    const result = await listModelsForProvider(provider)
    results.push(result)
  }

  return results
}

/**
 * Get formatted model list for display
 */
export function formatModelList(results: ProviderModels[]): string {
  const lines: string[] = []

  for (const { provider, models, error } of results) {
    lines.push(`\n${provider.toUpperCase()}:`)
    lines.push('='.repeat(provider.length + 1))

    if (error) {
      lines.push(`  Error: ${error}`)
    } else if (models.length === 0) {
      lines.push('  No models found')
    } else {
      for (const model of models) {
        const name = model.name ? ` (${model.name})` : ''
        lines.push(`  - ${model.id}${name}`)
      }
    }

    lines.push('')
  }

  return lines.join('\n')
}
