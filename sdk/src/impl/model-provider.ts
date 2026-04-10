/**
 * Model provider abstraction for routing requests to the appropriate LLM provider.
 *
 * This module handles:
 * - Claude OAuth: Direct requests to Anthropic API using user's OAuth token
 * - ChatGPT OAuth: Direct requests to OpenAI API using user's OAuth token
 * - Default: Requests through Codebuff backend (which routes to OpenRouter)
 */

import path from 'path'
import fs from 'fs'

import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'
import {
  loadCodefluffConfig,
  getModelConfig,
} from '@codebuff/common/config/codefluff-config'
import { BYOK_OPENROUTER_HEADER } from '@codebuff/common/constants/byok'
import { isFreeMode } from '@codebuff/common/constants/free-agents'
import {
  CHATGPT_BACKEND_BASE_URL,
  CHATGPT_OAUTH_ENABLED,
  isChatGptOAuthModelAllowed,
  isOpenAIProviderModel,
  toOpenAIModelId,
} from '@codebuff/common/constants/chatgpt-oauth'
import {
  CLAUDE_CODE_SYSTEM_PROMPT_PREFIX,
  CLAUDE_OAUTH_BETA_HEADERS,
  CLAUDE_OAUTH_ENABLED,
  isClaudeModel,
  toAnthropicModelId,
} from '@codebuff/common/constants/claude-oauth'
import {
  OpenAICompatibleChatLanguageModel,
  VERSION,
} from '@codebuff/internal/openai-compatible/index'
import { createOpenAICompatible } from '@codebuff/internal/openai-compatible/openai-compatible-provider'

import { getWebsiteUrl } from '../constants'
import {
  getValidChatGptOAuthCredentials,
  getValidClaudeOAuthCredentials,
} from '../credentials'
import { isCodefluffMode } from './codefluff'
import {
  getByokOpenrouterApiKeyFromEnv,
  getCodefluffByokKeysFromEnv,
  getCodefluffModelResolutionDebugFilePathFromEnv,
  isCodefluffModelResolutionDebugEnabledFromEnv,
} from '../env'
import {
  createChatGptBackendFetch,
  extractChatGptAccountId,
} from './chatgpt-backend-fetch'

import type { LanguageModel } from 'ai'

// ============================================================================
// Claude OAuth Rate Limit Cache
// ============================================================================

/** Timestamp (ms) when Claude OAuth rate limit expires, or null if not rate-limited */
let claudeOAuthRateLimitedUntil: number | null = null

/**
 * Mark Claude OAuth as rate-limited. Subsequent requests will skip Claude OAuth
 * and use Codebuff backend until the reset time.
 * @param resetAt - When the rate limit resets. If not provided, guesses 5 minutes from now.
 */
export function markClaudeOAuthRateLimited(resetAt?: Date): void {
  const fiveMinutesFromNow = Date.now() + 5 * 60 * 1000
  claudeOAuthRateLimitedUntil = resetAt ? resetAt.getTime() : fiveMinutesFromNow
}

/**
 * Check if Claude OAuth is currently rate-limited.
 * Returns true if rate-limited and reset time hasn't passed.
 */
export function isClaudeOAuthRateLimited(): boolean {
  if (claudeOAuthRateLimitedUntil === null) {
    return false
  }
  if (Date.now() >= claudeOAuthRateLimitedUntil) {
    // Rate limit expired, clear the cache
    claudeOAuthRateLimitedUntil = null
    return false
  }
  return true
}

/**
 * Reset the Claude OAuth rate limit cache.
 * Call this when user reconnects their Claude subscription.
 */
export function resetClaudeOAuthRateLimit(): void {
  claudeOAuthRateLimitedUntil = null
}

// ============================================================================
// ChatGPT OAuth Rate Limit Cache
// ============================================================================

/** Timestamp (ms) when ChatGPT OAuth rate limit expires, or null if not rate-limited */
let chatGptOAuthRateLimitedUntil: number | null = null

/**
 * Mark ChatGPT OAuth as rate-limited. Subsequent requests will skip direct ChatGPT OAuth
 * and use Codebuff backend until the reset time.
 */
export function markChatGptOAuthRateLimited(resetAt?: Date): void {
  const fiveMinutesFromNow = Date.now() + 5 * 60 * 1000
  chatGptOAuthRateLimitedUntil = resetAt
    ? resetAt.getTime()
    : fiveMinutesFromNow
}

/**
 * Check if ChatGPT OAuth is currently rate-limited.
 */
