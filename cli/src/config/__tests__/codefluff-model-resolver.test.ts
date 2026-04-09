import { describe, expect, test, beforeEach, afterAll } from 'bun:test'
import { tmpdir } from 'os'
import { join } from 'path'
import { mkdirSync, writeFileSync, rmSync } from 'fs'

import {
  resolveModelForMode,
  resolveModelForModeSafe,
} from '../codefluff-model-resolver'
import { resetCodefluffConfigCache } from '@codebuff/common/config/codefluff-config'

describe('codefluff-model-resolver', () => {
  const originalHome = process.env.HOME
  const originalUserProfile = process.env.USERPROFILE
  const testConfigDir = join(tmpdir(), 'codefluff-resolver-test')
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

  describe('resolveModelForMode', () => {
    test('returns base model when no agentId provided', () => {
      overrideHome()
      writeConfig({
        mapping: {
          normal: {
            base: 'anthropic/claude-sonnet-4',
          },
        },
      })

      const model = resolveModelForMode('normal')
      expect(model).toBe('anthropic/claude-sonnet-4')
      restoreHome()
    })

    test('returns agent-specific model when configured', () => {
      overrideHome()
      writeConfig({
        mapping: {
          normal: {
            base: 'anthropic/claude-sonnet-4',
            'file-picker': 'google/gemini-2.5-flash-lite',
          },
        },
      })

      const model = resolveModelForMode('normal', 'file-picker')
      expect(model).toBe('google/gemini-2.5-flash-lite')
      restoreHome()
    })

    test('falls back to base when agent not specifically configured', () => {
      overrideHome()
      writeConfig({
        mapping: {
          normal: {
            base: 'anthropic/claude-sonnet-4',
            'file-picker': 'google/gemini-2.5-flash-lite',
          },
        },
      })

      const model = resolveModelForMode('normal', 'editor')
      expect(model).toBe('anthropic/claude-sonnet-4')
      restoreHome()
    })

    test('strips version suffix from agentId', () => {
      overrideHome()
      writeConfig({
        mapping: {
          normal: {
            base: 'anthropic/claude-sonnet-4',
            'file-picker': 'google/gemini-2.5-flash-lite',
          },
        },
      })

      const model = resolveModelForMode('normal', 'file-picker@1.0.0')
      expect(model).toBe('google/gemini-2.5-flash-lite')
      restoreHome()
    })

    test('throws when mode not configured', () => {
      overrideHome()
      writeConfig({
        mapping: {
          normal: {
            base: 'anthropic/claude-sonnet-4',
          },
        },
      })

      expect(() => resolveModelForMode('max')).toThrow('No model configured for mode "max"')
      restoreHome()
    })

    test('rejects config when base not configured', () => {
      overrideHome()
      writeConfig({
        mapping: {
          normal: {
            'file-picker': 'google/gemini-2.5-flash-lite',
          },
        },
      })

      expect(() => resolveModelForMode('normal', 'editor')).toThrow(
        'No model configured for mode "normal"',
      )
      restoreHome()
    })

    test('rejects config when agent not found and base missing', () => {
      overrideHome()
      writeConfig({
        mapping: {
          normal: {
            'file-picker': 'google/gemini-2.5-flash-lite',
          },
        },
      })

      expect(() => resolveModelForMode('normal', 'editor')).toThrow(
        'No model configured for mode "normal"',
      )
      restoreHome()
    })
  })

  describe('resolveModelForModeSafe', () => {
    test('returns model on success', () => {
      overrideHome()
      writeConfig({
        mapping: {
          normal: {
            base: 'anthropic/claude-sonnet-4',
          },
        },
      })

      const model = resolveModelForModeSafe('normal', 'file-picker')
      expect(model).toBe('anthropic/claude-sonnet-4')
      restoreHome()
    })

    test('throws with descriptive message on failure', () => {
      overrideHome()
      writeConfig({
        mapping: {
          normal: {
            base: 'anthropic/claude-sonnet-4',
          },
        },
      })

      expect(() => resolveModelForModeSafe('max', 'editor')).toThrow(
        'Codefluff model resolution failed for mode "max", agent "editor"'
      )
      restoreHome()
    })

    test('throws without agent ID in message when not provided', () => {
      overrideHome()
      writeConfig({
        mapping: {
          normal: {
            base: 'anthropic/claude-sonnet-4',
          },
        },
      })

      expect(() => resolveModelForModeSafe('max')).toThrow(
        'Codefluff model resolution failed for mode "max":'
      )
      restoreHome()
    })
  })
})
