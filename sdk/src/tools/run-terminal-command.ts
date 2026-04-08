import { spawn } from 'child_process'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

import {
  stripColors,
  truncateStringWithMessage,
} from '../../../common/src/util/string'
import { getSystemProcessEnv } from '../env'

import type { CodebuffToolOutput } from '../../../common/src/tools/list'

const COMMAND_OUTPUT_LIMIT = 50_000

// Common locations where Git Bash might be installed on Windows
const GIT_BASH_COMMON_PATHS = [
  'C:\\Program Files\\Git\\bin\\bash.exe',
  'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
  'C:\\Git\\bin\\bash.exe',
]

// WSL bash paths that are often unreliable (VM may not be running, quote escaping issues)
// These are checked last as a fallback only
const WSL_BASH_PATH_PATTERNS = [
  'system32',
  'windowsapps',
]

/**
 * Find bash executable on Windows.
 * Priority:
 * 1. CODEBUFF_GIT_BASH_PATH environment variable (user override)
 * 2. Common Git Bash installation locations (most reliable)
 * 3. Non-WSL bash in PATH (e.g., Git Bash added to PATH)
 * 4. WSL bash in PATH (last resort - System32, WindowsApps)
 * 
 * WSL bash is deprioritized because it can fail with cryptic errors when:
 * - The WSL VM is not running
 * - Quote/argument escaping issues between Windows and Linux
 * - UTF-16 encoding mismatches
 */
function findWindowsBash(env: NodeJS.ProcessEnv): string | null {
  // Check for user-specified path via environment variable
  const customPath = env.CODEBUFF_GIT_BASH_PATH
  if (customPath && fs.existsSync(customPath)) {
    return customPath
  }

  // Check common Git Bash installation locations first (most reliable)
  for (const commonPath of GIT_BASH_COMMON_PATHS) {
    if (fs.existsSync(commonPath)) {
      return commonPath
    }
  }

  // Fall back to bash.exe in PATH, but skip WSL paths initially
  const pathEnv = env.PATH || env.Path || ''
  const pathDirs = pathEnv.split(path.delimiter)
  const wslFallbackPaths: string[] = []
  
  for (const dir of pathDirs) {
    const dirLower = dir.toLowerCase()
    const isWslPath = WSL_BASH_PATH_PATTERNS.some(pattern => dirLower.includes(pattern))
    
    const bashPath = path.join(dir, 'bash.exe')
    if (fs.existsSync(bashPath)) {
      if (isWslPath) {
        // Save WSL paths for last resort
        wslFallbackPaths.push(bashPath)
      } else {
        // Non-WSL bash in PATH (e.g., Git Bash added to PATH)
        return bashPath
      }
    }
    
    // Also check for just 'bash' (without .exe)
    const bashPathNoExt = path.join(dir, 'bash')
    if (fs.existsSync(bashPathNoExt)) {
      if (isWslPath) {
        wslFallbackPaths.push(bashPathNoExt)
      } else {
        return bashPathNoExt
      }
    }
  }

  // Last resort: use WSL bash if nothing else is available
  // WSL can be unreliable (VM not running, quote escaping issues, UTF-16 encoding)
  if (wslFallbackPaths.length > 0) {
    return wslFallbackPaths[0]
  }

  return null
}

/**
 * Create an error message for Windows users when bash is not available.
 */
function createWindowsBashNotFoundError(): Error {
  return new Error(
    `Bash is required but was not found on this Windows system.

To fix this, you have several options:

1. Install Git for Windows (includes bash.exe):
   Download from: https://git-scm.com/download/win

2. Use WSL (Windows Subsystem for Linux):
   Run in PowerShell (Admin): wsl --install
   Then run Codebuff inside WSL.

3. Set a custom bash path:
   Set the CODEBUFF_GIT_BASH_PATH environment variable to your bash.exe location.
   Example: set CODEBUFF_GIT_BASH_PATH=C:\\path\\to\\bash.exe`,
  )
}

/**
 * Find PowerShell Core (pwsh) executable on Windows - STRICT.
 * Only returns pwsh, never falls back to Windows PowerShell.
 */
