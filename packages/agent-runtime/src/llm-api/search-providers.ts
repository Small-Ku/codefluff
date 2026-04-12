import { searchWeb } from './linkup-api'
import { getSearchProviders } from '@codebuff/common/config/codefluff-config'

import type { Logger } from '@codebuff/common/types/contracts/logger'

// ============================================================================
// Search Provider Interface — pluggable search for codefluff BYOK
// ============================================================================

export interface SearchProviderResult {
  result?: string
  error?: string
}

export interface SearchProvider {
  name: string
  search(params: {
    query: string
    depth: 'standard' | 'deep'
    logger: Logger
    fetch: typeof globalThis.fetch
  }): Promise<SearchProviderResult>
}

// ============================================================================
// Linkup Provider
// ============================================================================

function createLinkupProvider(apiKey: string): SearchProvider {
  return {
    name: 'linkup',
    async search({ query, depth, logger, fetch }) {
      const result = await searchWeb({
        query,
        depth,
        logger,
        fetch,
        serverEnv: { LINKUP_API_KEY: apiKey },
      })

      if (!result) {
        return { error: 'Linkup returned no results' }
      }

      return { result }
    },
  }
}

// ============================================================================
// LangSearch Provider
// API: POST https://api.langsearch.com/v1/web-search
// Response format: Bing Search API compatible
// ============================================================================

function createLangSearchProvider(apiKey: string): SearchProvider {
  return {
    name: 'langsearch',
    async search({ query, depth, logger, fetch }) {
      try {
        const response = await fetch(
          'https://api.langsearch.com/v1/web-search',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              query,
              count: depth === 'deep' ? 10 : 5,
              summary: true,
            }),
          },
        )

        if (!response.ok) {
          const body = await response.text().catch(() => '')
          return { error: `LangSearch API error ${response.status}: ${body}` }
        }

        const data = await response.json()

        // LangSearch wraps response in { data: { webPages: { value: [...] } } }
        const inner = data?.data ?? data
        const results = inner?.webPages?.value ?? inner?.results ?? []
        if (!Array.isArray(results) || results.length === 0) {
          return { error: 'LangSearch returned no results' }
        }

        const formatted = results
          .map(
            (
              r: {
                name?: string
                snippet?: string
                url?: string
                summary?: string
              },
              i: number,
            ) =>
              `[${i + 1}] ${r.name ?? 'Untitled'}\n${r.summary ?? r.snippet ?? ''}\nURL: ${r.url ?? ''}`,
          )
          .join('\n\n')

        return { result: formatted }
      } catch (error) {
        return {
          error: `LangSearch request failed: ${error instanceof Error ? error.message : String(error)}`,
        }
      }
    },
  }
}

// ============================================================================
// Ollama Provider
// API: POST https://ollama.com/api/web_search (cloud only)
// ============================================================================

const OLLAMA_API_URL = 'https://ollama.com/api/web_search'

function createOllamaProvider(apiKey: string): SearchProvider {
  return {
    name: 'ollama',
    async search({ query, depth, logger, fetch }) {
      try {
        const response = await fetch(OLLAMA_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(apiKey && { Authorization: `Bearer ${apiKey}` }),
          },
          body: JSON.stringify({
            query,
            max_results: depth === 'deep' ? 10 : 5,
          }),
        })

        if (!response.ok) {
          const body = await response.text().catch(() => '')
          return { error: `Ollama API error ${response.status}: ${body}` }
        }

        const data = await response.json()

        const results = data?.results ?? []
        if (!Array.isArray(results) || results.length === 0) {
          return { error: 'Ollama returned no results' }
        }

        const formatted = results
          .map(
            (
              r: {
                title?: string
                url?: string
                content?: string
                snippet?: string
              },
              i: number,
            ) =>
              `[${i + 1}] ${r.title ?? 'Untitled'}\n${r.content ?? r.snippet ?? ''}\nURL: ${r.url ?? ''}`,
          )
          .join('\n\n')

        return { result: formatted }
      } catch (error) {
        return {
          error: `Ollama request failed: ${error instanceof Error ? error.message : String(error)}`,
        }
      }
    },
  }
}