export function isChatGptOAuthRateLimited(): boolean {
  if (chatGptOAuthRateLimitedUntil === null) {
    return false
  }
  if (Date.now() >= chatGptOAuthRateLimitedUntil) {
    chatGptOAuthRateLimitedUntil = null
    return false
  }
  return true
}

/**
 * Reset the ChatGPT OAuth rate-limit cache.
 * Call this when user reconnects their ChatGPT subscription.
 */
export function resetChatGptOAuthRateLimit(): void {
  chatGptOAuthRateLimitedUntil = null
}

// ============================================================================
// Claude OAuth Quota Fetching
// ============================================================================

interface ClaudeQuotaWindow {
  utilization: number
  resets_at: string | null
}

interface ClaudeQuotaResponse {
  five_hour: ClaudeQuotaWindow | null
  seven_day: ClaudeQuotaWindow | null
  seven_day_oauth_apps: ClaudeQuotaWindow | null
  seven_day_opus: ClaudeQuotaWindow | null
}

/**
 * Fetch the rate limit reset time from Anthropic's quota API.
 * Returns the earliest reset time (whichever limit is more restrictive).
 * Returns null if fetch fails or no reset time is available.
 */
export async function fetchClaudeOAuthResetTime(
  accessToken: string,
): Promise<Date | null> {
  try {
    const response = await fetch('https://api.anthropic.com/api/oauth/usage', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'oauth-2025-04-20,claude-code-20250219',
      },
    })

    if (!response.ok) {
      return null
    }

    const responseBody = await response.json()
    const data = responseBody as ClaudeQuotaResponse

    // Parse reset times
    const fiveHour = data.five_hour
    const sevenDay = data.seven_day

    const fiveHourRemaining = fiveHour
      ? Math.max(0, 100 - fiveHour.utilization)
      : 100
    const sevenDayRemaining = sevenDay
      ? Math.max(0, 100 - sevenDay.utilization)
      : 100

    // Return the reset time for whichever limit is more restrictive (lower remaining)
    if (fiveHourRemaining <= sevenDayRemaining && fiveHour?.resets_at) {
      return new Date(fiveHour.resets_at)
    } else if (sevenDay?.resets_at) {
      return new Date(sevenDay.resets_at)
    }

    return null
  } catch {
    return null
  }
}

/**
 * Parameters for requesting a model.
 */
export interface ModelRequestParams {
  /** Codebuff API key for backend authentication */
  apiKey: string
  /** Model ID (OpenRouter format, e.g., "anthropic/claude-sonnet-4") */
  model: string
  /** If true, skip Claude OAuth and use Codebuff backend (for fallback after rate limit) */
  skipClaudeOAuth?: boolean
  /** If true, skip ChatGPT OAuth and use Codebuff backend (for fallback after rate limit) */
  skipChatGptOAuth?: boolean
  /** Cost mode (e.g. 'free') — affects fallback behavior for OAuth routes */
  costMode?: string
  /**
   * Explicit, stable mapping key used to look up per-agent model overrides in Codefluff.
   * This should be the agent template id (e.g. "basher", "file-picker", "editor-multi-prompt").
   */
  agentMappingKey?: string
  /**
   * Legacy identifier, often a runtime/run id. Kept for backwards compatibility.
   * Prefer agentMappingKey for mapping lookups.
   */
  agentId?: string
}

/**
 * Result from getModelForRequest.
 */
export interface ModelResult {
  /** The language model to use for requests */
  model: LanguageModel
  /** Whether this model uses Claude OAuth direct (affects cost tracking) */
  isClaudeOAuth: boolean
  /** Whether this model uses ChatGPT OAuth direct (affects cost tracking) */
  isChatGptOAuth: boolean
}

// Usage accounting type for OpenRouter/Codebuff backend responses
type OpenRouterUsageAccounting = {
  cost: number | null
  costDetails: {
    upstreamInferenceCost: number | null
  }
}

/**
 * Get the appropriate model for a request.
 *
 * If Claude OAuth credentials are available and the model is a Claude model,
 * returns an Anthropic direct model. Otherwise, returns the Codebuff backend model.
 *
 * This function is async because it may need to refresh the OAuth token.
 */
