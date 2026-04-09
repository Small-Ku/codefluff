import { describe, expect, it, mock } from 'bun:test'

mock.module('@codebuff/common/config/codefluff-config', () => {
  return {
    loadCodefluffConfig: () => ({
      mapping: {
        normal: {
          base: 'google/gemma-4-26b-a4b-it',
          basher: 'hachimi/gpt-5.1-codex-mini',
        },
      },
    }),
    getModelConfig: () => undefined,
  }
})

mock.module('../impl/codefluff', () => {
  return {
    isCodefluffMode: () => false,
  }
})

import { resolveCodefluffModel } from '../impl/model-provider'

describe('resolveCodefluffModel (not codefluff mode)', () => {
  it('returns null even if mapping exists', () => {
    expect(resolveCodefluffModel('normal', 'basher')).toBe(null)
    expect(resolveCodefluffModel('normal')).toBe(null)
  })
})
