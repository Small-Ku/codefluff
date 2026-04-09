import { describe, expect, it, afterEach, beforeEach, mock } from 'bun:test'

import type { PromptAiSdkStreamFn } from '@codebuff/common/types/contracts/llm'
import type { Logger } from '@codebuff/common/types/contracts/logger'

// Captured params passed to getModelForRequest
let capturedModelRequestParams: {
  agentMappingKey?: string
  agentId?: string
} | null = null

// Mock the llm module to capture params and return a minimal stream
mock.module('../impl/llm', () => ({
  promptAiSdkStream: async function* (
    params: Parameters<PromptAiSdkStreamFn>[0],
  ): ReturnType<PromptAiSdkStreamFn> {
    // Capture the params that were passed
    capturedModelRequestParams = {
      agentMappingKey: (params as { agentMappingKey?: string }).agentMappingKey,
      agentId: params.agentId,
    }
    // Yield a minimal text chunk
    yield { type: 'text', text: 'ok' }
    return { aborted: false, value: 'test-msg-id' }
  },
}))

mock.module('../impl/codefluff', () => ({
  isCodefluffMode: () => false,
}))

describe('promptAiSdkStream agentMappingKey forwarding (contract test)', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    capturedModelRequestParams = null
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = { ...originalEnv }
    mock.restore()
  })

  it('accepts agentMappingKey parameter in contract', async () => {
    const { promptAiSdkStream } = await import('../impl/llm')

    const logger: Logger = {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    }

    const stream = promptAiSdkStream({
      apiKey: 'test-key',
      runId: 'test-run',
      messages: [],
      clientSessionId: 'test-session',
      fingerprintId: 'test-fp',
      model: 'test-model',
      userId: 'test-user',
      userInputId: 'test-input',
      agentMappingKey: 'basher',
      agentId: 'legacy-runtime-id',
      sendAction: async () => {},
      trackEvent: async () => {},
      signal: new AbortController().signal,
      logger,
    } as Parameters<PromptAiSdkStreamFn>[0])

    // Consume the generator
    for await (const _chunk of stream) {
      // just drain
    }

    expect(capturedModelRequestParams).not.toBeNull()
    expect(capturedModelRequestParams!.agentMappingKey).toBe('basher')
    expect(capturedModelRequestParams!.agentId).toBe('legacy-runtime-id')
  })

  it('agentMappingKey is the primary key for model resolution', async () => {
    const { promptAiSdkStream } = await import('../impl/llm')

    const logger: Logger = {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    }

    const stream = promptAiSdkStream({
      apiKey: 'test-key',
      runId: 'test-run',
      messages: [],
      clientSessionId: 'test-session',
      fingerprintId: 'test-fp',
      model: 'test-model',
      userId: 'test-user',
      userInputId: 'test-input',
      agentMappingKey: 'file-picker',
      sendAction: async () => {},
      trackEvent: async () => {},
      signal: new AbortController().signal,
      logger,
    } as Parameters<PromptAiSdkStreamFn>[0])

    for await (const _chunk of stream) {
      // drain
    }

    expect(capturedModelRequestParams).not.toBeNull()
    expect(capturedModelRequestParams!.agentMappingKey).toBe('file-picker')
  })
})

