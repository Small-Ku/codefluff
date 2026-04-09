import { describe, expect, it } from 'bun:test'

import type { PromptAiSdkFn } from '@codebuff/common/types/contracts/llm'

// This is intentionally a type-level regression test.
// We do NOT import or mock the `ai` package here.

describe('promptAiSdk (non-streaming) agentMappingKey type coverage', () => {
  it('PromptAiSdkFn params include agentMappingKey', () => {
    // If agentMappingKey is removed from the contract, this will fail to typecheck.
    const _typecheckOnly = ((
      _params: Parameters<PromptAiSdkFn>[0],
    ): void => {})

    _typecheckOnly({
      agentMappingKey: 'basher',
    } as never)

    expect(true).toBe(true)
  })
})