function findPwshStrict(env: NodeJS.ProcessEnv): { shell: string; shellArgs: string[] } | null {
  // Check for PowerShell Core (pwsh) in known locations
  const pwshPaths = [
    'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
    'C:\\Program Files\\PowerShell\\6\\pwsh.exe',
  ]
  for (const pwshPath of pwshPaths) {
    if (fs.existsSync(pwshPath)) {
      return { shell: pwshPath, shellArgs: ['-Command'] }
    }
  }

  // Check PATH for pwsh using the provided env
  const pathEnv = env.PATH || env.Path || ''
  const pathDirs = pathEnv.split(path.delimiter)
  for (const dir of pathDirs) {
    const pwshPath = path.join(dir, 'pwsh.exe')
    if (fs.existsSync(pwshPath)) {
      return { shell: pwshPath, shellArgs: ['-Command'] }
    }
  }

  return null
}

/**
 * Find Windows PowerShell (powershell.exe) executable on Windows - STRICT.
 * Only returns Windows PowerShell, never falls back to pwsh.
 */
function findWindowsPowerShellStrict(env: NodeJS.ProcessEnv): { shell: string; shellArgs: string[] } | null {
  // Check known Windows PowerShell locations
  const psPaths = [
    'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
    'C:\\Windows\\SysWOW64\\WindowsPowerShell\\v1.0\\powershell.exe',
  ]
  for (const psPath of psPaths) {
    if (fs.existsSync(psPath)) {
      return { shell: psPath, shellArgs: ['-Command'] }
    }
  }

  // Check PATH for powershell using the provided env
  const pathEnv = env.PATH || env.Path || ''
  const pathDirs = pathEnv.split(path.delimiter)
  for (const dir of pathDirs) {
    const psPath = path.join(dir, 'powershell.exe')
    if (fs.existsSync(psPath)) {
      return { shell: psPath, shellArgs: ['-Command'] }
    }
  }

  return null
}

/**
 * Find CMD executable on Windows.
 */
function findWindowsCmd(env: NodeJS.ProcessEnv): { shell: string; shellArgs: string[] } | null {
  const cmdPath = 'C:\\Windows\\System32\\cmd.exe'
  if (fs.existsSync(cmdPath)) {
    return { shell: cmdPath, shellArgs: ['/c'] }
  }

  // Check PATH using the provided env
  const pathEnv = env.PATH || env.Path || ''
  const pathDirs = pathEnv.split(path.delimiter)
  for (const dir of pathDirs) {
    const cmdPathInPath = path.join(dir, 'cmd.exe')
    if (fs.existsSync(cmdPathInPath)) {
      return { shell: cmdPathInPath, shellArgs: ['/c'] }
    }
  }

  return null
}

