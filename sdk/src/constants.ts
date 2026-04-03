import { env } from '@codebuff/common/env'

export const CODEBUFF_BINARY = 'codebuff'

let _mockServerUrl: string | undefined

/**
 * Override the website URL with a mock server URL.
 * Used by codefluff mode to redirect all backend API calls to a local stub server.
 */
export function setMockServerUrl(url: string): void {
  _mockServerUrl = url
}

/**
 * Get the current website URL. Returns the mock server URL if set,
 * otherwise falls back to the configured app URL.
 */
export function getWebsiteUrl(): string {
  return _mockServerUrl ?? env.NEXT_PUBLIC_CODEBUFF_APP_URL
}

export { IS_DEV, IS_TEST, IS_PROD } from '@codebuff/common/env'
