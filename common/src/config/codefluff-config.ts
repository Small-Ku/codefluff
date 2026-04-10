/**
 * Shared Codefluff config loader — single source of truth.
 *
 * Zod-validated schema with ${ENV_VAR} interpolation support for secrets.
 * Replaces the three separate config loaders previously scattered across
 * cli/config, sdk/model-provider, and agent-runtime/search-providers.
 */

import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import z from 'zod/v4'

// ============================================================================
// Schema
// ============================================================================

export const costModes = [
  'free',
  'normal',
  'max',
  'experimental',
  'ask',
] as const
export type CostMode = (typeof costModes)[number]

const providerKeySchema = z.union([
  z.string().min(1),
  z.object({
    key: z.string().min(1),
    baseURL: z.string().min(1).optional(),
    style: z.enum(['openai', 'anthropic', 'google']).optional(),
    // Optional extra headers for providers like New-API
    headers: z.record(z.string(), z.string()).optional(),
  }),
])

// Per-model configuration
const modelConfigSchema = z.object({
 // Extra body parameters for this specific model (e.g., Nvidia NIM chat_template_kwargs)
 extraBody: z.record(z.string(), z.unknown()).optional(),
 // Maximum number of tokens to generate for this model
 max_tokens: z.number().int().positive().optional(),
 // Temperature (0-2 range, AI SDK default is 1)
 temperature: z.number().min(0).max(2).optional(),
 // Top P (0-1 range, AI SDK default is 1)
 top_p: z.number().min(0).max(1).optional(),
 // Top K (-1 to disable, or positive integer for active filtering)
 // -1 disables top_k ( Anthropic default), 0+ uses top_k tokens
 top_k: z.number().int().min(-1).optional(),
})

const modeMappingSchema = z
  .record(z.string(), z.string().min(1))
  .refine((mapping) => 'base' in mapping && mapping.base.length > 0, {
    message: 'Each cost mode mapping must define a "base" model',
    path: ['base'],
  })

const codefluffConfigSchema = z.object({
  keys: z.record(z.string(), providerKeySchema).optional(),
  // Per-model configuration (key: "provider/model-id")
  models: z.record(z.string(), modelConfigSchema).optional(),
  // Mapping from cost mode to agent model configuration.
  // Each mode must define 'base' as the default model.
  mapping: z.record(z.string(), modeMappingSchema).optional(),
  defaultMode: z.string().optional(),
  searchProviders: z.record(z.string(), z.string().min(1)).optional(),
})

export type CodefluffConfig = z.infer<typeof codefluffConfigSchema>
export type ProviderKeyConfig =
  | string
  | {
      key: string
      baseURL?: string
      style?: 'openai' | 'anthropic' | 'google'
      headers?: Record<string, string>
    }
export type ModelConfig = z.infer<typeof modelConfigSchema>

// ============================================================================
// Env-var interpolation
// ============================================================================

function interpolateEnvVars(value: string): string {
  return value.replace(/\$\{([^}]+)\}/g, (_, envVar) => {
    const envValue = process.env[envVar]
    if (!envValue) {
      throw new Error(
        `Environment variable ${envVar} is referenced in codefluff config but not set`,
      )
    }
    return envValue
  })
}

function interpolateEnvVarsInValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return interpolateEnvVars(value)
  }
  if (Array.isArray(value)) {
    return value.map(interpolateEnvVarsInValue)
  }
  if (typeof value === 'object' && value !== null) {
    const result: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) {
      result[k] = interpolateEnvVarsInValue(v)
    }
    return result
  }
  return value
}

function interpolateConfigKeys(
  obj: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      result[key] = interpolateEnvVars(value)
    } else if (typeof value === 'object' && value !== null && 'key' in value) {
      // Provider config object - interpolate all nested values
      result[key] = interpolateEnvVarsInValue(value)
    } else {
      result[key] = value
    }
  }
  return result
}

// ============================================================================
// Config path
// ============================================================================

function getConfigPath(): string {
  const homeDir = (process.env.HOME || process.env.USERPROFILE) ?? ''
  if (!homeDir) {
    throw new Error('Cannot determine home directory for codefluff config')
  }
  return join(homeDir, '.config', 'codefluff', 'config.json')
}

// ============================================================================
// Loaded and validated config (cached)
// ============================================================================

let _cachedConfig: CodefluffConfig | null = null

export function loadCodefluffConfig(): CodefluffConfig {
  if (_cachedConfig !== null) return _cachedConfig

  const configPath = getConfigPath()

  if (!existsSync(configPath)) {
    _cachedConfig = {}
    return _cachedConfig
  }

  try {
    const raw = readFileSync(configPath, 'utf8')
    const parsed = JSON.parse(raw)

    const interpolated = {
      ...parsed,
      ...(parsed.keys
        ? {
            keys: interpolateConfigKeys(parsed.keys as Record<string, unknown>),
          }
        : {}),
      ...(parsed.models
        ? {
            models: interpolateEnvVarsInValue(parsed.models) as Record<
              string,
              unknown
            >,
          }
        : {}),
      ...(parsed.searchProviders
        ? {
            searchProviders: Object.fromEntries(
              Object.entries(
                parsed.searchProviders as Record<string, string>,
              ).map(([k, v]) => [
                k,
                typeof v === 'string' ? interpolateEnvVars(v) : v,
              ]),
            ),
          }
        : {}),
    }

    const result = codefluffConfigSchema.parse(interpolated)

    _cachedConfig = result
    return result
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.warn(
        `[codefluff] Invalid config at ${configPath}:\n${error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n')}`,
      )
    } else {
      console.warn(
        `[codefluff] Failed to parse config at ${configPath}: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
    _cachedConfig = {}
    return _cachedConfig
  }
}

/** Clear cached config — useful for tests */
export function resetCodefluffConfigCache(): void {
  _cachedConfig = null
}

// ============================================================================
// Typed accessors
// ============================================================================

export function getConfiguredKeys(): Record<string, ProviderKeyConfig> {
  const config = loadCodefluffConfig()
  return (config.keys ?? {}) as Record<string, ProviderKeyConfig>
}

export function getDefaultMode(): CostMode {
  const config = loadCodefluffConfig()
  const mode = config.defaultMode ?? 'normal'
  return costModes.includes(mode as CostMode) ? (mode as CostMode) : 'normal'
}

/** Returns searchProviders as a Record<string, string> for the agent-runtime consumer */
export function getSearchProviders(): Record<string, string> {
  const config = loadCodefluffConfig()
  return config.searchProviders ?? {}
}

/** Returns model-specific configuration */
export function getModelConfig(model: string): ModelConfig | undefined {
  const config = loadCodefluffConfig()
  return config.models?.[model]
}

/** Returns max_tokens for a specific model */
export function getModelMaxTokens(model: string): number | undefined {
  const config = getModelConfig(model)
  return config?.max_tokens
}

/** Returns temperature for a specific model */
export function getModelTemperature(model: string): number | undefined {
  const config = getModelConfig(model)
  return config?.temperature
}

/** Returns top_p for a specific model */
export function getModelTopP(model: string): number | undefined {
 const config = getModelConfig(model)
 return config?.top_p
}

/** Returns top_k for a specific model */
export function getModelTopK(model: string): number | undefined {
 const config = getModelConfig(model)
 return config?.top_k
}