export async function getModelForRequest(
  params: ModelRequestParams,
): Promise<ModelResult> {
  const { apiKey, model, skipClaudeOAuth, skipChatGptOAuth, costMode } = params

  const costModeResolved = costMode ?? 'normal'
  const debugEnabled = isCodefluffModelResolutionDebugEnabled()

  if (!isCodefluffMode()) {
    if (debugEnabled) {
      logCodefluffModelResolution({
        ts: new Date().toISOString(),
        codefluffMode: false,
        costMode: costModeResolved,
        agentId: params.agentId ?? null,
        agentMappingKey: params.agentMappingKey ?? null,
        requestedModel: model,
        resolvedModel: null,
        mappingDecision: 'not-codefluff-mode',
        requestedProvider: getProviderName(model),
        resolvedProvider: null,
        providerConfig: null,
        note: 'CODEFLUFF_MODE is not "true". Codefluff mapping is skipped.',
      })
    }

    // Non-codefluff routes (Claude OAuth, ChatGPT OAuth, Codebuff backend)...
  } else {
    const mappingKey = params.agentMappingKey ?? params.agentId
    const resolutionDebug = resolveCodefluffModelDebug(
      costModeResolved,
      mappingKey,
    )
    const resolvedModel = resolutionDebug.resolvedModel ?? model

    if (debugEnabled) {
      const requestedProvider = getProviderName(model)
      const resolvedProvider = getProviderName(resolvedModel)
      const providerDebug = getCodefluffProviderConfigDebug(resolvedModel)

      logCodefluffModelResolution({
        ts: new Date().toISOString(),
        codefluffMode: true,
        costMode: costModeResolved,
        agentId: params.agentId ?? null,
        agentMappingKey: params.agentMappingKey ?? null,
        requestedModel: model,
        resolvedModel,
        mappingDecision: resolutionDebug.decision,
        requestedProvider,
        resolvedProvider,
        providerConfig: providerDebug,
        note: null,
      })
    }

    return {
      model: createCodefluffDirectModel(resolvedModel),
      isClaudeOAuth: false,
      isChatGptOAuth: false,
    }
  }

  // Check if we should use Claude OAuth direct
  // Skip if feature disabled, explicitly requested, if rate-limited, or if not a Claude model
  if (
    CLAUDE_OAUTH_ENABLED &&
    !skipClaudeOAuth &&
    !isClaudeOAuthRateLimited() &&
    isClaudeModel(model)
  ) {
    // Get valid credentials (will refresh if needed)
    const claudeOAuthCredentials = await getValidClaudeOAuthCredentials()
    if (claudeOAuthCredentials) {
      return {
        model: createAnthropicOAuthModel(
          model,
          claudeOAuthCredentials.accessToken,
        ),
        isClaudeOAuth: true,
        isChatGptOAuth: false,
      }
    }
  }

  // Check if we should use ChatGPT OAuth direct
  // Only attempt for allowlisted models; non-allowlisted models silently fall through to backend.
  if (
    CHATGPT_OAUTH_ENABLED &&
    !skipChatGptOAuth &&
    isOpenAIProviderModel(model) &&
    isChatGptOAuthModelAllowed(model)
  ) {
    // In free mode, rate-limited ChatGPT OAuth must not silently fall through to
    // the Codebuff backend — freebuff should only use the direct OpenAI route or fail.
    if (isChatGptOAuthRateLimited()) {
      if (isFreeMode(costMode)) {
        throw new Error(
          'ChatGPT rate limit reached. Please wait a few minutes and try again.',
        )
      }
    } else {
      const chatGptOAuthCredentials = await getValidChatGptOAuthCredentials()

      if (chatGptOAuthCredentials) {
        return {
          model: createOpenAIOAuthModel(
            model,
            chatGptOAuthCredentials.accessToken,
          ),
          isClaudeOAuth: false,
          isChatGptOAuth: true,
        }
      }

      // In free mode, if credentials are unavailable, don't fall through to backend.
      if (isFreeMode(costMode)) {
        throw new Error(
          'ChatGPT OAuth credentials unavailable. Please reconnect with /connect:chatgpt.',
        )
      }
    }
  }

  // Default: use Codebuff backend
  return {
    model: createCodebuffBackendModel(apiKey, model),
    isClaudeOAuth: false,
    isChatGptOAuth: false,
  }
}

/**
 * Create an OpenAI model that routes through the ChatGPT backend API (Codex endpoint).
 * Uses a custom fetch that transforms between Chat Completions and Responses API formats.
 */
