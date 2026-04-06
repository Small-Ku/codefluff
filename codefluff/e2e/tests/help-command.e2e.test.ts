import { execFileSync } from 'child_process'

import { afterEach, describe, expect, test } from 'bun:test'

import { CodefluffSession, requireCodefluffBinary } from '../utils'

const TEST_TIMEOUT = 60_000

describe('Codefluff: --help flag', () => {
  test('shows CLI usage information', () => {
    const binary = requireCodefluffBinary()
    const output = execFileSync(binary, ['--help'], {
      encoding: 'utf-8',
      timeout: 30_000,
      windowsHide: true,
    })

    // Should show the binary name
    expect(output.toLowerCase()).toContain('codefluff')

    // Should show usage info
    expect(output).toMatch(/usage|options|commands/i)
  })

  test('does not reference the paid Codebuff product branding', () => {
    const binary = requireCodefluffBinary()
    const output = execFileSync(binary, ['--help'], {
      encoding: 'utf-8',
      timeout: 30_000,
      windowsHide: true,
    })

    // The usage line should say "codefluff" not "Use: codebuff"
    expect(output).not.toMatch(/Use: codebuff\b/i)
  })
})

describe('Codefluff: /help slash command', () => {
  let session: CodefluffSession | null = null

  afterEach(async () => {
    if (session) {
      await session.stop()
      session = null
    }
  })

  test(
    'shows help content when /help is entered',
    async () => {
      const binary = requireCodefluffBinary()
      session = await CodefluffSession.start(binary)
      await session.waitForReady()

      await session.send('/help')
      const output = await session.capture(2)

      // Should show shortcuts section
      expect(output).toMatch(/shortcut|ctrl|esc/i)
    },
    TEST_TIMEOUT,
  )

  test(
    'does not show subscription commands in help',
    async () => {
      const binary = requireCodefluffBinary()
      session = await CodefluffSession.start(binary)
      await session.waitForReady()

      await session.send('/help')
      const output = await session.capture(2)

      // Codefluff should NOT show these paid/subscription commands
      // (Codefluff is BYOK — no account, credits, or subscription)
      expect(output).not.toContain('/subscribe')
      expect(output).not.toContain('/usage')
      expect(output).not.toContain('/credits')
    },
    TEST_TIMEOUT,
  )
})
