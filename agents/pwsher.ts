import { publisher } from './constants'

import type {
  AgentDefinition,
  AgentStepContext,
} from './types/agent-definition'

const pwsher: AgentDefinition = {
  id: 'pwsher',
  publisher,
  model: 'google/gemini-3.1-flash-lite-preview',
  displayName: 'Pwsher',
  spawnerPrompt:
    'Runs a single terminal command using PowerShell and describes its output using an LLM. A lightweight PowerShell command executor for Windows.',

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
          description: 'PowerShell command to run',
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
        shell: {
          type: 'string',
          enum: ['powershell', 'pwsh'],
          description:
            "Which PowerShell variant to use. 'pwsh' = PowerShell Core (preferred), 'powershell' = Windows PowerShell. If not specified, tries pwsh first, then falls back to powershell if pwsh is not installed.",
        },
      },
      required: ['command'],
    },
  },
  outputMode: 'last_message',
  includeMessageHistory: false,
  toolNames: ['run_terminal_command'],
  systemPrompt: `You are an expert at analyzing the output of PowerShell commands on Windows.

Your job is to:
1. Review the PowerShell command and its output
2. Analyze the output based on what the user requested
3. Provide a clear, concise description of the relevant information

When describing command output:
- Use excerpts from the actual output when possible (especially for errors, key values, or specific data)
- Focus on the information the user requested
- Be concise but thorough
- If the output is very long, summarize the key points rather than reproducing everything
- Don't include any follow up recommendations, suggestions, or offers to help

Note: This agent runs commands via PowerShell. Commands should use PowerShell syntax where appropriate (e.g., Get-ChildItem instead of ls, Remove-Item instead of rm).`,
  instructionsPrompt: `The user has provided a PowerShell command to run and specified what information they want from the output.

Run the command using PowerShell and then describe the relevant information from the output, following the user's instructions about what to focus on.

Do not use any tools! Only analyze the output of the command.`,
  handleSteps: function* ({ params }: AgentStepContext) {
    const command = params?.command as string | undefined
    if (!command) {
      // Using console.error because agents run in a sandboxed environment without access to structured logger
      console.error('Pwsher agent: missing required "command" parameter')
      yield {
        toolName: 'set_output',
        input: { output: 'Error: Missing required "command" parameter' },
      }
      return
    }

    const timeout_seconds = params?.timeout_seconds as number | undefined
    const rawOutput = params?.rawOutput as boolean | undefined
    const shellPreference = params?.shell as 'powershell' | 'pwsh' | undefined

    // Determine shell preference
    const explicitShell = shellPreference !== undefined
    let shell: 'pwsh' | 'powershell' = shellPreference || 'pwsh'

    // Run the command via PowerShell
    const { toolResult } = yield {
      toolName: 'run_terminal_command',
      input: {
        command,
        shell,
        ...(timeout_seconds !== undefined && { timeout_seconds }),
      },
    }

    // Check if the result contains an error about pwsh not being found
    let finalToolResult = toolResult

    const getErrorTextFromToolResult = (toolResultOutput: any): string => {
      if (!toolResultOutput || toolResultOutput.type !== 'json') return ''

      const value = toolResultOutput.value
      if (typeof value === 'string') return value
      if (!value || typeof value !== 'object') return ''

      const errorMessage = (value as any).errorMessage
      const stderr = (value as any).stderr

      // Only check errorMessage and stderr - stdout should not be used for error detection
      // as successful commands may contain arbitrary text
      return [errorMessage, stderr].filter(Boolean).join('\n')
    }

    if (!explicitShell && shell === 'pwsh' && toolResult && toolResult.length > 0) {
      const firstResult = toolResult[0]
      const resultValue = firstResult?.type === 'json' ? firstResult.value : null

      // Only consider fallback if the command actually failed
      const exitCode = resultValue?.exitCode
      const hasFailed = exitCode !== undefined && exitCode !== 0

      if (hasFailed) {
        const errorText = toolResult
          .map(getErrorTextFromToolResult)
          .filter(Boolean)
          .join('\n')

        const errorLower = errorText.toLowerCase()

        // Check for specific "not found" error messages from the SDK
        // This is more precise than generic substring matching
        const isPwshNotFound =
          errorLower.includes('pwsh') &&
          errorLower.includes('was requested but not found')

        if (isPwshNotFound) {
          console.log('Pwsher: pwsh not found, falling back to Windows PowerShell')
          // Retry with Windows PowerShell
          const fallbackYield = yield {
            toolName: 'run_terminal_command',
            input: {
              command,
              shell: 'powershell',
              ...(timeout_seconds !== undefined && { timeout_seconds }),
            },
          }
          finalToolResult = fallbackYield.toolResult
        }
      }
    }

    if (rawOutput) {
      // Return the raw command output without summarization
      const result = finalToolResult?.[0]
      // Return any JSON value (object, string, number, etc.); fall back to the raw tool result
      const output = result?.type === 'json' ? result.value : result ?? ''
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

export default pwsher