function createOpenAIOAuthModel(
  model: string,
  oauthToken: string,
): LanguageModel {
  const openAIModelId = toOpenAIModelId(model)
  const accountId = extractChatGptAccountId(oauthToken)

  return new OpenAICompatibleChatLanguageModel(openAIModelId, {
    provider: 'openai',
    url: () => `${CHATGPT_BACKEND_BASE_URL}/codex/responses`,
    headers: () => ({
      Authorization: `Bearer ${oauthToken}`,
      'Content-Type': 'application/json',
      'OpenAI-Beta': 'responses=experimental',
      originator: 'codex_cli_rs',
      accept: 'text/event-stream',
      'user-agent': `ai-sdk/openai-compatible/${VERSION}/codebuff-chatgpt-oauth`,
      ...(accountId ? { 'chatgpt-account-id': accountId } : {}),
    }),
    fetch: createChatGptBackendFetch(),
    supportsStructuredOutputs: true,
    includeUsage: undefined,
  })
}

/**
 * Create an Anthropic model that uses OAuth Bearer token authentication.
 */
function createAnthropicOAuthModel(
  model: string,
  oauthToken: string,
): LanguageModel {
  // Convert OpenRouter model ID to Anthropic model ID
  const anthropicModelId = toAnthropicModelId(model)

  // Create Anthropic provider with custom fetch to use Bearer token auth
  // Custom fetch to handle OAuth Bearer token authentication and system prompt transformation
  const customFetch = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const headers = new Headers(init?.headers)

    // Remove the x-api-key header that the SDK adds
    headers.delete('x-api-key')

    // Add Bearer token authentication (for OAuth)
    headers.set('Authorization', `Bearer ${oauthToken}`)

    // Add required beta headers for OAuth (same as opencode)
    // These beta headers are required to access Claude 4+ models with OAuth
    const existingBeta = headers.get('anthropic-beta') ?? ''
    const betaList = existingBeta
      .split(',')
      .map((b) => b.trim())
      .filter(Boolean)
    const mergedBetas = [
      ...new Set([...CLAUDE_OAUTH_BETA_HEADERS, ...betaList]),
    ].join(',')
    headers.set('anthropic-beta', mergedBetas)

    // Transform the request body to use the correct system prompt format for Claude OAuth
    // Anthropic requires the system prompt to be split into two separate blocks:
    // 1. First block: Claude Code identifier (required for OAuth access)
    // 2. Second block: The actual system prompt (if any)
    let modifiedInit = init
    if (init?.body && typeof init.body === 'string') {
      try {
        const body = JSON.parse(init.body)
        // Always inject the Claude Code identifier for OAuth requests
        // Extract existing system prompt if present
        const existingSystem = body.system
          ? Array.isArray(body.system)
            ? body.system
                .map(
                  (s: { text?: string; content?: string }) =>
                    s.text ?? s.content ?? '',
                )
                .join('\n\n')
            : typeof body.system === 'string'
              ? body.system
              : ''
          : ''

        // Build the system array with Claude Code identifier first
        body.system = [
          {
            type: 'text',
            text: CLAUDE_CODE_SYSTEM_PROMPT_PREFIX,
          },
          // Only add second block if there's actual content
          ...(existingSystem
            ? [
                {
                  type: 'text',
                  text: existingSystem,
                },
              ]
            : []),
        ]
        modifiedInit = { ...init, body: JSON.stringify(body) }
      } catch {
        // If parsing fails, continue with original body
      }
    }

    return globalThis.fetch(input, {
      ...modifiedInit,
      headers,
    })
  }

  // Pass empty apiKey like opencode does - this prevents the SDK from adding x-api-key header
  // The custom fetch will add the Bearer token instead
  const anthropic = createAnthropic({
    apiKey: '',
    fetch: customFetch as unknown as typeof globalThis.fetch,
  })

  // NOTE: The AI SDK has two independent copies of the LanguageModel type —
  // one bundled inside the SDK build, one from the consumer's own ai package.
  // Even at the same semantic version, the compiled .d.ts types don't structurally match.
  // The `as unknown as LanguageModel` double-cast is the standard workaround.
  return anthropic(anthropicModelId) as unknown as LanguageModel
}

/**
 * Create a model that routes through the Codebuff backend.
 * This is the existing behavior - requests go to Codebuff backend which forwards to OpenRouter.
 */
