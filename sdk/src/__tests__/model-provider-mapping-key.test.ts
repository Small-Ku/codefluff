import { describe, expect, it, afterEach, beforeEach, mock } from 'bun:test'

describe('Codefluff model mapping prefers agentMappingKey', () => {
  beforeEach(() => {
    process.env.CODEFLUFF_MODE = 'true'
  })

  afterEach(() => {
    delete process.env.CODEFLUFF_MODE
    mock.restore()
  })

  it('uses mapping key value, not random runtime id', async () => {
    mock.module('../impl/codefluff', () => ({
      isCodefluffMode: () => true,
    }))

    mock.module('@codebuff/common/config/codefluff-config', () => ({
      loadCodefluffConfig: () => ({
        mapping: {
          normal: {
            base: 'google/gemma-4-26b-a4b-it',
            basher: 'hachimi/gpt-5.1-codex-mini',
          },
        },
      }),
      resetCodefluffConfigCache: () => {},
      getModelConfig: () => null,
      getModelMaxTokens: () => undefined,
    }))

    const modelProvider = await import('../impl/model-provider')

    const resolved = modelProvider.resolveCodefluffModelDebug('normal', 'basher')
    expect(resolved.decision).toBe('agent-specific')
    expect(resolved.resolvedModel).toBe('hachimi/gpt-5.1-codex-mini')

    const baseResolved = modelProvider.resolveCodefluffModelDebug('normal', 'csBc6tqOAm0')
    expect(baseResolved.decision).toBe('base')
    expect(baseResolved.resolvedModel).toBe('google/gemma-4-26b-a4b-it')
  })
})
