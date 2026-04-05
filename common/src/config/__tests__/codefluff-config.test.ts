import { describe, expect, test, beforeEach, mock, afterAll } from 'bun:test'
import { tmpdir } from 'os'
import { join } from 'path'
import { mkdirSync, writeFileSync, rmSync } from 'fs'

import {
  loadCodefluffConfig,
  getConfiguredKeys,
  getDefaultMode,
  getSearchProviders,
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
            agent: 'anthropic/claude-sonnet-4',
            'file-requests': 'openai/gpt-4o',
            'check-new-files': 'anthropic/claude-sonnet-4',
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
      expect(config.mapping?.normal?.agent).toBe('anthropic/claude-sonnet-4')
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
})