function createCodebuffBackendModel(
  apiKey: string,
  model: string,
): LanguageModel {
  const openrouterUsage: OpenRouterUsageAccounting = {
    cost: null,
    costDetails: {
      upstreamInferenceCost: null,
    },
  }

  const openrouterApiKey = getByokOpenrouterApiKeyFromEnv()

  return new OpenAICompatibleChatLanguageModel(model, {
    provider: 'codebuff',
    url: ({ path: endpoint }) =>
      new URL(path.join('/api/v1', endpoint), getWebsiteUrl()).toString(),
    headers: () => ({
      Authorization: `Bearer ${apiKey}`,
      'user-agent': `ai-sdk/openai-compatible/${VERSION}/codebuff`,
      ...(openrouterApiKey && { [BYOK_OPENROUTER_HEADER]: openrouterApiKey }),
    }),
    metadataExtractor: {
      extractMetadata: async ({ parsedBody }: { parsedBody: any }) => {
        if (openrouterApiKey !== undefined) {
          return { codebuff: { usage: openrouterUsage } }
        }

        if (typeof parsedBody?.usage?.cost === 'number') {
          openrouterUsage.cost = parsedBody.usage.cost
        }
        if (
          typeof parsedBody?.usage?.cost_details?.upstream_inference_cost ===
          'number'
        ) {
          openrouterUsage.costDetails.upstreamInferenceCost =
            parsedBody.usage.cost_details.upstream_inference_cost
        }
        return { codebuff: { usage: openrouterUsage } }
      },
      createStreamExtractor: () => ({
        processChunk: (parsedChunk: any) => {
          if (openrouterApiKey !== undefined) {
            return
          }

          if (typeof parsedChunk?.usage?.cost === 'number') {
            openrouterUsage.cost = parsedChunk.usage.cost
          }
          if (
            typeof parsedChunk?.usage?.cost_details?.upstream_inference_cost ===
            'number'
          ) {
            openrouterUsage.costDetails.upstreamInferenceCost =
              parsedChunk.usage.cost_details.upstream_inference_cost
          }
        },
        buildMetadata: () => {
          return { codebuff: { usage: openrouterUsage } }
        },
      }),
    },
    fetch: undefined,
    includeUsage: undefined,
    supportsStructuredOutputs: true,
  })
}

// ============================================================================
// Codefluff BYOK Direct Provider Routing
// ============================================================================

type ProviderConfig = {
  key: string
  baseURL?: string
  style?: 'openai' | 'anthropic' | 'google'
  headers?: Record<string, string>
}

function getProviderName(model: string): string {
  const slashIdx = model.indexOf('/')
  if (slashIdx === -1) return model
  return model.substring(0, slashIdx)
}

function getModelId(model: string): string {
  const slashIdx = model.indexOf('/')
  if (slashIdx === -1) return model
  return model.substring(slashIdx + 1)
}

function getCodefluffProviderConfig(model: string): ProviderConfig | undefined {
  const envKeys = getCodefluffByokKeysFromEnv()
  if (envKeys) {
    const providerName = getProviderName(model)
    if (providerName === 'anthropic' && envKeys.anthropic)
      return { key: envKeys.anthropic, style: 'anthropic' }
    if (providerName === 'openai' && envKeys.openai)
      return { key: envKeys.openai, style: 'openai' }
    if (providerName === 'google' && envKeys.google)
      return { key: envKeys.google, style: 'google' }
    // For other providers from env, check if they have a known baseURL
    const key = envKeys[providerName] ?? envKeys.openrouter
    if (key) {
      const baseURL = PROVIDER_BASE_URLS[providerName]
      return {
        key,
        style: 'openai',
        ...(baseURL && { baseURL }),
      }
    }
    return undefined
  }

  // Use shared config loader from common (Zod-validated with env-var interpolation)
  const config = loadCodefluffConfig()
  const keys = config.keys ?? {}
  const providerName = getProviderName(model)
  const providerValue = keys[providerName]

  if (!providerValue) return undefined

  // String key (simple format)
  if (typeof providerValue === 'string') {
    // Check if this is a known provider that needs a specific baseURL
    const baseURL = PROVIDER_BASE_URLS[providerName]

    if (providerName === 'anthropic') {
      return { key: providerValue, style: 'anthropic' }
    }
    if (providerName === 'openai') {
      return { key: providerValue, style: 'openai' }
    }
    if (providerName === 'google') {
      return { key: providerValue, style: 'google' }
    }
    // For new providers (deepseek, xai, nvidia, etc.), include the baseURL
    return {
      key: providerValue,
      style: 'openai',
      ...(baseURL && { baseURL }),
    } as ProviderConfig
  }

  // Object config (custom provider)
  if (typeof providerValue === 'object' && providerValue !== null) {
    return {
      key: (providerValue as { key?: string }).key ?? '',
      baseURL: (providerValue as { baseURL?: string }).baseURL,
      style: ((providerValue as { style?: string }).style ?? 'openai') as
        | 'openai'
        | 'anthropic'
        | 'google',
      headers: (providerValue as { headers?: Record<string, string> }).headers,
    }
  }

  return undefined
}

