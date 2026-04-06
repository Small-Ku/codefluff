import { existsSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
export const REPO_ROOT = resolve(__dirname, '../../..')

export function getCodefluffBinaryPath(): string {
  if (process.env.CODEFLUFF_BINARY) {
    return resolve(process.env.CODEFLUFF_BINARY)
  }
  const basePath = resolve(REPO_ROOT, 'cli/bin/codefluff')
  // On Windows, the binary has a .exe extension
  if (process.platform === 'win32' && existsSync(`${basePath}.exe`)) {
    return `${basePath}.exe`
  }
  return basePath
}

export function requireCodefluffBinary(): string {
  const binaryPath = getCodefluffBinaryPath()
  if (!existsSync(binaryPath)) {
    throw new Error(
      `Codefluff binary not found at ${binaryPath}. ` +
        'Build with: bun codefluff/cli/build.ts <version>',
    )
  }
  return binaryPath
}
