/**
 * Shared codefluff mode detection and setup.
 *
 * This module centralizes codefluff-specific initialization so it runs exactly
 * once per process, eliminating the previous double mock-server startup bug.
 */

import { getSdkEnv } from '../env'

let _setupComplete = false

/**
 * Start the codefluff mock server and redirect SDK API calls to it.
 * Safe to call multiple times — subsequent calls are no-ops.
 */
export async function ensureCodefluffSetup(): Promise<void> {
  if (_setupComplete) return

  const { startCodefluffMockServer } = await import('./codefluff-mock-server')
  const { setMockServerUrl } = await import('../constants')
  const handle = await startCodefluffMockServer()
  setMockServerUrl(handle.url)
  _setupComplete = true
}

export function isCodefluffMode(): boolean {
  return getSdkEnv().CODEFLUFF_MODE === 'true'
}