// Default base URLs for providers
const PROVIDER_BASE_URLS: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  deepseek: 'https://api.deepseek.com/v1',
  xai: 'https://api.x.ai/v1',
  'nvidia-nim': 'https://integrate.api.nvidia.com/v1',
  openrouter: 'https://openrouter.ai/api/v1',
}

function createCodefluffDirectModel(model: string): LanguageModel {
  const providerConfig = getCodefluffProviderConfig(model)
  const modelId = getModelId(model)

  if (!providerConfig || !providerConfig.key) {
    const providerName = getProviderName(model)
    throw new Error(
      `No API key configured for provider "${providerName}" (model: "${model}"). ` +
        `Add "${providerName}" to the "keys" section of ~/.config/codefluff/config.json.`,
    )
  }

 const { key: apiKey, baseURL, style = 'openai', headers } = providerConfig
 const providerName = getProviderName(model)

 // Get model-specific configuration (extraBody, max_tokens)
 // Note: temperature, top_p, top_k are handled in llm.ts via providerOptions for all providers
 const modelConfig = getModelConfig(model)
 const extraBody = modelConfig?.extraBody
 const maxTokens = modelConfig?.max_tokens

 // Merge max_tokens into extraBody if configured
 // This ensures providers like Nvidia NIM get the correct max_tokens in the request
 const mergedExtraBody = maxTokens
 ? { ...extraBody, max_tokens: maxTokens }
 : extraBody

 if (style === 'anthropic') {
 const anthropicModelId = baseURL ? modelId : toAnthropicModelId(model)
 const anthropic = createAnthropic({
 apiKey,
 ...(baseURL ? { baseURL } : {}),
 })
 // Note: Anthropic SDK doesn't support passing temperature/topP/topK at model creation time.
 // These settings are passed at request time via the model's second argument in streamText/generateText.
 // For BYOK mode, we store these in modelConfig and apply them in llm.ts providerOptions.
 return anthropic(anthropicModelId) as unknown as LanguageModel
 }

 if (style === 'google') {
 const google = createGoogleGenerativeAI({
 apiKey,
 ...(baseURL ? { baseURL } : {}),
 })
 // Note: Google SDK doesn't support passing temperature/topP/topK at model creation time.
 // These settings are passed at request time via the model's second argument in streamText/generateText.
 // For BYOK mode, we store these in modelConfig and apply them in llm.ts providerOptions.
 return google(modelId) as unknown as LanguageModel
 }

  // OpenAI-compatible style (works for OpenAI-compatible providers, OpenRouter, StepFun, DeepSeek, etc.)
  if (providerName === 'openai') {
    const openai = createOpenAI({
      apiKey,
      ...(baseURL ? { baseURL } : {}),
      ...(headers ? { defaultHeaders: headers } : {}),
      ...(mergedExtraBody ? { extraBody: mergedExtraBody } : {}),
    })
    return openai(modelId) as unknown as LanguageModel
  }

  // Handle new providers: deepseek, xai, nvidia-nim, new-api, etc.
  // They all use OpenAI-compatible APIs
  if (['deepseek', 'xai', 'nvidia-nim', 'new-api'].includes(providerName)) {
    const resolvedBaseURL =
      baseURL || PROVIDER_BASE_URLS[providerName] || 'https://api.openai.com/v1'

    // Use custom OpenAICompatible provider for better control
    if (
      providerName === 'nvidia-nim' ||
      providerName === 'new-api' ||
      baseURL
    ) {
      const customProvider = createOpenAICompatible({
        baseURL: resolvedBaseURL,
        name: providerName,
        apiKey,
        headers: headers,
        extraBody: mergedExtraBody,
      })
      return customProvider.chatModel(modelId) as unknown as LanguageModel
    }

    const openai = createOpenAI({
      apiKey,
      baseURL: resolvedBaseURL,
      ...(headers ? { defaultHeaders: headers } : {}),
      ...(mergedExtraBody ? { extraBody: mergedExtraBody } : {}),
    })
    return openai(modelId) as unknown as LanguageModel
  }

  // Handle custom providers with a configured baseURL (e.g., maoleio, etc.)
  if (baseURL) {
    const openai = createOpenAI({
      apiKey,
      baseURL,
      ...(headers ? { defaultHeaders: headers } : {}),
      ...(mergedExtraBody ? { extraBody: mergedExtraBody } : {}),
    })
    return openai(modelId) as unknown as LanguageModel
  }

  // Default: OpenRouter-compatible
  const openrouterUsage: OpenRouterUsageAccounting = {
    cost: null,
    costDetails: {
      upstreamInferenceCost: null,
    },
  }

  return new OpenAICompatibleChatLanguageModel(model, {
    provider: providerName,
    url: () => 'https://openrouter.ai/api/v1/chat/completions',
    headers: () => ({
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://codebuff.com',
      'X-Title': 'Codefluff',
      'user-agent': `ai-sdk/openai-compatible/${VERSION}/codefluff`,
    }),
    metadataExtractor: {
      extractMetadata: async ({ parsedBody }: { parsedBody: any }) => {
        if (typeof parsedBody?.usage?.cost === 'number') {
          openrouterUsage.cost = parsedBody.usage.cost
        }
        if (
          typeof parsedBody?.usage?.cost_details?.upstream_inference_cost ===
          'number'
        ) {
          openrouterUsage.costDetails.upstreamInferenceCost =
            parsedBody.usage.cost_details.upstream_inference_cost
        }
        return { codebuff: { usage: openrouterUsage } }
      },
      createStreamExtractor: () => ({
        processChunk: (parsedChunk: any) => {
          if (typeof parsedChunk?.usage?.cost === 'number') {
            openrouterUsage.cost = parsedChunk.usage.cost
          }
          if (
            typeof parsedChunk?.usage?.cost_details?.upstream_inference_cost ===
            'number'
          ) {
            openrouterUsage.costDetails.upstreamInferenceCost =
              parsedChunk.usage.cost_details.upstream_inference_cost
          }
        },
        buildMetadata: () => {
          return { codebuff: { usage: openrouterUsage } }
        },
      }),
    },
    fetch: undefined,
    includeUsage: undefined,
    supportsStructuredOutputs: true,
  })
}

