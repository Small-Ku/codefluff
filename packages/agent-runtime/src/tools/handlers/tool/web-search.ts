import { jsonToolResult } from '@codebuff/common/util/messages'

import { callWebSearchAPI } from '../../../llm-api/codebuff-web-api'
import { getConfiguredSearchProviders } from '../../../llm-api/search-providers'
import type { SearchProviderResult } from '../../../llm-api/search-providers'

import type { CodebuffToolHandlerFunction } from '../handler-function-type'
import type {
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'
import type { ClientEnv, CiEnv } from '@codebuff/common/types/contracts/env'
import type { Logger } from '@codebuff/common/types/contracts/logger'

export const handleWebSearch = (async (params: {
  previousToolCallFinished: Promise<void>
  toolCall: CodebuffToolCall<'web_search'>
  logger: Logger
  apiKey: string

  agentStepId: string
  clientSessionId: string
  fingerprintId: string
  repoId: string | undefined
  repoUrl: string | undefined
  userInputId: string
  userId: string | undefined

  fetch: typeof globalThis.fetch
  clientEnv: ClientEnv
  ciEnv: CiEnv
}): Promise<{
  output: CodebuffToolOutput<'web_search'>
  creditsUsed: number
}> => {
  const {
    previousToolCallFinished,
    toolCall,

    agentStepId,
    apiKey,
    clientSessionId,
    fingerprintId,
    logger,
    repoId,
    repoUrl,
    userId,
    userInputId,

    fetch,
  } = params
  const { query, depth } = toolCall.input

  const searchStartTime = Date.now()
  const searchContext = {
    toolCallId: toolCall.toolCallId,
    query,
    depth,
    userId,
    agentStepId,
    clientSessionId,
    fingerprintId,
    userInputId,
    repoId,
  }

  await previousToolCallFinished

  let creditsUsed = 0

  try {
    let webApi: { result?: string; error?: string; creditsUsed?: number }

    // Codefluff BYOK mode — try all configured providers with fallback
    if (process.env.CODEFLUFF_MODE === 'true') {
      const providers = getConfiguredSearchProviders()
      if (providers.length === 0) {
        return {
          output: jsonToolResult({
            errorMessage:
              'No search providers configured for web_search. Add "searchProviders" to ~/.config/codefluff/config.json. Supported: linkup, langsearch, ollama, searxng (your URL), searx-space (auto-discovery from searx.space).',
          }),
          creditsUsed: 0,
        }
      }

      const errors: string[] = []

      // Apply overall 60s timeout for the entire provider fallback chain
      const timeoutPromise = new Promise<SearchProviderResult>((resolve) =>
        setTimeout(
          () => resolve({ error: 'All search providers timed out after 60s' }),
          60_000,
        ),
      )

      for (const provider of providers) {
        const providerResult = await Promise.race([
          provider.search({
            query,
            depth,
            logger,
            fetch,
          }),
          timeoutPromise,
        ])

        // Check if we hit the timeout
        if (
          providerResult.error === 'All search providers timed out after 60s'
        ) {
          errors.push(
            `Timeout: exceeded 60s (attempted: ${
              errors.length > 0
                ? providers
                    .slice(0, errors.length)
                    .map((p) => p.name)
                    .join(', ')
                : (providers[0]?.name ?? 'unknown')
            })`,
          )
          break
        }

        if (providerResult.error) {
          errors.push(`${provider.name}: ${providerResult.error}`)
          logger.warn(
            {
              ...searchContext,
              usedDirectProvider: provider.name,
              success: false,
              error: providerResult.error,
            },
            `Provider ${provider.name} failed, trying next`,
          )
          continue
        }

        const searchDuration = Date.now() - searchStartTime
        logger.info(
          {
            ...searchContext,
            searchDuration,
            usedDirectProvider: provider.name,
            success: true,
          },
          'Search completed via direct provider',
        )

        return {
          output: jsonToolResult({ result: providerResult.result ?? '' }),
          creditsUsed: 0,
        }
      }

      // All providers failed
      const searchDuration = Date.now() - searchStartTime
      logger.error(
        {
          ...searchContext,
          searchDuration,
          attemptedProviders: providers.map((p) => p.name),
          errors,
          success: false,
        },
        'All search providers failed',
      )

      return {
        output: jsonToolResult({
          errorMessage: `All search providers failed:\n${errors.join('\n')}`,
        }),
        creditsUsed: 0,
      }
    }

    // Default — Codebuff web API
    const { clientEnv, ciEnv } = params
    webApi = await callWebSearchAPI({
      query,
      depth,
      repoUrl: repoUrl ?? null,
      fetch,
      logger,
      apiKey,
      env: { clientEnv, ciEnv },
    })

    if (webApi.error) {
      const searchDuration = Date.now() - searchStartTime
      logger.warn(
        {
          ...searchContext,
          searchDuration,
          usedWebApi: true,
          success: false,
          error: webApi.error,
        },
        'Web API search returned error',
      )
      return {
        output: jsonToolResult({
          errorMessage: webApi.error,
        }),
        creditsUsed,
      }
    }
    const searchDuration = Date.now() - searchStartTime
    const resultLength = webApi.result?.length || 0
    const hasResults = Boolean(webApi.result && webApi.result.trim())

    // Capture credits used from the API response
    if (typeof webApi.creditsUsed === 'number') {
      creditsUsed = webApi.creditsUsed
    }

    logger.info(
      {
        ...searchContext,
        searchDuration,
        resultLength,
        hasResults,
        usedWebApi: true,
        creditsCharged: 'server',
        creditsUsed,
        success: true,
      },
      'Search completed via web API',
    )

    return {
      output: jsonToolResult({ result: webApi.result ?? '' }),
      creditsUsed,
    }
  } catch (error) {
    const searchDuration = Date.now() - searchStartTime
    const errorMessage = `Error performing web search for "${query}": ${
      error instanceof Error ? error.message : 'Unknown error'
    }`
    logger.error(
      {
        ...searchContext,
        error:
          error instanceof Error
            ? {
                name: error.name,
                message: error.message,
                stack: error.stack,
              }
            : error,
        searchDuration,
        success: false,
      },
      'Search failed with error',
    )
    return { output: jsonToolResult({ errorMessage }), creditsUsed }
  }
}) satisfies CodebuffToolHandlerFunction<'web_search'>
