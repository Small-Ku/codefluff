import { afterEach, describe, expect, test } from 'bun:test'

import { CodefluffSession, requireCodefluffBinary } from '../utils'

const TEST_TIMEOUT = 60_000
const SESSION_HEIGHT = 40

/**
 * Commands that should be REMOVED in Codefluff.
 * Codefluff is a BYOK fork — no auth, subscription, ads, or feedback commands.
 * These must match CODEFLUFF_REMOVED_COMMAND_IDS in cli/src/data/slash-commands.ts
 * and CODEFLUFF_REMOVED_COMMANDS in cli/src/commands/command-registry.ts.
 */
const REMOVED_COMMANDS = [
  '/subscribe',
  '/usage',
  '/credits', // alias of usage
  '/ads:enable',
  '/ads:disable',
  '/connect:claude',
  '/connect',
  '/login',
  '/logout',
  '/refer-friends',
  '/agent:gpt-5',
  '/feedback',
  '/publish',
]

/**
 * Commands that should be KEPT in Codefluff.
 * Only includes commands reliably visible in the initial autocomplete viewport.
 */
const KEPT_COMMANDS = [
  '/help',
  '/new',
  '/history',
  '/bash',
  '/theme:toggle',
  '/init',
  '/image',
  '/exit',
]

describe('Codefluff: Slash Commands', () => {
  let session: CodefluffSession | null = null

  afterEach(async () => {
    if (session) {
      await session.stop()
      session = null
    }
  })

  test(
    'slash command menu does not show removed commands',
    async () => {
      const binary = requireCodefluffBinary()
      session = await CodefluffSession.start(binary, {
        waitSeconds: 5,
        height: SESSION_HEIGHT,
      })

      // Type "/" to trigger the slash command autocomplete menu
      await session.sendKey('/')
      const output = await session.capture(4)

      // Removed commands should NOT appear in the autocomplete menu
      for (const cmd of REMOVED_COMMANDS) {
        const cmdId = cmd.slice(1)
        expect(output).not.toContain(cmdId)
      }
    },
    TEST_TIMEOUT,
  )

  test(
    'slash command menu shows kept commands',
    async () => {
      const binary = requireCodefluffBinary()
      session = await CodefluffSession.start(binary, {
        waitSeconds: 5,
        height: SESSION_HEIGHT,
      })

      // Type "/" to trigger the slash command autocomplete menu
      await session.sendKey('/')
      const output = await session.capture(4)

      // Kept commands SHOULD appear in the autocomplete menu
      for (const cmd of KEPT_COMMANDS) {
        const cmdId = cmd.slice(1)
        expect(output).toContain(cmdId)
      }
    },
    TEST_TIMEOUT,
  )

  // Note: Mode commands (mode:max, mode:default, etc.) ARE kept in Codefluff.
  // Only Freebuff strips mode commands. Codefluff retains the full feature set.
})
