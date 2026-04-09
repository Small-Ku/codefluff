import { describe, expect, test, beforeEach, mock, afterAll } from 'bun:test'
import { tmpdir } from 'os'
import { join } from 'path'
import { mkdirSync, writeFileSync, rmSync } from 'fs'

import {
  loadCodefluffConfig,
  getConfiguredKeys,
  getDefaultMode,
  getSearchProviders,
  getModelConfig,
  resetCodefluffConfigCache,
} from '../codefluff-config'

describe('codefluff-config', () => {
  const originalHome = process.env.HOME
  const originalUserProfile = process.env.USERPROFILE
  const testConfigDir = join(tmpdir(), 'codefluff-config-test')
  const testConfigPath = join(testConfigDir, '.config', 'codefluff', 'config.json')

  function writeConfig(obj: unknown) {
    mkdirSync(join(testConfigDir, '.config', 'codefluff'), { recursive: true })
    writeFileSync(testConfigPath, JSON.stringify(obj))
  }

  function overrideHome() {
    process.env.HOME = testConfigDir
    delete process.env.USERPROFILE
    resetCodefluffConfigCache()
  }

  function restoreHome() {
    process.env.HOME = originalHome
    if (originalUserProfile) process.env.USERPROFILE = originalUserProfile
    resetCodefluffConfigCache()
  }

  beforeEach(() => {
    rmSync(testConfigDir, { recursive: true, force: true })
    restoreHome()
  })

  afterAll(() => {
    rmSync(testConfigDir, { recursive: true, force: true })
    restoreHome()
  })

  // ---- loadCodefluffConfig ----

  describe('loadCodefluffConfig', () => {
    test('returns {} when no config file exists', () => {
      overrideHome()
      const config = loadCodefluffConfig()
      expect(config).toEqual({})
      restoreHome()
    })

    test('parse valid config with keys and mapping', () => {
      overrideHome()
      writeConfig({
        keys: {
          openai: 'sk-abc',
          anthropic: 'sk-def',
        },
        mapping: {
          normal: {
            base: 'anthropic/claude-sonnet-4',
            'file-picker': 'google/gemini-2.5-flash-lite',
            editor: 'anthropic/claude-opus-4',
          },
        },
        defaultMode: 'normal',
        searchProviders: {
          linkup: 'lk-123',
        },
      })

      const config = loadCodefluffConfig()

      expect(config.keys).toEqual({
        openai: 'sk-abc',
        anthropic: 'sk-def',
      })
      expect(config.mapping?.normal?.base).toBe('anthropic/claude-sonnet-4')
      expect(config.mapping?.normal?.['file-picker']).toBe('google/gemini-2.5-flash-lite')
      expect(config.mapping?.normal?.editor).toBe('anthropic/claude-opus-4')
      expect(config.defaultMode).toBe('normal')
      expect(config.searchProviders?.linkup).toBe('lk-123')
      restoreHome()
    })

    test('interpolates env vars in keys', () => {
      overrideHome()
      process.env.TEST_API_KEY = 'interpolated-value'
      writeConfig({
        keys: {
          openai: '${TEST_API_KEY}',
        },
      })

      const config = loadCodefluffConfig()
      expect(config.keys?.openai).toBe('interpolated-value')
      restoreHome()
    })

    test('interpolates env vars in provider object config', () => {
      overrideHome()
      process.env.TEST_BASE_URL = 'https://custom.example.com'
      process.env.TEST_KEY = 'secret-key'
      writeConfig({
        keys: {
          myprovider: {
            key: '${TEST_KEY}',
            baseURL: '${TEST_BASE_URL}',
            style: 'openai',
          },
        },
      })

      const config = loadCodefluffConfig()
      expect(config.keys?.myprovider).toEqual({
        key: 'secret-key',
        baseURL: 'https://custom.example.com',
        style: 'openai',
      })
      restoreHome()
    })

    test('throws when env var referenced but not set', () => {
      overrideHome()
      delete process.env.UNSET_VAR_FOR_TEST
      writeConfig({
        keys: {
          openai: '${UNSET_VAR_FOR_TEST}',
        },
      })

      const warnFn = mock(() => {})
      const origWarn = console.warn
      console.warn = warnFn

      const config = loadCodefluffConfig()

      expect(warnFn).toHaveBeenCalled()
      expect(config).toEqual({})

      console.warn = origWarn
      restoreHome()
    })

    test('warns on invalid JSON and returns {}', () => {
      overrideHome()
      mkdirSync(join(testConfigDir, '.config', 'codefluff'), { recursive: true })
      writeFileSync(testConfigPath, '{ invalid json }')

      const warnFn = mock(() => {})
      const origWarn = console.warn
      console.warn = warnFn

      const config = loadCodefluffConfig()

      expect(warnFn).toHaveBeenCalled()
      expect(config).toEqual({})

      console.warn = origWarn
      restoreHome()
    })

    test('warns on Zod validation error', () => {
      overrideHome()
      writeConfig({
        keys: {
          openai: 42, // should be a string or object
        },
      })

      const warnFn = mock(() => {})
      const origWarn = console.warn
      console.warn = warnFn

      const config = loadCodefluffConfig()

      expect(warnFn).toHaveBeenCalled()
      expect(config).toEqual({})

      console.warn = origWarn
      restoreHome()
    })

    test('rejects mapping modes without base', () => {
      overrideHome()
      writeConfig({
        mapping: {
          normal: {
            editor: 'anthropic/claude-opus-4',
          },
        },
      })

      const warnFn = mock(() => {})
      const origWarn = console.warn
      console.warn = warnFn

      const config = loadCodefluffConfig()

      expect(warnFn).toHaveBeenCalled()
      expect(config).toEqual({})

      console.warn = origWarn
      restoreHome()
    })
  })

  // ---- getConfiguredKeys ----

  describe('getConfiguredKeys', () => {
    test('returns configured keys', () => {
      overrideHome()
      writeConfig({
        keys: {
          openai: 'sk-123',
          anthropic: { key: 'sk-456', style: 'anthropic' },
        },
      })

      const keys = getConfiguredKeys()
      expect(keys.openai).toBe('sk-123')
      expect(keys.anthropic).toEqual({ key: 'sk-456', style: 'anthropic' })
      restoreHome()
    })

    test('returns {} when no config', () => {
      overrideHome()
      const keys = getConfiguredKeys()
      expect(keys).toEqual({})
      restoreHome()
    })
  })

  // ---- getDefaultMode ----

  describe('getDefaultMode', () => {
    test('returns configured mode', () => {
      overrideHome()
      writeConfig({ defaultMode: 'max' })
      expect(getDefaultMode()).toBe('max')
      restoreHome()
    })

    test('returns "normal" when no config', () => {
      overrideHome()
      expect(getDefaultMode()).toBe('normal')
      restoreHome()
    })

    test('returns "normal" for invalid mode value', () => {
      overrideHome()
      writeConfig({ defaultMode: 'bogus' })
      expect(getDefaultMode()).toBe('normal')
      restoreHome()
    })
  })

  // ---- getSearchProviders ----

  describe('getSearchProviders', () => {
    test('returns configured search providers', () => {
      overrideHome()
      writeConfig({
        searchProviders: {
          linkup: 'lk-123',
          searxng: 'https://searx.example.org',
        },
      })

      const providers = getSearchProviders()
      expect(providers).toEqual({
        linkup: 'lk-123',
        searxng: 'https://searx.example.org',
      })
      restoreHome()
    })

    test('returns {} when no searchProviders configured', () => {
      overrideHome()
      writeConfig({ keys: { openai: 'sk-123' } })
      expect(getSearchProviders()).toEqual({})
      restoreHome()
    })

    test('interpolates env vars in searchProviders', () => {
      overrideHome()
      process.env.TEST_LINKUP_KEY = 'lk-interpolated'
      writeConfig({
        searchProviders: {
          linkup: '${TEST_LINKUP_KEY}',
        },
      })

      const providers = getSearchProviders()
      expect(providers.linkup).toBe('lk-interpolated')
      restoreHome()
    })
  })

  // ---- Provider config with headers ----

  describe('provider config with advanced options', () => {
    test('parses provider config with headers', () => {
      overrideHome()
      writeConfig({
        keys: {
          customprovider: {
            key: 'sk-123',
            baseURL: 'https://api.example.com/v1',
            style: 'openai',
            headers: {
              'X-Custom-Header': 'value',
              'X-Another-Header': 'another-value',
            },
          },
        },
      })

      const config = loadCodefluffConfig()
      expect(config.keys?.customprovider).toEqual({
        key: 'sk-123',
        baseURL: 'https://api.example.com/v1',
        style: 'openai',
        headers: {
          'X-Custom-Header': 'value',
          'X-Another-Header': 'another-value',
        },
      })
      restoreHome()
    })

    test('interpolates env vars in provider headers', () => {
      overrideHome()
      process.env.CUSTOM_HEADER = 'header-value'
      writeConfig({
        keys: {
          myprovider: {
            key: 'sk-123',
            headers: {
              'X-Custom': '${CUSTOM_HEADER}',
            },
          },
        },
      })

      const config = loadCodefluffConfig()
      const providerConfig = config.keys?.myprovider as {
        key: string
        headers: Record<string, string>
      }
      expect(providerConfig.headers['X-Custom']).toBe('header-value')
      restoreHome()
    })
  })

  // ---- Model config (per-model extraBody and max_tokens) ----

  describe('getModelConfig', () => {
    test('returns model-specific config', () => {
      overrideHome()
      writeConfig({
        models: {
          'nvidia-nim/moonshotai/kimi-k2.5': {
            extraBody: {
              chat_template_kwargs: {
                thinking: true,
              },
            },
            max_tokens: 16384,
          },
          'deepseek/deepseek-reasoner': {
            extraBody: {
              enable_thinking: true,
            },
          },
        },
      })

      const nvidiaConfig = getModelConfig('nvidia-nim/moonshotai/kimi-k2.5')
      expect(nvidiaConfig?.extraBody).toEqual({
        chat_template_kwargs: {
          thinking: true,
        },
      })
      expect(nvidiaConfig?.max_tokens).toBe(16384)

      const deepseekConfig = getModelConfig('deepseek/deepseek-reasoner')
      expect(deepseekConfig?.extraBody).toEqual({
        enable_thinking: true,
      })
      expect(deepseekConfig?.max_tokens).toBeUndefined()
      restoreHome()
    })

    test('returns undefined for unconfigured model', () => {
      overrideHome()
      writeConfig({
        models: {
          'anthropic/claude-sonnet-4': {
            extraBody: {},
          },
        },
      })

      const config = getModelConfig('unconfigured/model')
      expect(config).toBeUndefined()
      restoreHome()
    })

    test('returns undefined when no models section', () => {
      overrideHome()
      writeConfig({
        keys: {
          openai: 'sk-123',
        },
      })

      const config = getModelConfig('openai/gpt-4')
      expect(config).toBeUndefined()
      restoreHome()
    })

    test('rejects negative max_tokens', () => {
      overrideHome()
      writeConfig({
        models: {
          'openai/gpt-4': {
            max_tokens: -100,
          },
        },
      })

      const warnFn = mock(() => {})
      const origWarn = console.warn
      console.warn = warnFn

      const config = getModelConfig('openai/gpt-4')
      expect(config).toBeUndefined()
      expect(warnFn).toHaveBeenCalled()

      console.warn = origWarn
      restoreHome()
    })

    test('rejects non-integer max_tokens', () => {
      overrideHome()
      writeConfig({
        models: {
          'openai/gpt-4': {
            max_tokens: 1000.5,
          },
        },
      })

      const warnFn = mock(() => {})
      const origWarn = console.warn
      console.warn = warnFn

      const config = getModelConfig('openai/gpt-4')
      expect(config).toBeUndefined()
      expect(warnFn).toHaveBeenCalled()

      console.warn = origWarn
      restoreHome()
    })

    test('interpolates env vars in models.extraBody', () => {
      overrideHome()
      process.env.NVIDIA_TEMPLATE_VAR = 'thinking-mode'
      writeConfig({
        models: {
          'nvidia/moonshotai/kimi-k2.5': {
            extraBody: {
              chat_template_kwargs: {
                mode: '${NVIDIA_TEMPLATE_VAR}',
              },
            },
          },
        },
      })

      const config = getModelConfig('nvidia/moonshotai/kimi-k2.5')
      expect(config?.extraBody).toEqual({
        chat_template_kwargs: {
          mode: 'thinking-mode',
        },
      })
      restoreHome()
    })

    test('string env var in max_tokens fails validation (must be numeric literal)', () => {
      overrideHome()
      process.env.MAX_TOKENS = '8192'
      writeConfig({
        models: {
          'openai/gpt-4': {
            max_tokens: '${MAX_TOKENS}',
          },
        },
      })

      const warnFn = mock(() => {})
      const origWarn = console.warn
      console.warn = warnFn

      // After interpolation, max_tokens becomes the string "8192", not the number 8192
      // This fails schema validation which expects a number
      const config = getModelConfig('openai/gpt-4')
      expect(config).toBeUndefined()
      expect(warnFn).toHaveBeenCalled()

      console.warn = origWarn
      restoreHome()
    })
  })
})
