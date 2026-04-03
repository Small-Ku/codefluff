#!/usr/bin/env node

const fs = require('fs')
const os = require('os')
const path = require('path')

// Clean up old binary to force fresh download on next launch
const binaryPath = path.join(
  os.homedir(),
  '.config',
  'manicode',
  process.platform === 'win32' ? 'codefluff.exe' : 'codefluff',
)

try {
  fs.unlinkSync(binaryPath)
} catch (e) {
  /* ignore if file doesn't exist */
}

console.log('\n')
console.log('⚡ Welcome to Codefluff!')
console.log('\n')
console.log('To get started:')
console.log('  1. Create a config file at ~/.config/codefluff/config.json')
console.log('  2. Add your API keys and model mappings')
console.log('  3. cd to your project directory')
console.log('  4. Run: codefluff')
console.log('\n')
console.log('Example config:')
console.log('  {')
console.log('    "keys": { "openrouter": "sk-or-..." },')
console.log('    "mapping": {')
console.log('      "normal": {')
console.log('        "agent": "anthropic/claude-sonnet-4",')
console.log('        "file-requests": "anthropic/claude-3.5-haiku",')
console.log('        "check-new-files": "anthropic/claude-sonnet-4"')
console.log('      }')
console.log('    },')
console.log('    "defaultMode": "normal"')
console.log('  }')
console.log('\n')
console.log('For more information, visit: https://codebuff.com/docs')
console.log('\n')
