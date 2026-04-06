import { execFileSync } from 'child_process'

import { describe, expect, test } from 'bun:test'

import { requireCodefluffBinary } from '../utils'

describe('Codefluff: --version', () => {
  test('outputs a version string', () => {
    const binary = requireCodefluffBinary()
    const output = execFileSync(binary, ['--version'], {
      encoding: 'utf-8',
      timeout: 30_000,
      windowsHide: true,
    }).trim()

    // Should contain a semver-like version (e.g. "0.0.0-dev" or "1.0.0")
    expect(output).toMatch(/\d+\.\d+\.\d+/)
  })

  test('exits with code 0', () => {
    const binary = requireCodefluffBinary()
    // execFileSync throws on non-zero exit codes, so if this doesn't throw, it exited 0
    execFileSync(binary, ['--version'], { encoding: 'utf-8', timeout: 10_000 })
  })
})
