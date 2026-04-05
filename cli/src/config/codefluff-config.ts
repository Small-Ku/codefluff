import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import z from 'zod/v4'

const costModeSchema = z.enum(['free', 'normal', 'max', 'experimental', 'ask'])
const operationSchema = z.enum(['agent', 'file-requests', 'check-new-files'])

const modeMappingSchema = z.object({
  agent: z.string().min(1),
  'file-requests': z.string().min(1),
  'check-new-files': z.string().min(1),
})

const providerKeySchema = z.union([
  z.string().min(1),
  z.object({
    key: z.string().min(1),
    baseURL: z.string().min(1).optional(),
    style: z.enum(['openai', 'anthropic', 'google']).optional(),
  }),
])

const codefluffConfigSchema = z.object({
  keys: z.record(z.string(), providerKeySchema).optional(),
  mapping: z
    .record(
      z.string(),
      z.object({
        agent: z.string().min(1).optional(),
        'file-requests': z.string().min(1).optional(),
        'check-new-files': z.string().min(1).optional(),
      }),
    )
    .optional(),
  defaultMode: z.string().optional(),
  searchProviders: z.record(z.string(), z.string().min(1)).optional(),
})

export type CodefluffConfig = z.infer<typeof codefluffConfigSchema>
export type CostMode = 'free' | 'normal' | 'max' | 'experimental' | 'ask'
export type Operation = 'agent' | 'file-requests' | 'check-new-files'

export type ProviderKeyConfig =
  | string
  | { key: string; baseURL?: string; style?: 'openai' | 'anthropic' | 'google' }

function interpolateEnvVars(value: string): string {
  return value.replace(/\$\{([^}]+)\}/g, (_, envVar) => {
    const envValue = process.env[envVar]
    if (!envValue) {
      throw new Error(
        `Environment variable ${envVar} is referenced in config but not set`,
      )
    }
    return envValue
  })
}

function interpolateConfigKeys(
  obj: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      result[key] = interpolateEnvVars(value)
    } else if (typeof value === 'object' && value !== null && 'key' in value) {
      const providerConfig = value as Record<string, unknown>
      const interpolated: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(providerConfig)) {
        if (typeof v === 'string') {
          interpolated[k] = interpolateEnvVars(v)
        } else {
          interpolated[k] = v
        }
      }
      result[key] = interpolated
    } else {
      result[key] = value
    }
  }
  return result
}

function getConfigPath(): string {
  const homeDir = process.env.HOME ?? process.env.USERPROFILE ?? ''
  if (!homeDir) {
    throw new Error('Cannot determine home directory for codefluff config')
  }
  return join(homeDir, '.config', 'codefluff', 'config.json')
}

export function loadCodefluffConfig(): CodefluffConfig {
  const configPath = getConfigPath()

  if (!existsSync(configPath)) {
    return {}
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
    }

    const result = codefluffConfigSchema.parse(interpolated)
    return result
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(
        `Invalid codefluff config at ${configPath}:\n${error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n')}`,
      )
    }
    throw new Error(
      `Failed to parse codefluff config at ${configPath}: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

export function getConfiguredKeys(): Record<string, ProviderKeyConfig> {
  const config = loadCodefluffConfig()
  return (config.keys ?? {}) as Record<string, ProviderKeyConfig>
}

export function getDefaultMode(): CostMode {
  const config = loadCodefluffConfig()
  const mode = config.defaultMode ?? 'normal'
  const validModes: CostMode[] = [
    'free',
    'normal',
    'max',
    'experimental',
    'ask',
  ]
  return validModes.includes(mode as CostMode) ? (mode as CostMode) : 'normal'
}

export function getConfiguredSearchProviders(): Record<string, string> {
  const config = loadCodefluffConfig()
  return config.searchProviders ?? {}
}