export { isCodefluffMode } from './codefluff'
export { resetCodefluffConfigCache } from '@codebuff/common/config/codefluff-config'

/**
 * SDK model resolver - returns null on missing configuration.
 *
 * Returns null to allow graceful fallback to passed model in getModelForRequest.
 * Checks for agent-specific mapping first, then falls back to 'base'.
 *
 * @param costMode - The cost mode (free, normal, max, experimental, ask)
 * @param agentId - The agent ID to look up (optional)
 * @returns The model string, or null if not configured
 *
 * @note This differs from CLI's resolveModelForMode which throws errors.
 * The SDK returns null so getModelForRequest can fall back to the agent's hardcoded model.
 */
export function resolveCodefluffModel(
  costMode: string,
  agentId?: string,
): string | null {
  return resolveCodefluffModelDebug(costMode, agentId).resolvedModel
}

type CodefluffModelResolutionDecision =
  | 'not-codefluff-mode'
  | 'no-mode-mapping'
  | 'agent-specific'
  | 'base'
  | 'no-base'

export type CodefluffModelResolutionDebug = {
  resolvedModel: string | null
  decision: CodefluffModelResolutionDecision
}

export function resolveCodefluffModelDebug(
  costMode: string,
  agentId?: string,
): CodefluffModelResolutionDebug {
  if (!isCodefluffMode()) {
    return { resolvedModel: null, decision: 'not-codefluff-mode' }
  }

  const config = loadCodefluffConfig()
  const modeMapping = config.mapping?.[costMode]
  if (!modeMapping) {
    return { resolvedModel: null, decision: 'no-mode-mapping' }
  }

  if (agentId) {
    const baseAgentId = agentId.split('@')[0]
    const mapped = modeMapping[baseAgentId]
    if (mapped) {
      return { resolvedModel: mapped, decision: 'agent-specific' }
    }
  }

  const base = modeMapping['base']
  if (base) {
    return { resolvedModel: base, decision: 'base' }
  }

  return { resolvedModel: null, decision: 'no-base' }
}

type CodefluffModelResolutionLogLine = {
  ts: string
  codefluffMode: boolean
  costMode: string
  agentId: string | null
  agentMappingKey: string | null
  requestedModel: string
  resolvedModel: string | null
  mappingDecision: CodefluffModelResolutionDecision
  requestedProvider: string
  resolvedProvider: string | null
  providerConfig: ProviderConfigDebug | null
  note: string | null
}

let didLogNonCodefluffModeDebug = false

