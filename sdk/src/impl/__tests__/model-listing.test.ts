import { describe, expect, test, beforeEach, mock, afterAll } from 'bun:test'
import { tmpdir } from 'os'
import { join } from 'path'
import { mkdirSync, writeFileSync, rmSync } from 'fs'

import {
  listModelsForProvider,
  listAllModels,
  formatModelList,
  type ModelInfo,
} from '../model-listing'
import { resetCodefluffConfigCache } from '@codebuff/common/config/codefluff-config'

describe('model-listing', () => {
  const originalHome = process.env.HOME
  const originalUserProfile = process.env.USERPROFILE
  const testConfigDir = join(tmpdir(), 'model-listing-test')
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

  describe('listModelsForProvider', () => {
    test('returns error when provider not configured', async () => {
      overrideHome()
      writeConfig({ keys: {} })

      const result = await listModelsForProvider('nvidia-nim')
      expect(result.provider).toBe('nvidia-nim')
      expect(result.models).toEqual([])
      expect(result.error).toContain('No configuration found')
      restoreHome()
    })

    test('returns error when provider not found in config', async () => {
      overrideHome()
      writeConfig({
        keys: {
          openai: 'sk-123',
        },
      })

      const result = await listModelsForProvider('nvidia-nim')
      expect(result.provider).toBe('nvidia-nim')
      expect(result.models).toEqual([])
      expect(result.error).toContain('No configuration found')
      restoreHome()
    })

    test('returns known models for anthropic', async () => {
      overrideHome()
      writeConfig({
        keys: {
          anthropic: 'sk-ant-123',
        },
      })

      const result = await listModelsForProvider('anthropic')
      expect(result.provider).toBe('anthropic')
      expect(result.models.length).toBeGreaterThan(0)
      expect(result.models[0].id).toBeDefined()
      expect(result.error).toBeUndefined()
      restoreHome()
    })

    test('returns error for custom provider without baseURL', async () => {
      overrideHome()
      writeConfig({
        keys: {
          'my-custom-api': 'sk-123',
        },
      })

      const result = await listModelsForProvider('my-custom-api')
      expect(result.provider).toBe('my-custom-api')
      expect(result.models).toEqual([])
      expect(result.error).toContain('baseURL')
      restoreHome()
    })
  })

  describe('listAllModels', () => {
    test('lists models from all configured providers', async () => {
      overrideHome()
      writeConfig({
        keys: {
          anthropic: 'sk-ant-123',
          openai: 'sk-123',
        },
      })

      // Mock will fail for OpenAI API call, but we can check structure
      const results = await listAllModels()
      expect(results.length).toBe(2)
      expect(results.map((r) => r.provider)).toContain('anthropic')
      expect(results.map((r) => r.provider)).toContain('openai')
      restoreHome()
    })

    test('returns empty array when no providers configured', async () => {
      overrideHome()
      writeConfig({})

      const results = await listAllModels()
      expect(results).toEqual([])
      restoreHome()
    })
  })

  describe('formatModelList', () => {
    test('formats provider models correctly', () => {
      const results = [
        {
          provider: 'openai',
          models: [
            { id: 'gpt-4', name: 'GPT-4' },
            { id: 'gpt-3.5-turbo' },
          ],
        },
        {
          provider: 'anthropic',
          models: [{ id: 'claude-sonnet-4', name: 'Claude Sonnet 4' }],
        },
        {
          provider: 'custom',
          models: [],
          error: 'Connection failed',
        },
      ]

      const formatted = formatModelList(results)
      expect(formatted).toContain('OPENAI:')
      expect(formatted).toContain('gpt-4 (GPT-4)')
      expect(formatted).toContain('gpt-3.5-turbo')
      expect(formatted).toContain('ANTHROPIC:')
      expect(formatted).toContain('claude-sonnet-4 (Claude Sonnet 4)')
      expect(formatted).toContain('CUSTOM:')
      expect(formatted).toContain('Error: Connection failed')
    })

    test('handles empty models list', () => {
      const results = [
        {
          provider: 'empty',
          models: [],
        },
      ]

      const formatted = formatModelList(results)
      expect(formatted).toContain('EMPTY:')
      expect(formatted).toContain('No models found')
    })
  })
})
