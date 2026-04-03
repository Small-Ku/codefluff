#!/usr/bin/env bun

/**
 * Codefluff CLI build script.
 *
 * Wraps the existing CLI build-binary.ts with CODEFLUFF_MODE=true
 * to produce a local BYOK variant of the Codebuff CLI.
 *
 * Usage:
 *   bun codefluff/cli/build.ts <version>
 *
 * Example:
 *   bun codefluff/cli/build.ts 1.0.0
 */

import { spawnSync } from 'child_process'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(__dirname, '..', '..')

const version = process.argv[2]
if (!version) {
  console.error('Usage: bun codefluff/cli/build.ts <version>')
  process.exit(1)
}

console.log(`Building Codefluff v${version}...`)

const result = spawnSync(
  'bun',
  ['cli/scripts/build-binary.ts', 'codefluff', version],
  {
    cwd: repoRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      CODEFLUFF_MODE: 'true',
    },
  },
)

if (result.status !== 0) {
  console.error('Codefluff build failed')
  process.exit(result.status ?? 1)
}

console.log(`✅ Codefluff v${version} built successfully`)