// ============================================================================
// SearXNG Instance Discovery
// Fetches healthy instances from searx.space and shuffles for load distribution
// ============================================================================

interface SearXInstanceEntry {
  http?: {
    status_code?: number
    error?: string | null
    grade?: string
  }
  timing?: {
    search?: {
      success_percentage?: number
    }
    initial?: {
      success_percentage?: number
    }
  }
  version?: string
  generator?: string
  tls?: object
}

// ============================================================================
// SearXNG Instance Cache — 5 minute TTL to avoid hammering searx.space
// ============================================================================

let _cachedHealthyInstances: string[] | null = null
let _cachedInstancesAt = 0
const INSTANCE_CACHE_TTL_MS = 5 * 60 * 1000

/**
 * Fetch the list of healthy SearXNG instances and shuffle them.
 * Returns instance URLs with no duplicates. Uses Fisher-Yates shuffle
 * to distribute load across the SearXNG network.
 * Results are cached for 5 minutes to avoid hammering the endpoint.
 */
async function fetchHealthySearXInstances(
  fetchFn: typeof globalThis.fetch,
): Promise<string[]> {
  const now = Date.now()
  if (
    _cachedHealthyInstances &&
    now - _cachedInstancesAt < INSTANCE_CACHE_TTL_MS
  ) {
    return _cachedHealthyInstances
  }

  try {
    const response = await fetchFn('https://searx.space/data/instances.json', {
      signal: AbortSignal.timeout(10_000),
    })

    if (!response.ok) return []

    const data = await response.json()
    const instances: Record<string, SearXInstanceEntry> = data?.instances ?? {}

    const healthy: string[] = []

    for (const [url, info] of Object.entries(instances)) {
      // Must have a 200 status and no errors
      if (info.http?.status_code !== 200) continue
      if (info.http?.error != null && info.http.error !== '') continue

      // Must have reasonable search success rate (>80%)
      const searchSuccess = info.timing?.search?.success_percentage
      if (searchSuccess != null && searchSuccess < 80) continue

      // Must be a valid SearX/SearXNG instance
      const isSearX = info.generator?.includes('searx')
      if (!isSearX && !info.version) continue

      healthy.push(url)
    }

    // Fisher-Yates shuffle to distribute load
    for (let i = healthy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[healthy[i], healthy[j]] = [healthy[j], healthy[i]]
    }

    _cachedHealthyInstances = healthy
    _cachedInstancesAt = now
    return healthy
  } catch {
    return _cachedHealthyInstances ?? []
  }
}

// ============================================================================
// SearXNG helpers — shared by SearXNG and SearX-Space providers
// ============================================================================

function formatSearXNGResults(
  results: Array<{
    title?: string
    url?: string
    content?: string
    snippet?: string
    engine?: string
  }>,
): string {
  return results
    .map(
      (
        r: {
          title?: string
          url?: string
          content?: string
          snippet?: string
          engine?: string
        },
        i: number,
      ) =>
        `[${i + 1}] ${r.title ?? 'Untitled'} (${r.engine ?? 'unknown'})\n${r.content ?? r.snippet ?? ''}\nURL: ${r.url ?? ''}`,
    )
    .join('\n\n')
}

async function searchSearXNGInstance(
  baseUrl: string,
  query: string,
  depth: 'standard' | 'deep',
  fetch: typeof globalThis.fetch,
): Promise<{ result?: string; error?: string }> {
  try {
    const params = new URLSearchParams({
      q: query,
      format: 'json',
      categories: 'general',
    })

    if (depth === 'deep') {
      params.set('pageno', '2')
    }

    const url = `${baseUrl}/search?${params.toString()}`
    const response = await fetch(url, { signal: AbortSignal.timeout(15_000) })

    if (!response.ok) {
      const body = await response.text().catch(() => '')
      return { error: `${baseUrl}: SearXNG error ${response.status}` }
    }

    const data = await response.json()
    const results: Array<{
      title?: string
      url?: string
      content?: string
      snippet?: string
      engine?: string
    }> = data?.results ?? []

    if (!Array.isArray(results) || results.length === 0) {
      return { error: `${baseUrl}: no results` }
    }

    return { result: formatSearXNGResults(results) }
  } catch (error) {
    return {
      error: `${baseUrl}: ${error instanceof Error ? error.message : 'request failed'}`,
    }
  }
}

