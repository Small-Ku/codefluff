import { describe, expect, it } from 'bun:test'

import { openrouterModels } from '@codebuff/common/old-constants'
import type { PromptAiSdkFn } from '@codebuff/common/types/contracts/llm'
import type { Logger } from '@codebuff/common/types/contracts/logger'

import { promptFlashWithFallbacks } from '../llm-api/gemini-with-fallbacks'

describe('agentMappingKey (non-streaming)', () => {
  it('promptFlashWithFallbacks forwards agentMappingKey into promptAiSdk', async () => {
    let seen: string | undefined

    const promptAiSdk: PromptAiSdkFn = async (params) => {
      seen = params.agentMappingKey
      return { aborted: false, value: 'ok' }
    }

    const logger: Logger = {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    }

    await promptFlashWithFallbacks({
      apiKey: 'test',
      runId: 'run',
      clientSessionId: 'client',
      fingerprintId: 'fp',
      userInputId: 'input',
      userId: 'user',
      sendAction: async () => {},
      trackEvent: async () => {},
      signal: new AbortController().signal,

      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: 'hi' }],
          sentAt: Date.now(),
        },
      ],
      model: openrouterModels.openrouter_gemini2_5_flash,
      promptAiSdk,
      logger,

      agentMappingKey: 'file-picker',
    })

    expect(seen).toBe('file-picker')
  })
})
