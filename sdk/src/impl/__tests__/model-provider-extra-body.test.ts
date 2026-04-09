import { describe, expect, test, beforeEach, afterAll } from 'bun:test'
import { tmpdir } from 'os'
import { join } from 'path'
import { mkdirSync, writeFileSync, rmSync } from 'fs'

import {
  getModelExtraBody,
  getModelMaxTokens,
  resetCodefluffConfigCache,
} from '../model-provider'
import { resetCodefluffConfigCache as resetCommonCache } from '@codebuff/common/config/codefluff-config'

describe('model-provider extraBody', () => {
  const originalHome = process.env.HOME
  const originalUserProfile = process.env.USERPROFILE
  const testConfigDir = join(tmpdir(), 'model-provider-test')
  const testConfigPath = join(testConfigDir, '.config', 'codefluff', 'config.json')

  function writeConfig(obj: unknown) {
    mkdirSync(join(testConfigDir, '.config', 'codefluff'), { recursive: true })
    writeFileSync(testConfigPath, JSON.stringify(obj))
  }

  function overrideHome() {
    process.env.HOME = testConfigDir
    delete process.env.USERPROFILE
    resetCodefluffConfigCache()
    resetCommonCache()
  }

  function restoreHome() {
    process.env.HOME = originalHome
    if (originalUserProfile) process.env.USERPROFILE = originalUserProfile
    resetCodefluffConfigCache()
    resetCommonCache()
  }

  beforeEach(() => {
    rmSync(testConfigDir, { recursive: true, force: true })
    restoreHome()
  })

  afterAll(() => {
    rmSync(testConfigDir, { recursive: true, force: true })
    restoreHome()
  })

  describe('getModelExtraBody', () => {
    test('returns undefined when no extraBody configured', () => {
      overrideHome()
      writeConfig({
        keys: {
          openai: 'sk-123',
        },
      })

      const extraBody = getModelExtraBody('openai/gpt-4')
      expect(extraBody).toBeUndefined()
      restoreHome()
    })

    test('returns model-level extraBody', () => {
      overrideHome()
      writeConfig({
        keys: {
          'nvidia-nim': 'nvapi-123',
        },
        models: {
          'nvidia-nim/moonshotai/kimi-k2.5': {
            extraBody: {
              chat_template_kwargs: {
                thinking: true,
              },
            },
          },
        },
      })

      const extraBody = getModelExtraBody('nvidia-nim/moonshotai/kimi-k2.5')
      expect(extraBody).toEqual({
        chat_template_kwargs: {
          thinking: true,
        },
      })
      restoreHome()
    })

    test('handles string provider key with model extraBody', () => {
      overrideHome()
      writeConfig({
        keys: {
          deepseek: 'sk-123',
        },
        models: {
          'deepseek/deepseek-reasoner': {
            extraBody: {
              enable_thinking: true,
            },
          },
        },
      })

      const extraBody = getModelExtraBody('deepseek/deepseek-reasoner')
      expect(extraBody).toEqual({
        enable_thinking: true,
      })
      restoreHome()
    })

    test('returns undefined for unconfigured model', () => {
      overrideHome()
      writeConfig({
        keys: {
          openai: 'sk-123',
        },
      })

      const extraBody = getModelExtraBody('unconfigured/model')
      expect(extraBody).toBeUndefined()
      restoreHome()
    })
  })

  describe('getModelMaxTokens', () => {
    test('returns undefined when no max_tokens configured', () => {
      overrideHome()
      writeConfig({
        keys: {
          openai: 'sk-123',
        },
        models: {
          'openai/gpt-4': {
            extraBody: {},
          },
        },
      })

      const maxTokens = getModelMaxTokens('openai/gpt-4')
      expect(maxTokens).toBeUndefined()
      restoreHome()
    })

    test('returns model-level max_tokens', () => {
      overrideHome()
      writeConfig({
        keys: {
          'nvidia-nim': 'nvapi-123',
        },
        models: {
          'nvidia-nim/moonshotai/kimi-k2.5': {
            max_tokens: 16384,
            extraBody: {
              chat_template_kwargs: {
                thinking: true,
              },
            },
          },
        },
      })

      const maxTokens = getModelMaxTokens('nvidia-nim/moonshotai/kimi-k2.5')
      expect(maxTokens).toBe(16384)
      restoreHome()
    })

    test('returns undefined for unconfigured model', () => {
      overrideHome()
      writeConfig({
        keys: {
          openai: 'sk-123',
        },
      })

      const maxTokens = getModelMaxTokens('unconfigured/model')
      expect(maxTokens).toBeUndefined()
      restoreHome()
    })
  })
})