// ============================================================================
// SearXNG Provider — user-specified instance URL
// ============================================================================

function createSearXNGProvider(instanceUrl: string): SearchProvider {
  const normalizedUrl = instanceUrl.match(/^https?:\/\//)
    ? instanceUrl
    : `https://${instanceUrl}`
  const baseUrl = normalizedUrl.replace(/\/+$/, '')
  return {
    name: 'searxng',
    async search({ query, depth, logger, fetch }) {
      return searchSearXNGInstance(baseUrl, query, depth, fetch)
    },
  }
}

// ============================================================================
// SearX-Space Provider — auto-discovers healthy instances from searx.space
// The value in config is ignored; presence of the key enables it
// ============================================================================

const MAX_SEARX_SPACE_ATTEMPTS = 10

function createSearXSpaceProvider(): SearchProvider {
  return {
    name: 'searx-space',
    async search({ query, depth, logger, fetch }) {
      const instances = await fetchHealthySearXInstances(fetch)
      if (instances.length === 0) {
        return {
          error:
            'SearX-Space: unable to fetch healthy instances from searx.space',
        }
      }

      const maxAttempts = Math.min(instances.length, MAX_SEARX_SPACE_ATTEMPTS)
      const errors: string[] = []
      for (let i = 0; i < maxAttempts; i++) {
        const instanceUrl = instances[i]
        const result = await searchSearXNGInstance(
          instanceUrl,
          query,
          depth,
          fetch,
        )
        if (result.result) return result
        errors.push(result.error!)
      }

      return {
        error: `SearX-Space: all ${maxAttempts}/${instances.length} attempted instances failed\n${errors.slice(0, 5).join('\n')}`,
      }
    },
  }
}

// ============================================================================
// Provider Factory — creates a provider by name
// ============================================================================

const KNOWN_PROVIDER_KEYS = [
  'linkup',
  'langsearch',
  'ollama',
  'searxng',
  'searx-space',
] as const

function tryCreateProvider(
  name: string,
  keyValue: string,
): SearchProvider | null {
  const normalizedName = name.toLowerCase()

  if (normalizedName === 'linkup') {
    return createLinkupProvider(keyValue)
  }

  if (normalizedName === 'langsearch') {
    return createLangSearchProvider(keyValue)
  }

  if (normalizedName === 'ollama') {
    return createOllamaProvider(keyValue)
  }

  if (normalizedName === 'searxng') {
    return createSearXNGProvider(keyValue)
  }

  if (normalizedName === 'searx-space') {
    return createSearXSpaceProvider()
  }

  return null
}

// ============================================================================
// Codefluff Resolver — returns all configured providers for fallback chain
// ============================================================================

/**
 * Get all configured search providers in config order.
 * Used by the web-search handler to implement fallback chain.
 */
export function getConfiguredSearchProviders(): SearchProvider[] {
  const providersConfig = getSearchProviders()

  // Order: known providers first (in defined order), then any custom ones
  const order: string[] = [
    ...KNOWN_PROVIDER_KEYS.filter((k) => providersConfig[k]),
  ]
  for (const key of Object.keys(providersConfig)) {
    if (!order.includes(key)) {
      order.push(key)
    }
  }

  const providers: SearchProvider[] = []
  for (const name of order) {
    const keyValue = providersConfig[name]
    if (!keyValue) continue

    const provider = tryCreateProvider(name, keyValue)
    if (provider) {
      providers.push(provider)
    }
  }

  return providers
}
