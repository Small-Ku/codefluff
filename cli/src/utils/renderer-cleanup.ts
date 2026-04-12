import { closeSync, openSync, writeSync } from 'fs'

import { resetTerminalTitle } from './terminal-title'

import type { CliRenderer } from '@opentui/core'

let renderer: CliRenderer | null = null
let handlersInstalled = false
let terminalStateReset = false

/**
 * Terminal escape sequences to reset terminal state.
 * These are written directly to the controlling terminal to ensure they're sent
 * even if the renderer is in a bad state.
 *
 * Sequences:
 * - \x1b[?1049l: Exit alternate screen buffer (restores main screen)
 * - \x1b[?1000l: Disable X10 mouse mode
 * - \x1b[?1002l: Disable button event mouse mode
 * - \x1b[?1003l: Disable any-event mouse mode (all motion tracking)
 * - \x1b[?1006l: Disable SGR extended mouse mode
 * - \x1b[?1004l: Disable focus reporting
 * - \x1b[?2004l: Disable bracketed paste mode
 * - \x1b[?25h: Show cursor (safety measure)
 */
export const TERMINAL_RESET_SEQUENCES =
  '\x1b[?1049l' + // Exit alternate screen buffer
  '\x1b[?1000l' + // Disable X10 mouse mode
  '\x1b[?1002l' + // Disable button event mouse mode
  '\x1b[?1003l' + // Disable any-event mouse mode (all motion)
  '\x1b[?1006l' + // Disable SGR extended mouse mode
  '\x1b[?1004l' + // Disable focus reporting
  '\x1b[?2004l' + // Disable bracketed paste mode
  '\x1b[?25h' // Show cursor

/**
 * Write escape sequences directly to the controlling terminal using multiple fallback strategies.
 * This is critical for compiled Bun binaries where async writes and certain fd access patterns
 * may silently fail before process.exit() terminates the process.
 *
 * Strategy 1: Write to raw fd 1 (stdout) — bypasses all Bun stream buffering.
 * Strategy 2: Open the controlling terminal device ('CON' on Windows, '/dev/tty' on Unix).
 * Strategy 3: Last resort — async process.stdout.write (better than nothing).
 */
export function writeToTty(sequence: string): void {
  // Strategy 1: Write directly to fd 1 (stdout) — bypasses all Bun stream buffering.
  // This works even in compiled binaries where process.stdout.fd may be undefined.
  try {
    writeSync(1, sequence)
    return
  } catch {
    // Fall through to next strategy
  }

  // Strategy 2: Try opening the controlling terminal device directly.
  // On Windows this is 'CON', on Unix it's '/dev/tty'.
  // Using literal 1 for O_WRONLY to avoid potential constants export bugs in Bun.
  const ttyPath = process.platform === 'win32' ? 'CON' : '/dev/tty'
  let fd: number | null = null
  try {
    fd = openSync(ttyPath, 1) // 1 = O_WRONLY
    writeSync(fd, sequence)
    return
  } catch {
    // Fall through to next strategy
  } finally {
    if (fd !== null) {
      try {
        closeSync(fd)
      } catch {
        // Ignore close errors
      }
    }
  }

  // Strategy 3: Last resort — async write (better than nothing)
  try {
    process.stdout.write(sequence)
  } catch {
    // Give up — at least we tried everything
  }
}

/**
 * Reset terminal state by writing escape sequences directly to the TTY.
 * This is called BEFORE renderer.destroy() to ensure sequences are sent
 * even if the renderer is in a bad state.
 *
 * This is especially important on Windows where signals like SIGTERM and SIGHUP
 * don't work, so we rely on the 'exit' event which is guaranteed to run.
 */
function resetTerminalState(): void {
  if (terminalStateReset) return
  terminalStateReset = true

  try {
    if (process.stdin.isTTY && process.stdin.setRawMode) {
      process.stdin.setRawMode(false)
    }
  } catch {
    // Ignore errors - stdin may already be closed
  }
  try {
    // Reset terminal title to default
    resetTerminalTitle()
    writeToTty(TERMINAL_RESET_SEQUENCES)
  } catch {
    // Ignore errors - terminal may already be in a bad state
  }
}

/**
 * Clean up the renderer by calling destroy().
 * This resets terminal state to prevent garbled output after exit.
 */
function cleanup(): void {
  // FIRST: Reset terminal state by writing escape sequences directly to the controlling TTY.
  // This ensures mouse mode, focus reporting, etc. are disabled even if
  // renderer.destroy() fails or doesn't fully clean up.
  resetTerminalState()

  if (renderer && !renderer.isDestroyed) {
    try {
      renderer.destroy()
    } catch {
      // Ignore errors during cleanup - we're exiting anyway
    }
    renderer = null
  }
}

/**
 * Clean up terminal state and exit synchronously. Call this directly instead of
 * process.kill(process.pid, 'SIGINT') which doesn't work reliably on Windows
 * in Bun compiled binaries.
 */
export function cleanExit(exitCode = 0): void {
  cleanup()
  process.exit(exitCode)
}

/**
 * Install process-level signal handlers to ensure terminal cleanup on all exit scenarios.
 * Call this once after creating the renderer in index.tsx.
 *
 * This handles:
 * - SIGTERM (kill)
 * - SIGHUP (terminal hangup)
 * - SIGINT (Ctrl+C)
 * - beforeExit / exit events
 * - uncaughtException / unhandledRejection
 *
 * Note: SIGKILL cannot be caught - it's an immediate termination signal.
 */
export function installProcessCleanupHandlers(cliRenderer: CliRenderer): void {
  if (handlersInstalled) return
  handlersInstalled = true
  renderer = cliRenderer

  const cleanupAndExit = (exitCode: number) => {
    cleanup()
    process.exit(exitCode)
  }

  // SIGTERM - Default kill signal (e.g., `kill <pid>`)
  process.on('SIGTERM', () => {
    cleanupAndExit(0)
  })

  // SIGHUP - Terminal hangup (e.g., closing the terminal window)
  process.on('SIGHUP', () => {
    cleanupAndExit(0)
  })

  // SIGINT - Ctrl+C
  process.on('SIGINT', () => {
    cleanupAndExit(0)
  })

  // beforeExit - Called when the event loop is empty and about to exit
  process.on('beforeExit', () => {
    cleanup()
  })

  // exit - Last chance to run synchronous cleanup code
  process.on('exit', () => {
    cleanup()
  })

  // uncaughtException - Safety net for unhandled errors
  process.on('uncaughtException', (error) => {
    cleanup() // Exit alt screen FIRST so error output is visible on the main screen
    try {
      console.error('Uncaught exception:', error)
    } catch {
      // Ignore logging errors
    }
    process.exit(1)
  })

  // unhandledRejection - Safety net for unhandled promise rejections
  process.on('unhandledRejection', (reason) => {
    cleanup() // Exit alt screen FIRST so error output is visible on the main screen
    try {
      console.error('Unhandled rejection:', reason)
    } catch {
      // Ignore logging errors
    }
    process.exit(1)
  })
}
