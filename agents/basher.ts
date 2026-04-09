import { publisher } from './constants'

import type {
  AgentDefinition,
  AgentStepContext,
} from './types/agent-definition'

const basher: AgentDefinition = {
  id: 'basher',
  publisher,
  model: 'google/gemini-3.1-flash-lite-preview',
  displayName: 'Basher',
  spawnerPrompt:
    'Runs a single terminal command and describes its output using an LLM. A lightweight shell command executor.',

  inputSchema: {
    prompt: {
      type: 'string',
      description:
        'What information from the command output is desired. Be specific about what to look for or extract.',
    },
    params: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'Terminal command to run',
        },
        shell: {
          type: 'string',
          enum: ['bash', 'pwsh', 'powershell', 'cmd'],
          description:
            "Shell to use for command execution. If omitted, run_terminal_command default applies.",
        },
        timeout_seconds: {
          type: 'number',
          description: 'Set to -1 for no timeout. Default 30',
        },
        rawOutput: {
          type: 'boolean',
          description:
            'If true, returns the full command output without summarization. Defaults to false.',
        },
      },
      required: ['command'],
    },
  },
  outputMode: 'last_message',
  includeMessageHistory: false,
  toolNames: ['run_terminal_command'],
  systemPrompt: `You are an expert at analyzing the output of a terminal command.

Your job is to:
1. Review the terminal command and its output
2. Analyze the output based on what the user requested
3. Provide a clear, concise description of the relevant information

When describing command output:
- Use excerpts from the actual output when possible (especially for errors, key values, or specific data)
- Focus on the information the user requested
- Be concise but thorough
- If the output is very long, summarize the key points rather than reproducing everything
- Don't include any follow up recommendations, suggestions, or offers to help`,
  instructionsPrompt: `The user has provided a command to run and specified what information they want from the output.

Run the command and then describe the relevant information from the output, following the user's instructions about what to focus on.

Do not use any tools! Only analyze the output of the command.`,
  handleSteps: function* ({ params }: AgentStepContext) {
    const command = params?.command as string | undefined
    if (!command) {
      // Using console.error because agents run in a sandboxed environment without access to structured logger
      console.error('Basher agent: missing required "command" parameter')
      yield {
        toolName: 'set_output',
        input: { output: 'Error: Missing required "command" parameter' },
      }
      return
    }

    const timeout_seconds = params?.timeout_seconds as number | undefined
    const rawOutput = params?.rawOutput as boolean | undefined
    const shell = params?.shell as 'bash' | 'powershell' | 'pwsh' | 'cmd' | undefined

    const explicitShell = shell !== undefined

    const buildRunToolCall = (
      shellOverride?: 'bash' | 'powershell' | 'pwsh' | 'cmd',
    ) =>
      ({
        toolName: 'run_terminal_command',
        input: {
          command,
          ...(shellOverride ? { shell: shellOverride } : {}),
          ...(timeout_seconds !== undefined && { timeout_seconds }),
        },
      }) as const

    const getErrorTextFromToolResult = (toolResultOutput: any): string => {
      if (!toolResultOutput || toolResultOutput.type !== 'json') return ''

      const value = toolResultOutput.value
      if (typeof value === 'string') return value
      if (!value || typeof value !== 'object') return ''

      const errorMessage = (value as any).errorMessage
      const stderr = (value as any).stderr

      // Only check errorMessage and stderr. stdout can contain arbitrary text.
      return [errorMessage, stderr].filter(Boolean).join('\n')
    }

    const shouldFallbackToWindowsPowerShell = (toolResult: any): boolean => {
      if (!toolResult || !Array.isArray(toolResult) || toolResult.length === 0)
        return false

      const firstResult = toolResult[0]
      const resultValue = firstResult?.type === 'json' ? firstResult.value : null

      const exitCode = resultValue?.exitCode
      const hasFailed = exitCode !== undefined && exitCode !== 0
      if (!hasFailed) return false

      const errorText = toolResult
        .map(getErrorTextFromToolResult)
        .filter(Boolean)
        .join('\n')

      const errorLower = errorText.toLowerCase()

      // Match the SDK's "pwsh was requested but not found" error.
      return (
        errorLower.includes('pwsh') &&
        errorLower.includes('was requested but not found')
      )
    }

    // First attempt
    let toolResult: import('./types/util-types').ToolResultOutput[] | undefined

    if (explicitShell) {
      const { toolResult: result } = yield buildRunToolCall(shell)
      toolResult = result
    } else {
      // Prefer PowerShell on Windows, but keep bash defaults on other platforms.
      const isWindows = process.platform === 'win32'

      const { toolResult: result } = yield buildRunToolCall(
        isWindows ? 'pwsh' : undefined,
      )
      toolResult = result

      if (isWindows && shouldFallbackToWindowsPowerShell(result)) {
        const { toolResult: fallbackToolResult } = yield buildRunToolCall(
          'powershell',
        )
        toolResult = fallbackToolResult
      }
    }

    if (rawOutput) {
      const first = toolResult?.[0]
      const output = first?.type === 'json' ? first.value : first ?? ''
      yield {
        toolName: 'set_output',
        input: { output },
        includeToolCall: false,
      }
      return
    }

    // Let the model analyze and describe the output
    yield 'STEP'
  },
}

export default basher
