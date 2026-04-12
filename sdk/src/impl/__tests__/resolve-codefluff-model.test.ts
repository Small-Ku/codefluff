import { describe, expect, test, beforeEach, afterAll } from 'bun:test'
import { tmpdir } from 'os'
import { join } from 'path'
import { mkdirSync, writeFileSync, rmSync } from 'fs'

import {
  resolveCodefluffModel,
  resetCodefluffConfigCache,
} from '../model-provider'
import { resetCodefluffConfigCache as resetCommonCache } from '@codebuff/common/config/codefluff-config'

describe('resolveCodefluffModel', () => {
  const originalHome = process.env.HOME
  const originalUserProfile = process.env.USERPROFILE
  const originalCodefluffMode = process.env.CODEFLUFF_MODE
  const testConfigDir = join(tmpdir(), 'sdk-resolver-test')
  const testConfigPath = join(
    testConfigDir,
    '.config',
    'codefluff',
    'config.json',
  )

  function writeConfig(obj: unknown) {
    mkdirSync(join(testConfigDir, '.config', 'codefluff'), { recursive: true })
    writeFileSync(testConfigPath, JSON.stringify(obj))
  }

  function overrideHome() {
    process.env.HOME = testConfigDir
    delete process.env.USERPROFILE
    process.env.CODEFLUFF_MODE = 'true'
    resetCodefluffConfigCache()
    resetCommonCache()
  }

  function restoreHome() {
    process.env.HOME = originalHome
    if (originalUserProfile) process.env.USERPROFILE = originalUserProfile
    if (originalCodefluffMode !== undefined) {
      process.env.CODEFLUFF_MODE = originalCodefluffMode
    } else {
      delete process.env.CODEFLUFF_MODE
    }
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

  test('returns null when not in codefluff mode', () => {
    process.env.HOME = testConfigDir
    delete process.env.USERPROFILE
    delete process.env.CODEFLUFF_MODE
    resetCodefluffConfigCache()
    resetCommonCache()

    writeConfig({
      mapping: {
        normal: {
          base: 'anthropic/claude-sonnet-4',
        },
      },
    })

    const model = resolveCodefluffModel('normal')
    expect(model).toBeNull()
    restoreHome()
  })

  test('returns null when mode not configured', () => {
    overrideHome()
    writeConfig({
      mapping: {
        normal: {
          base: 'anthropic/claude-sonnet-4',
        },
      },
    })

    const model = resolveCodefluffModel('max')
    expect(model).toBeNull()
    restoreHome()
  })

  test('returns base model when no agentId provided', () => {
    overrideHome()
    writeConfig({
      mapping: {
        normal: {
          base: 'anthropic/claude-sonnet-4',
        },
      },
    })

    const model = resolveCodefluffModel('normal')
    expect(model).toBe('anthropic/claude-sonnet-4')
    restoreHome()
  })

  test('returns null when base not configured', () => {
    overrideHome()
    writeConfig({
      mapping: {
        normal: {
          'file-picker': 'google/gemini-2.5-flash-lite',
        },
      },
    })

    const model = resolveCodefluffModel('normal', 'editor')
    expect(model).toBeNull()
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

    const model = resolveCodefluffModel('normal', 'file-picker')
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

    const model = resolveCodefluffModel('normal', 'editor')
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

    const model = resolveCodefluffModel('normal', 'file-picker@1.0.0')
    expect(model).toBe('google/gemini-2.5-flash-lite')
    restoreHome()
  })

  test('returns base model when agentId is empty string', () => {
    overrideHome()
    writeConfig({
      mapping: {
        normal: {
          base: 'anthropic/claude-sonnet-4',
        },
      },
    })

    const model = resolveCodefluffModel('normal', '')
    expect(model).toBe('anthropic/claude-sonnet-4')
    restoreHome()
  })
})
