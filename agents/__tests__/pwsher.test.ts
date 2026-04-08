import { describe, expect, test } from 'bun:test'

import pwsher from '../pwsher'

import type { AgentState } from '../types/agent-definition'
import type { ToolResultOutput } from '../types/util-types'

describe('pwsher agent', () => {
  const createMockAgentState = (): AgentState => ({
    agentId: 'pwsher-test',
    runId: 'test-run',
    parentId: undefined,
    messageHistory: [],
    output: undefined,
    systemPrompt: '',
    toolDefinitions: {},
    contextTokenCount: 0,
  })

  describe('definition', () => {
    test('has correct id', () => {
      expect(pwsher.id).toBe('pwsher')
    })

    test('has display name', () => {
      expect(pwsher.displayName).toBe('Pwsher')
    })

    test('uses flash-lite model', () => {
      expect(pwsher.model).toBe('google/gemini-3.1-flash-lite-preview')
    })

    test('has output mode set to last_message', () => {
      expect(pwsher.outputMode).toBe('last_message')
    })

    test('does not include message history', () => {
      expect(pwsher.includeMessageHistory).toBe(false)
    })

    test('has run_terminal_command tool', () => {
      expect(pwsher.toolNames).toContain('run_terminal_command')
      expect(pwsher.toolNames).toHaveLength(1)
    })
  })

  describe('input schema', () => {
    test('requires command parameter', () => {
      const schema = pwsher.inputSchema
      const commandProp = schema?.params?.properties?.command
      expect(
        commandProp &&
          typeof commandProp === 'object' &&
          'type' in commandProp &&
          commandProp.type,
      ).toBe('string')
      expect(schema?.params?.required).toContain('command')
    })

    test('has optional timeout_seconds parameter', () => {
      const schema = pwsher.inputSchema
      const timeoutProp = schema?.params?.properties?.timeout_seconds
      expect(
        timeoutProp &&
          typeof timeoutProp === 'object' &&
          'type' in timeoutProp &&
          timeoutProp.type,
      ).toBe('number')
      expect(schema?.params?.required).not.toContain('timeout_seconds')
    })

    test('has optional rawOutput parameter', () => {
      const schema = pwsher.inputSchema
      const rawOutputProp = schema?.params?.properties?.rawOutput
      expect(
        rawOutputProp &&
          typeof rawOutputProp === 'object' &&
          'type' in rawOutputProp &&
          rawOutputProp.type,
      ).toBe('boolean')
      expect(schema?.params?.required).not.toContain('rawOutput')
    })

    test('has optional shell parameter', () => {
      const schema = pwsher.inputSchema
      const shellProp = schema?.params?.properties?.shell
      expect(
        shellProp &&
          typeof shellProp === 'object' &&
          'type' in shellProp &&
          shellProp.type,
      ).toBe('string')
      expect(schema?.params?.required).not.toContain('shell')
    })

    test('has prompt parameter', () => {
      expect(pwsher.inputSchema?.prompt?.type).toBe('string')
    })
  })

  describe('handleSteps', () => {
    test('returns error when no command provided', () => {
      const mockAgentState = createMockAgentState()
      const mockLogger = {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
      }

      const generator = pwsher.handleSteps!({
        agentState: mockAgentState,
        logger: mockLogger as any,
        params: {},
      })

      const result = generator.next()

      const toolCall = result.value as {
        toolName: string
        input: { output: string }
      }
      expect(toolCall.toolName).toBe('set_output')
      expect(toolCall.input.output).toContain('Error')
      expect(toolCall.input.output).toContain('command')
    })

    test('yields run_terminal_command with basic command', () => {
      const mockAgentState = createMockAgentState()
      const mockLogger = {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
      }

      const generator = pwsher.handleSteps!({
        agentState: mockAgentState,
        logger: mockLogger as any,
        params: { command: 'Get-ChildItem' },
      })

      const result = generator.next()

      expect(result.value).toEqual({
        toolName: 'run_terminal_command',
        input: {
          command: 'Get-ChildItem',
          shell: 'pwsh',
        },
      })
    })

    test('yields run_terminal_command with specific shell preference', () => {
      const mockAgentState = createMockAgentState()
      const mockLogger = {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
      }

      const generator = pwsher.handleSteps!({
        agentState: mockAgentState,
        logger: mockLogger as any,
        params: { command: 'Get-Process', shell: 'powershell' },
      })

      const result = generator.next()

      expect(result.value).toEqual({
        toolName: 'run_terminal_command',
        input: {
          command: 'Get-Process',
          shell: 'powershell',
        },
      })
    })

    test('falls back to powershell when pwsh is not found (stderr shape)', () => {
      const mockAgentState = createMockAgentState()
      const mockLogger = {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
      }

      const generator = pwsher.handleSteps!({
        agentState: mockAgentState,
        logger: mockLogger as any,
        params: { command: 'Get-ChildItem' },
      })

      const firstResult = generator.next()
      expect(firstResult.value).toEqual({
        toolName: 'run_terminal_command',
        input: {
          command: 'Get-ChildItem',
          shell: 'pwsh',
        },
      })

      // Must include exitCode !== 0 for fallback to trigger
      const mockErrorResult = {
        agentState: createMockAgentState(),
        toolResult: [
          {
            type: 'json' as const,
            value: {
              stdout: '',
              stderr:
                'PowerShell Core (pwsh) was requested but not found on this Windows system.',
              exitCode: 1,
            },
          },
        ],
        stepsComplete: true,
      }

      const secondResult = generator.next(mockErrorResult)
      expect(secondResult.value).toEqual({
        toolName: 'run_terminal_command',
        input: {
          command: 'Get-ChildItem',
          shell: 'powershell',
        },
      })
    })

    test('falls back to powershell when pwsh is not found (errorMessage shape)', () => {
      const mockAgentState = createMockAgentState()
      const mockLogger = {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
      }

      const generator = pwsher.handleSteps!({
        agentState: mockAgentState,
        logger: mockLogger as any,
        params: { command: 'Get-ChildItem' },
      })

      const firstResult = generator.next()
      expect(firstResult.value).toEqual({
        toolName: 'run_terminal_command',
        input: {
          command: 'Get-ChildItem',
          shell: 'pwsh',
        },
      })

      // Must include exitCode !== 0 for fallback to trigger
      const mockErrorResult = {
        agentState: createMockAgentState(),
        toolResult: [
          {
            type: 'json' as const,
            value: {
              command: 'Get-ChildItem',
              errorMessage:
                'PowerShell Core (pwsh) was requested but not found on this Windows system.',
              exitCode: 1,
            },
          },
        ],
        stepsComplete: true,
      }

      const secondResult = generator.next(mockErrorResult)
      expect(secondResult.value).toEqual({
        toolName: 'run_terminal_command',
        input: {
          command: 'Get-ChildItem',
          shell: 'powershell',
        },
      })
    })

    test('does not fallback when pwsh fails for other reasons (no explicit shell)', () => {
      const mockAgentState = createMockAgentState()
      const mockLogger = {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
      }

      const generator = pwsher.handleSteps!({
        agentState: mockAgentState,
        logger: mockLogger as any,
        params: { command: 'Get-ChildItem' },
      })

      const firstResult = generator.next()
      expect(firstResult.value).toEqual({
        toolName: 'run_terminal_command',
        input: {
          command: 'Get-ChildItem',
          shell: 'pwsh',
        },
      })

      const mockRuntimeErrorResult = {
        agentState: createMockAgentState(),
        toolResult: [
          {
            type: 'json' as const,
            value: {
              stdout: '',
              stderr: 'pwsh : Access is denied.',
              exitCode: 1,
            },
          },
        ],
        stepsComplete: true,
      }

      const secondResult = generator.next(mockRuntimeErrorResult)
      expect(secondResult.value).toBe('STEP')
    })

    test('does not fallback when explicit shell is specified (stderr not found)', () => {
      const mockAgentState = createMockAgentState()
      const mockLogger = {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
      }

      const generator = pwsher.handleSteps!({
        agentState: mockAgentState,
        logger: mockLogger as any,
        params: { command: 'Get-ChildItem', shell: 'pwsh' },
      })

      const firstResult = generator.next()
      expect(firstResult.value).toEqual({
        toolName: 'run_terminal_command',
        input: {
          command: 'Get-ChildItem',
          shell: 'pwsh',
        },
      })

      const mockErrorResult = {
        agentState: createMockAgentState(),
        toolResult: [
          {
            type: 'json' as const,
            value: {
              stdout: '',
              stderr: 'PowerShell Core (pwsh) was requested but not found',
              exitCode: 1,
            },
          },
        ],
        stepsComplete: true,
      }

      const secondResult = generator.next(mockErrorResult)
      expect(secondResult.value).toBe('STEP')
    })

    test('does not fallback when explicit shell is specified even if errorMessage indicates not found', () => {
      const mockAgentState = createMockAgentState()
      const mockLogger = {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
      }

      const generator = pwsher.handleSteps!({
        agentState: mockAgentState,
        logger: mockLogger as any,
        params: { command: 'Get-ChildItem', shell: 'pwsh' },
      })

      const firstResult = generator.next()
      expect(firstResult.value).toEqual({
        toolName: 'run_terminal_command',
        input: {
          command: 'Get-ChildItem',
          shell: 'pwsh',
        },
      })

      const mockNotFoundViaErrorMessage = {
        agentState: createMockAgentState(),
        toolResult: [
          {
            type: 'json' as const,
            value: {
              command: 'Get-ChildItem',
              errorMessage:
                'PowerShell Core (pwsh) was requested but not found on this Windows system.',
            },
          },
        ],
        stepsComplete: true,
      }

      const secondResult = generator.next(mockNotFoundViaErrorMessage)
      expect(secondResult.value).toBe('STEP')
    })

    test('yields run_terminal_command with timeout', () => {
      const mockAgentState = createMockAgentState()
      const mockLogger = {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
      }

      const generator = pwsher.handleSteps!({
        agentState: mockAgentState,
        logger: mockLogger as any,
        params: { command: 'Start-Sleep -Seconds 10', timeout_seconds: 60 },
      })

      const result = generator.next()

      expect(result.value).toEqual({
        toolName: 'run_terminal_command',
        input: {
          command: 'Start-Sleep -Seconds 10',
          shell: 'pwsh',
          timeout_seconds: 60,
        },
      })
    })

    test('yields set_output with raw result when rawOutput is true', () => {
      const mockAgentState = createMockAgentState()
      const mockLogger = {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
      }

      const generator = pwsher.handleSteps!({
        agentState: mockAgentState,
        logger: mockLogger as any,
        params: { command: 'echo hello', rawOutput: true },
      })

      generator.next()

      const mockToolResult = {
        agentState: createMockAgentState(),
        toolResult: [{ type: 'json' as const, value: { stdout: 'hello' } }],
        stepsComplete: true,
      }
      const result = generator.next(mockToolResult)

      const toolCall = result.value as {
        toolName: string
        input: { output: { stdout: string } }
        includeToolCall?: boolean
      }
      expect(toolCall.toolName).toBe('set_output')
      expect(toolCall.input.output).toEqual({ stdout: 'hello' })
      expect(toolCall.includeToolCall).toBe(false)
      expect(result.done).toBe(false)

      const final = generator.next()
      expect(final.done).toBe(true)
    })

    test('yields STEP for model analysis when rawOutput is false', () => {
      const mockAgentState = createMockAgentState()
      const mockLogger = {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
      }

      const generator = pwsher.handleSteps!({
        agentState: mockAgentState,
        logger: mockLogger as any,
        params: { command: 'Get-ChildItem', rawOutput: false },
      })

      generator.next()

      const mockToolResult = {
        agentState: createMockAgentState(),
        toolResult: [
          { type: 'json' as const, value: { stdout: 'file1.txt\nfile2.txt' } },
        ],
        stepsComplete: true,
      }
      const result = generator.next(mockToolResult)

      expect(result.value).toBe('STEP')
    })

    test('handles empty tool result gracefully', () => {
      const mockAgentState = createMockAgentState()
      const mockLogger = {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
      }

      const generator = pwsher.handleSteps!({
        agentState: mockAgentState,
        logger: mockLogger as any,
        params: { command: 'echo test', rawOutput: true },
      })

      generator.next()

      const result = generator.next({
        agentState: createMockAgentState(),
        toolResult: [] as ToolResultOutput[],
        stepsComplete: true,
      })

      const toolCall = result.value as {
        toolName: string
        input: { output: string }
      }
      expect(toolCall.toolName).toBe('set_output')
      expect(toolCall.input.output).toBe('')
    })

    test('handles string json tool result', () => {
      const mockAgentState = createMockAgentState()
      const mockLogger = {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
      }

      const generator = pwsher.handleSteps!({
        agentState: mockAgentState,
        logger: mockLogger as any,
        params: { command: 'echo test', rawOutput: true },
      })

      generator.next()

      const mockToolResult = {
        agentState: createMockAgentState(),
        toolResult: [{ type: 'json' as const, value: 'plain text output' }],
        stepsComplete: true,
      }
      const result = generator.next(mockToolResult)

      const toolCall = result.value as {
        toolName: string
        input: { output: string }
      }
      expect(toolCall.toolName).toBe('set_output')
      expect(toolCall.input.output).toBe('plain text output')
    })

    test('handleSteps can be serialized for sandbox execution', () => {
      const handleStepsString = pwsher.handleSteps!.toString()

      expect(handleStepsString).toMatch(/^function\*\s*\(/)

      const isolatedFunction = new Function(`return (${handleStepsString})`)()
      expect(typeof isolatedFunction).toBe('function')
    })
  })

  describe('system prompt', () => {
    test('contains PowerShell command analysis instructions', () => {
      expect(pwsher.systemPrompt).toContain('PowerShell')
      expect(pwsher.systemPrompt).toContain('command')
      expect(pwsher.systemPrompt).toContain('output')
    })

    test('contains concise description requirement', () => {
      expect(pwsher.systemPrompt).toContain('concise')
    })

    test('mentions PowerShell syntax', () => {
      expect(pwsher.systemPrompt).toContain('PowerShell syntax')
    })
  })

  describe('instructions prompt', () => {
    test('instructs not to use tools', () => {
      expect(pwsher.instructionsPrompt).toContain('Do not use any tools')
    })

    test('mentions analyzing command output', () => {
      expect(pwsher.instructionsPrompt).toContain('command')
      expect(pwsher.instructionsPrompt).toContain('output')
    })
  })
})