function isCodefluffModelResolutionDebugEnabled(): boolean {
  return isCodefluffModelResolutionDebugEnabledFromEnv()
}

function getCodefluffModelResolutionDebugFilePath(): string | null {
  return getCodefluffModelResolutionDebugFilePathFromEnv()
}

function logCodefluffModelResolution(
  line: CodefluffModelResolutionLogLine,
): void {
  // Avoid spamming the same “not in codefluff mode” note.
  if (!line.codefluffMode) {
    if (didLogNonCodefluffModeDebug) return
    didLogNonCodefluffModeDebug = true
  }

  const prefix = '[CODEFLUFF_MODEL_RESOLUTION]'
  const payload = JSON.stringify(line)

  const debugFilePath = getCodefluffModelResolutionDebugFilePath()
  if (debugFilePath) {
    try {
      fs.appendFileSync(debugFilePath, `${prefix} ${payload}\n`, 'utf8')
      return
    } catch {
      // Fall back to stderr if file logging fails.
    }
  }

  // Intentionally do NOT log API keys or headers.
  // Use stderr so it shows up even if stdout is used for TUI rendering.
  console.error(prefix, payload)
}

type ProviderConfigDebug = {
  providerName: string
  style: 'openai' | 'anthropic' | 'google'
  baseURL?: string
  source: 'env' | 'config' | 'missing'
}

function getCodefluffProviderConfigDebug(model: string): ProviderConfigDebug {
  const providerName = getProviderName(model)

  const envKeys = getCodefluffByokKeysFromEnv()
  if (envKeys) {
    // Built-in well-known providers
    if (providerName === 'anthropic') {
      return {
        providerName,
        style: 'anthropic',
        source: envKeys.anthropic ? 'env' : 'missing',
      }
    }
    if (providerName === 'openai') {
      return {
        providerName,
        style: 'openai',
        baseURL: PROVIDER_BASE_URLS.openai,
        source: envKeys.openai ? 'env' : 'missing',
      }
    }
    if (providerName === 'google') {
      return {
        providerName,
        style: 'google',
        source: envKeys.google ? 'env' : 'missing',
      }
    }

    const key = envKeys[providerName] ?? envKeys.openrouter
    if (!key) {
      return { providerName, style: 'openai', source: 'missing' }
    }

    return {
      providerName,
      style: 'openai',
      baseURL: PROVIDER_BASE_URLS[providerName],
      source: 'env',
    }
  }

  const config = loadCodefluffConfig()
  const keys = config.keys ?? {}
  const providerValue = keys[providerName]

  if (!providerValue) {
    return { providerName, style: 'openai', source: 'missing' }
  }

  if (typeof providerValue === 'string') {
    if (providerName === 'anthropic') {
      return { providerName, style: 'anthropic', source: 'config' }
    }
    if (providerName === 'openai') {
      return {
        providerName,
        style: 'openai',
        baseURL: PROVIDER_BASE_URLS.openai,
        source: 'config',
      }
    }
    if (providerName === 'google') {
      return { providerName, style: 'google', source: 'config' }
    }

    return {
      providerName,
      style: 'openai',
      baseURL: PROVIDER_BASE_URLS[providerName],
      source: 'config',
    }
  }

  if (typeof providerValue === 'object' && providerValue !== null) {
    const style = ((providerValue as { style?: string }).style ?? 'openai') as
      | 'openai'
      | 'anthropic'
      | 'google'

    return {
      providerName,
      style,
      baseURL: (providerValue as { baseURL?: string }).baseURL,
      source: 'config',
    }
  }

  return { providerName, style: 'openai', source: 'missing' }
}

export function getCodefluffDefaultMode(): string {
  const config = loadCodefluffConfig()
  return config.defaultMode ?? 'normal'
}

/**
 * Get extra body parameters for a specific model
 */
export function getModelExtraBody(
  model: string,
): Record<string, unknown> | undefined {
  const modelConfig = getModelConfig(model)
  return modelConfig?.extraBody
}

/**
 * Get max_tokens for a specific model
 */
export { getModelMaxTokens } from '@codebuff/common/config/codefluff-config'

/**
 * Get temperature for a specific model
 */
export { getModelTemperature } from '@codebuff/common/config/codefluff-config'

/**
 * Get top_p for a specific model
 */
export { getModelTopP } from '@codebuff/common/config/codefluff-config'

/**
 * Get top_k for a specific model
 */
export { getModelTopK } from '@codebuff/common/config/codefluff-config'
