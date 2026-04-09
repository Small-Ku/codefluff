import { describe, expect, it, beforeEach, afterEach, mock } from 'bun:test'

// Mocks must be declared before importing the module under test
mock.module('@codebuff/common/config/codefluff-config', () => {
  return {
    loadCodefluffConfig: () => ({
      defaultMode: 'normal',
      mapping: {
        normal: {
          base: 'google/gemma-4-26b-a4b-it',
          basher: 'hachimi/gpt-5.1-codex-mini',
        },
        max: {
          base: 'hachimi/gpt-5.4',
          'editor-multi-prompt': 'hachimi/gpt-5.3-codex',
        },
      },
      keys: {
        hachimi: {
          key: 'sk-test',
          baseURL: 'https://ai.td.ee/v1',
          style: 'openai',
        },
      },
    }),
    resetCodefluffConfigCache: () => {},
    getModelConfig: () => undefined,
  }
})

mock.module('../impl/codefluff', () => {
  return {
    isCodefluffMode: () => true,
  }
})

import { resolveCodefluffModel } from '../impl/model-provider'

describe('resolveCodefluffModel (codefluff)', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    process.env = { ...originalEnv }
    delete process.env.CODEFLUFF_MODEL_RESOLUTION_DEBUG
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('returns agent-specific mapping when present', () => {
    expect(resolveCodefluffModel('normal', 'basher')).toBe('hachimi/gpt-5.1-codex-mini')
    // version suffix should be stripped
    expect(resolveCodefluffModel('normal', 'basher@1.0.0')).toBe('hachimi/gpt-5.1-codex-mini')
  })

  it('falls back to base when agent-specific mapping is missing', () => {
    expect(resolveCodefluffModel('normal', 'file-picker')).toBe('google/gemma-4-26b-a4b-it')
    expect(resolveCodefluffModel('normal')).toBe('google/gemma-4-26b-a4b-it')
  })

  it('works for max mode agent overrides', () => {
    expect(resolveCodefluffModel('max', 'editor-multi-prompt')).toBe('hachimi/gpt-5.3-codex')
    expect(resolveCodefluffModel('max', 'some-other-agent')).toBe('hachimi/gpt-5.4')
  })

  it('debug env flag does not change resolution result', () => {
    process.env.CODEFLUFF_MODEL_RESOLUTION_DEBUG = '1'
    expect(resolveCodefluffModel('normal', 'basher')).toBe('hachimi/gpt-5.1-codex-mini')
    expect(resolveCodefluffModel('normal', 'file-picker')).toBe('google/gemma-4-26b-a4b-it')
  })
})
