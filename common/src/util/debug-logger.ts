/**
 * Debug logger for Codefluff
 * Logs to debug/cli.jsonl when CODEFLUFF_DEBUG=true
 * This allows tree-shaking in production builds when not enabled
 */
import { appendFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'

const CODEFLUFF_DEBUG = process.env.NEXT_PUBLIC_CB_ENVIRONMENT === 'dev'

const DEBUG_LOG_DIR = process.env.CODEFLUFF_DEBUG_LOG_DIR || process.cwd()

/**
 * Write a debug log entry to debug/cli.jsonl
 * @param level - Log level: DEBUG, WARN, INFO, ERROR
 * @param msg - Log message
 * @param data - Optional data object
 */
export function logDebug(
  level: 'DEBUG' | 'WARN' | 'INFO' | 'ERROR',
  msg: string,
  data?: Record<string, unknown>,
): void {
  if (!CODEFLUFF_DEBUG) return

  try {
    const logEntry = JSON.stringify({
      level,
      timestamp: new Date().toISOString(),
      msg,
      ...(data ? { data } : {}),
    })

    const logDir = join(DEBUG_LOG_DIR, 'debug')
    if (!existsSync(logDir)) {
      mkdirSync(logDir, { recursive: true })
    }

    const logPath = join(logDir, 'cli.jsonl')
    appendFileSync(logPath, logEntry + '\n')
  } catch {
    // Ignore write errors
  }
}

/**
 * Check if debug logging is enabled
 */
export function isDebugEnabled(): boolean {
  return CODEFLUFF_DEBUG
}