export function runTerminalCommand({
  command,
  process_type,
  cwd,
  timeout_seconds,
  env,
  shell: shellPreference,
}: {
  command: string
  process_type: 'SYNC' | 'BACKGROUND'
  cwd: string
  timeout_seconds: number
  env?: NodeJS.ProcessEnv
  shell?: 'bash' | 'powershell' | 'pwsh' | 'cmd'
}): Promise<CodebuffToolOutput<'run_terminal_command'>> {
  if (process_type === 'BACKGROUND') {
    throw new Error('BACKGROUND process_type not implemented')
  }

  return new Promise((resolve, reject) => {
    const isWindows = os.platform() === 'win32'
    const processEnv = {
      ...getSystemProcessEnv(),
      ...(env ?? {}),
    } as NodeJS.ProcessEnv

    let shell: string
    let shellArgs: string[]

    // Determine shell based on preference and platform
    const preferredShell = shellPreference || 'bash'

    if (isWindows) {
      switch (preferredShell) {
        case 'pwsh': {
          const pwshResult = findPwshStrict(processEnv)
          if (!pwshResult) {
            reject(new Error(
              `PowerShell Core (pwsh) was requested but not found on this Windows system.\n\n` +
              `To install PowerShell Core:\n` +
              `  winget install Microsoft.PowerShell\n` +
              `Or download from: https://github.com/PowerShell/PowerShell/releases\n\n` +
              `Alternatively, use shell: 'powershell' for Windows PowerShell (if available).`
            ))
            return
          }
          shell = pwshResult.shell
          shellArgs = pwshResult.shellArgs
          break
        }
        case 'powershell': {
          const psResult = findWindowsPowerShellStrict(processEnv)
          if (!psResult) {
            reject(new Error(
              `Windows PowerShell was requested but not found on this Windows system.\n\n` +
              `This is unexpected as Windows PowerShell is included with Windows.\n` +
              `Your PATH may be misconfigured.\n\n` +
              `Alternatively, use shell: 'pwsh' for PowerShell Core, or 'cmd' for Command Prompt.`
            ))
            return
          }
          shell = psResult.shell
          shellArgs = psResult.shellArgs
          break
        }
        case 'cmd': {
          const cmdResult = findWindowsCmd(processEnv)
          if (!cmdResult) {
            reject(new Error(
              `Command Prompt (cmd) was requested but not found on this Windows system.\n\n` +
              `This is unusual as cmd.exe should be available by default.`
            ))
            return
          }
          shell = cmdResult.shell
          shellArgs = cmdResult.shellArgs
          break
        }
        case 'bash':
        default: {
          const bashPath = findWindowsBash(processEnv)
          if (!bashPath) {
            reject(createWindowsBashNotFoundError())
            return
          }
          shell = bashPath
          shellArgs = ['-c']
          break
        }
      }
    } else {
      // Non-Windows: only bash is supported
      if (preferredShell !== 'bash') {
        reject(new Error(
          `Shell '${preferredShell}' is only supported on Windows. On this platform, only 'bash' is available.`
        ))
        return
      }
      shell = 'bash'
      shellArgs = ['-c']
    }

    // Resolve cwd to absolute path
    const resolvedCwd = path.resolve(cwd)

    const childProcess = spawn(shell, [...shellArgs, command], {
      cwd: resolvedCwd,
      env: processEnv,
      stdio: 'pipe',
    })

    let stdout = ''
    let stderr = ''
    let timer: NodeJS.Timeout | null = null
    let processFinished = false

    // Set up timeout if timeout_seconds >= 0 (infinite timeout when < 0)
    if (timeout_seconds >= 0) {
      timer = setTimeout(() => {
        if (!processFinished) {
          processFinished = true
          const success = childProcess.kill('SIGTERM')
          if (!success) {
            childProcess.kill('SIGKILL')
          }
          reject(
            new Error(`Command timed out after ${timeout_seconds} seconds`),
          )
        }
      }, timeout_seconds * 1000)
    }

    // Collect stdout
    childProcess.stdout.on('data', (data: Buffer) => {
      stdout += data.toString()
    })

    // Collect stderr
    childProcess.stderr.on('data', (data: Buffer) => {
      stderr += data.toString()
    })

    // Handle process completion
    childProcess.on('close', (exitCode) => {
      if (processFinished) return
      processFinished = true

      if (timer) {
        clearTimeout(timer)
      }

      // Truncate stdout to prevent excessive output
      const truncatedStdout = truncateStringWithMessage({
        str: stripColors(stdout),
        maxLength: COMMAND_OUTPUT_LIMIT,
        remove: 'MIDDLE',
      })

      const truncatedStderr = truncateStringWithMessage({
        str: stripColors(stderr),
        maxLength: COMMAND_OUTPUT_LIMIT,
        remove: 'MIDDLE',
      })

      // Keep stdout/stderr separate (preferred); some consumers rely on stderr directly.
      const combinedOutput = {
        command,
        stdout: truncatedStdout,
        ...(truncatedStderr ? { stderr: truncatedStderr } : {}),
        ...(exitCode !== null ? { exitCode } : {}),
      }

      resolve([{ type: 'json', value: combinedOutput }])
    })

    // Handle spawn errors
    childProcess.on('error', (error) => {
      if (processFinished) return
      processFinished = true

      if (timer) {
        clearTimeout(timer)
      }

      reject(new Error(`Failed to spawn command: ${error.message}`))
    })
  })
}
